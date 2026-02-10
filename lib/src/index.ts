import { fromjson, tojson } from "@jsonview/core";
import type { Api, Hash } from "./dbconn.ts";

export { createApi, type Api, type ApiConfig, type Hash } from "./dbconn.ts";
export { server, dbname, jsonOverview, fetchSchemas, fetchNotes, newestRows, validateNote, notePreview, noteOverview, funCache, type SchemaEntry } from "./helpers.ts";
export { openrouterCall, DEFAULT_OPENROUTER_MODEL, type OpenRouterConfig } from "./openrouter.ts";
export { renderDom, type VDom, HTML } from "./views.ts";

export type SearchRes = { title: string, hash: Hash, count: number }

const ls = typeof localStorage !== "undefined" ? localStorage : null

export function noteSearch(api: Api, update: (results: SearchRes[]) => void): (term:string)=>void {
  const cacheKey = "searchCache:" + api.server
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
        Promise.resolve(api.getNote(bare as Hash)).then(note => {
          const title = (note.data as any)?.title ?? ""
          const result: SearchRes = { title, hash: bare as Hash, count: 1 }
          addToCache(result)
          update([result])
        }).catch(() => {})
      }
      // partial hash: local cache results are sufficient, no server call
    } else {
      api.callProcedure("search_note", { query: term }).then(raw => {
        const results = (fromjson(raw) as [string, number, string][]).map(([title, count, hash]) => ({ title, count, hash: hash as Hash }))
        for (const r of results) addToCache(r)
        update(results)
      })
    }
  }
}
