import Ajv from "ajv";
import { Hash, NoteData, validate } from "../spacetimedb/src/schemas";
import { hash128 } from "./hash";
import { h2, p, popup } from "./html";
import { Note } from "./note_view";

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000";
// const DBNAME = "jsonviewtest";
const DBNAME = "jsonview"


const noteCachePrefix = "note:";
const noteHashPrefix = "note_hash:";


let access_token: string | null = localStorage.getItem("access_token");

const req = (path: string, method: string, body: string | null = null) =>
  fetch(`${db_url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}) },
    body,
  });

export const query_data = async (sql: string) : Promise<{names:string[], rows:any[]}> => {
  try {
    const text = await (await req(`/v1/database/${DBNAME}/sql`, "POST", sql)).text();
    const data = JSON.parse(text);
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this");
    const { schema, rows } = data[0];
    return { names: schema.elements.map((e) => e.name.some), rows };
  } catch (e: any) {
    console.error(e);
    popup(p(e.message));
    return { names: ["error"], rows: [e.message] };
  }
};

export const add_note = (note:NoteData) =>req(`/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify(note)).catch((e) => popup(h2("ERROR"), p(e.message)));
const noteFrom = (names: string[], row: any[]): Note => Object.fromEntries(names.map((n, i) => [n, row[i]])) as Note;

const FunCache = <X,Y> (fn: (x:X) => Promise<Y>) : ((x:X)=>Promise<Y>) => {
  const HotCache = new Map<string,Y>();
  const fkey = hash128(fn.toString() + ":cached")
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

export const getNote = FunCache(async (hash: string) =>
  query_data(`select * from note where hash = '${hash}'`)
  .then(({ names, rows }) => {
    if (!rows[0]) throw new Error("note hash not found:" + hash)
    return noteFrom(names, rows[0])
  })
)

const getHashFromId = FunCache(async (id: number) =>
  query_data(`select hash from note where id = ${id}`)
  .then(({ rows }) => {
    if (!rows[0]) throw new Error("note not found")
    return String(rows[0][0])
  })
)

export const getNoteById = (id: number) => getHashFromId(id).then(getNote)
if (access_token === null) req("/v1/identity", "POST").then((res) => res.json()).then((text) => {access_token = text.token; });
export const validateNote = (note: NoteData) => getNote(note.schemaHash).then((schemaNote) => validate(note.data, schemaNote.data))

