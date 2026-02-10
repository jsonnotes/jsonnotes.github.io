import { fromjson, hash128, hashData, tojson, top, validate, expandLinks, type Jsonable, type Hash, type NoteData } from "@jsonview/core";
import type { Api } from "./dbconn.ts";
export { openrouterCall } from "./openrouter.ts";

export const dbname = "jsonview"
export const server = "maincloud"



export function funCache  <Arg extends Jsonable, T extends Jsonable> (fn: (arg:Arg)=> T) :{get: (arg: Arg)=>T, has: (arg: Arg)=>boolean, set: (arg: Arg, res: T)=>T};
export function funCache  <Arg extends Jsonable, T extends Promise<Jsonable>> (fn: (arg:Arg)=> T): {get: (arg: Arg)=> T, has: (arg: Arg)=>boolean, set: (arg: Arg, res: Jsonable)=>T};
export function funCache <Arg extends Jsonable, T extends Jsonable> (fn :(arg:Arg)=> T | Promise<T>) {
  const map = new Map<string, T>();
  const fkey = hash128(fn.toString())
  const ls = typeof localStorage !== "undefined" ? localStorage : null
  return {
    has: (arg:Arg) => map.has(tojson(arg)) || localStorage.hasItem("funcache:" + hash128(fkey, tojson(arg))),
    set: (arg:Arg, res:T) => {localStorage.setItem("funcache:" + hash128(fkey, tojson(arg)), tojson(res)); map.set(tojson(arg), res); return res},
    get:(arg:Arg)=>{
    const key = tojson(arg);
    if (map.has(key)) return map.get(key)
    const storekey = "funcache:" + hash128(fkey, key)
    const stored = ls?.getItem(storekey)
    if (stored != null){
      let res = fromjson(stored) as T
      map.set(key,res)
      return res
    }
    let setres = (res:T) => { ls?.setItem(storekey, tojson(res)); map.set(key, res); return res }
    let res = fn(arg)
    return (res instanceof Promise) ? res.then(setres) : setres(res)
  }}
}

export const jsonOverview = (json: Jsonable) => {
  let full = ""
  let table = (data:Jsonable, d:number)=> {
    let ws = "  ".repeat(d)
    if (typeof data == "string") {
      const isBigString = data.length > 60 || data.includes('\n');
      if (isBigString) {
        const lines = data.split('\n');
        full += "\n" + ws + "`";
        lines.forEach((line, i) => {
          full += (i === 0 ? "" : "\n" + ws) + line;
        });
        full += "`";
      } else {
        full += " " + data;
      }
    } else if (typeof data == "number") {
      full += " " + data;
    } else if (typeof data == "object") {
      Object.entries(data).forEach(([k,v]) => {
        full += "\n" + ws + k + ":"
        table(v, d+1)
      })
    }
  }
  table(json, 0)
  return full
}

// --- Data fetching helpers ---

export type SchemaEntry = { hash: string; title: string; count?: number }

export const fetchSchemas = async (api: Api): Promise<SchemaEntry[]> => {
  const topHash = hashData(top)
  const [schemasRes, countsRes] = await Promise.all([
    api.sql(`select hash, data from note where schemaHash = '${topHash}'`),
    api.sql("select schemaHash from note")
  ])
  const counts = new Map<string, number>()
  countsRes.rows.forEach(row => {
    const h = String(row[0])
    counts.set(h, (counts.get(h) || 0) + 1)
  })
  return schemasRes.rows.map(row => {
    let title = ""
    try { title = JSON.parse(String(row[1] ?? ""))?.title ?? "" } catch {}
    const h = String(row[0] ?? "")
    return { hash: h, title, count: counts.get(h) || 0 }
  })
}

export const fetchNotes = async (api: Api, limit = 200): Promise<SchemaEntry[]> =>
  api.sql(`select hash, data from note limit ${limit}`).then(r =>
    r.rows.map(row => {
      let title = ""
      try { title = JSON.parse(String(row[1] ?? ""))?.title ?? "" } catch {}
      return { hash: String(row[0] ?? ""), title }
    })
  )

// --- Note helpers ---

export const validateNote = async (api: Api, note: NoteData) => {
  const resolve = (ref: Hash) => api.getNote(ref).then(n => n.data)
  const rawData = typeof note.data === "string" ? JSON.parse(note.data) : note.data
  const rawSchema = (await api.getNote(note.schemaHash)).data
  return validate(await expandLinks(rawData, resolve), await expandLinks(rawSchema, resolve))
}

export const notePreview = async (api: Api, hash: Hash): Promise<string> => {
  const note = await api.getNote(hash)
  const data: any = note.data
  if (data?.title) return String(data.title)
  const preview = (typeof data === "string" ? data : JSON.stringify(data)).replace(/\n/g, " ")
  if (typeof data === "string" || typeof data === "number") return preview.slice(0, 20)
  return `#${hash.slice(0, 8)}`
}

export const noteOverview = async (api: Api, hash: Hash): Promise<string> => {
  const note = await api.getNote(hash)
  return jsonOverview(note.data)
}

