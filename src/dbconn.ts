import { Hash, hashData, Jsonable, NoteData, Note, tojson, validate, top, fromjson, schemas, expandLinks, Ref, matchRef } from "../spacetimedb/src/notes";
import { p, popup, routeLink, span } from "./html";
import { hash128 } from "../spacetimedb/src/hash";


const DBNAME = "jsonview"

const dbPresets: Record<string, string> = {
  local: "http://localhost:3000",
  prod: "https://maincloud.spacetimedb.com",
};

const loadDbPreset = () => {
  const fromQuery = new URLSearchParams(window.location.search).get("db");
  const fromStore = localStorage.getItem("db_preset");
  if (fromQuery && dbPresets[fromQuery]) {
    localStorage.setItem("db_preset", fromQuery);
    return fromQuery;
  }
  return fromStore && dbPresets[fromStore] ? fromStore : "local";
};

const DB_PRESET = loadDbPreset();
const db_url = dbPresets[DB_PRESET];

let access_token: string | null = localStorage.getItem("access_token");

const req = (path: string, method: string, body: string | null = null) =>
  fetch(`${db_url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}) },
    body,
  });

export const query_data = async (sql: string) : Promise<{names:string[], rows:any[]}> => {
  const text = await (await req(`/v1/database/${DBNAME}/sql`, "POST", sql)).text();
  try {

    const data = JSON.parse(text);
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this");
    const { schema, rows } = data[0];
    return { names: schema.elements.map((e) => e.name.some), rows };
  } catch (e: any) {
    console.log(text)
    console.error(e);
    popup(p(text));
    return { names: ["error"], rows: [e.message] };
  }
};

const FunCache = <X,Y> (fn: (x:X) => Promise<Y>) : ((x:X)=>Promise<Y>) => {
  const HotCache = new Map<string,Y>();
  const fkey = hash128(fn.toString() + ":cached:" + db_url)
  return async (x:X) => {
    const lkey = fkey + JSON.stringify(x)
    if (HotCache.has(lkey)) return HotCache.get(lkey)!
    const raw = localStorage.getItem(lkey)
    if (raw) {
      const res = JSON.parse(raw)
      HotCache.set(lkey, res)
      return res
    }
    const res = await fn(x)
    localStorage.setItem(lkey, JSON.stringify(res))
    HotCache.set(lkey, res)
    return res 
  }
}

export const addNote = async (schema: Ref, data: Jsonable)=>{
  let schemaHash = await getHash(schema)
  const res = await req(`/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify({
    schemaHash,
    data: tojson(data)
  }));
  if (!res.ok) throw new Error(await res.text())
  return "#" + hashData({schemaHash, data}) as Ref
}

export const getNoteRaw = FunCache(async (ref:Ref) => {
  const data = await query_data(matchRef(ref, 
    n => `select * from note where id = ${n}`,
    h => `select * from note where hash = '${h}'`
  ))
  const row = data.rows[0];
  if (!row) throw new Error("note not found")
  return Object.fromEntries(data.names.map((n,i)=>[n, row[i]])) as Note
})

export const getId = (ref: Ref) => getNoteRaw(ref).then((n)=>n.id)
export const getHash = (ref: Ref) => getNoteRaw(ref).then(n=>n.hash)
export const getSchemaId = (ref: Ref) => getNoteRaw(ref).then(n=>n.schemaId)


export const getNote = FunCache(async (ref: Ref) =>{
  const nt = await getNoteRaw(ref)
  return {
    schemaHash: await getHash(nt.schemaId),
    data: fromjson(nt.data)
  } as NoteData
})

if (access_token === null) req("/v1/identity", "POST").then((res) => res.json()).then((text) => {access_token = text.token; });
export const validateNote = async (note: NoteData) => {
  try {
    const resolve = (ref) => getNote(ref).then(n => n.data)
    const rawData = typeof note.data === "string" ? JSON.parse(note.data) : note.data;
    const rawSchema = (await getNote(note.schemaHash)).data;
    return validate(await expandLinks(rawData, resolve), await expandLinks(rawSchema, resolve));
  } catch (e: any) {
    throw new Error(e.message || e);
  }
}


export const notePreview = (ref) => getNote(ref).then(async note=>{
  let data: any = note.data
  let preview = typeof data === "string" ? data : JSON.stringify(data);
  return `#${await getId(ref)}` + (data?.title ? `:${data.title}` : (typeof data == 'string' || typeof data == 'number') ? `:${preview.slice(0,20)}`: "")
})

export const noteLink = (
  ref: Ref,
  label?: string,
  args = {},
) => {
  let el = span(label ?? `#${ref}`)
  const hrefRef = typeof ref === "string" ? ref.replace(/^#/, "") : String(ref);
  if (label === undefined) notePreview(ref).then(pr => el.innerHTML = pr)
  return routeLink(`/${hrefRef}`, el, args)
}
