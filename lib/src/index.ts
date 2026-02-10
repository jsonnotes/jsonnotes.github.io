import { fromjson, tojson, type Jsonable, type NoteData } from "@jsonview/core";
import { createApi, SERVER, type Hash, type ServerName } from "./dbconn.ts";
import {
  dbname, jsonOverview,
  fetchSchemas as _fetchSchemas, fetchNotes as _fetchNotes, newestRows,
  validateNote as _validateNote, notePreview as _notePreview, noteOverview as _noteOverview,
  funCache, type SchemaEntry
} from "./helpers.ts";

export { SERVER, type Hash } from "./dbconn.ts";
export { dbname, jsonOverview, newestRows, funCache, type SchemaEntry };
export { openrouterCall, DEFAULT_OPENROUTER_MODEL, type OpenRouterConfig } from "./openrouter.ts";
export { renderDom, type VDom, HTML } from "./views.ts";

// --- Shared api instance ---

const ls = typeof localStorage !== "undefined" ? localStorage : null
let api = createApi({ server: SERVER.get() });

export const changeServer = (server: ServerName, accessToken?: string | null) => {
  SERVER.set(server);
  api = createApi({
    server,
    accessToken,
  });
};
export const currentServer = () => SERVER.get();
export const baseUrl = () => api.baseUrl;

// --- API delegates ---

export const sql = (query: string) => api.sql(query);
export const getNote = (hash: Hash) => api.getNote(hash);
export const callProcedure = (name: string, payload: unknown) => api.callProcedure(name, payload);
export const callNote = (fn: Hash, arg?: Jsonable) => api.callNote(fn, arg);
export const callNoteLocal = (fn: Hash, arg: Record<string, Jsonable>, extras?: Record<string, unknown>) => api.callNoteLocal(fn, arg, extras);
export const setAccessToken = (token: string | null) => api.setAccessToken(token);
export const req = (path: string, method: string, body?: string | null) => api.req(path, method, body);
export const ensureAccessToken = () => api.ensureAccessToken();
export function addNote(note: NoteData): Promise<Hash>;
export function addNote(schema: Hash, data: Jsonable): Promise<Hash>;
export function addNote(a: any, b?: any) { return api.addNote(a, b) }

// --- Helpers using shared api ---

export const validateNote = (note: NoteData) => _validateNote(api, note);
export const notePreview = (hash: Hash) => _notePreview(api, hash);
export const noteOverview = (hash: Hash) => _noteOverview(api, hash);
export const fetchSchemas = () => _fetchSchemas(api);
export const fetchNotes = (limit?: number) => _fetchNotes(api, limit);

// --- Search ---

export type SearchRes = { title: string, hash: Hash, count: number }

export function noteSearch(update: (results: SearchRes[]) => void): (term: string) => void {
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
    } else {
      api.callProcedure("search_note", { query: term }).then((raw: string) => {
        const results = (fromjson(raw) as [string, number, string][]).map(([title, count, hash]) => ({ title, count, hash: hash as Hash }))
        for (const r of results) addToCache(r)
        update(results)
      })
    }
  }
}
