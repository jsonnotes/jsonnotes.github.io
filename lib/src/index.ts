import { expandLinks, fromjson, hashData, tojson, top, validate, type Hash, type Jsonable, type NoteData } from "@jsonview/core";
import { callProcedure, getNote, searchNotes, SERVER, sql, type ServerName } from "./dbconn.ts";
import {jsonOverview, newestRows, funCache, type SchemaEntry} from "./helpers.ts";
import { splitRefs, type RefToken } from "./refs.ts";

export { jsonOverview, newestRows, funCache, splitRefs, type RefToken, type SchemaEntry };
export { openrouterCall, DEFAULT_OPENROUTER_MODEL, type OpenRouterConfig } from "./openrouter.ts";
export { renderDom, type VDom, type UPPER, HTML } from "./views.ts";
export { drawDag, type DagNode, type DagConfig } from "./dag.ts";




export const notePreview = async (hash: Hash): Promise<string> => {
  const note = await getNote(hash)
  const data: any = note.data
  if (data?.title) return String(data.title)
  const preview = (typeof data === "string" ? data : JSON.stringify(data)).replace(/\n/g, " ")
  if (typeof data === "string" || typeof data === "number") return preview.slice(0, 20)
  return `#${hash.slice(0, 8)}`
}

export const validateNote = async (note: NoteData) => {
  const resolve = async (hash: Hash) => (await getNote(hash)).data
  const schema = await resolve(note.schemaHash)
  return validate(await expandLinks(note.data, resolve), await expandLinks(schema, resolve))
}


export type SearchRes = { title: string, hash: Hash, count: number }

export const hashSearch = async (token: string): Promise<SearchRes[]> => {
  const bare = token.startsWith("#") ? token.slice(1) : token
  const isHex = /^[a-f0-9]+$/i.test(bare)
  if (isHex && bare.length === 32) {
    try {
      const note = await getNote(bare as Hash)
      const title = (note.data as any)?.title ?? ""
      return [{ title, hash: bare as Hash, count: 1 }]
    } catch { return [] }
  }
  let results = await searchNotes(isHex ? "" : bare)
  if (isHex && bare) results = results.filter(r => r.hash.includes(bare.toLowerCase()) || r.title.toLowerCase().includes(bare.toLowerCase()))
  return results as SearchRes[]
}

export function noteSearch(update: (results: SearchRes[]) => void): (term: string) => void {
  const cacheKey = "searchCache:" + SERVER.get();
  const ls = typeof localStorage !== "undefined" ? localStorage : null;
  const cache: SearchRes[] = fromjson(ls?.getItem(cacheKey) || "[]") as SearchRes[]

  const addToCache = (r: SearchRes) => {
    const i = cache.findIndex(c => c.hash === r.hash)
    if (i >= 0) cache[i] = r; else cache.push(r)
    ls?.setItem(cacheKey, tojson(cache))
  }

  return (term: string) => {
    const bare = term.startsWith("#") ? term.slice(1) : term
    const isHash = /^[a-f0-9]{8,32}$/.test(bare)

    const local = term ? cache.filter(r => isHash ? r.hash.startsWith(bare) : r.title.startsWith(term)) : cache
    update(local)

    if (isHash) {
      if (bare.length === 32) {
        Promise.resolve(getNote(bare as Hash)).then(note => {
          const title = (note.data as any)?.title ?? ""
          const result: SearchRes = { title, hash: bare as Hash, count: 1 }
          addToCache(result)
          update([result])
        }).catch(() => {})
      }
    } else {
      callProcedure("search_note", { query: term }).then((raw: string) => {
        const results = (fromjson(raw) as [string, number, string][]).map(([title, count, hash]) => ({ title, count, hash: hash as Hash }))
        for (const r of results) addToCache(r)
        update(results)
      })
    }
  }
}


export const fetchSchemas = async (): Promise<SchemaEntry[]> => {
  const topHash = hashData(top)
  const [schemasRes, countsRes] = await Promise.all([
    sql(`select hash, data from note where schemaHash = '${topHash}'`),
    sql("select schemaHash from note")
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

export const fetchNotes = async ( limit = 200): Promise<SchemaEntry[]> =>
  sql("select hash, data from note").then(r =>
    newestRows(r.rows, limit).map(row => {
      let title = ""
      try { title = JSON.parse(String(row[1] ?? ""))?.title ?? "" } catch {}
      return { hash: String(row[0] ?? ""), title }
    })
  )
