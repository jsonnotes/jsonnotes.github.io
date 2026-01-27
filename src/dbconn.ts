import { Hash, NoteData, validate } from "../spacetimedb/src/schemas";
import { h2, p, popup, routeLink, span, th } from "./html";
import { Note } from "./note_view";
import { hash128 } from "../spacetimedb/src/hash";
import { expandLinks } from "./expand_links";

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000";
// const DBNAME = "jsonviewtest";
const DBNAME = "jsonview"


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

export const add_note = async (note: NoteData) => {
  const res = await req(`/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify(note));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res;
};
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

/*** represents a note id or hash ***/
export type Ref = Hash | number

export const getNote = FunCache(async (ref: Ref) =>{
  let hash: Hash = (typeof ref === "string" ? ref as Hash : await getHashFromId(ref))
  return query_data(`select * from note where hash = '${hash}'`)
  .then(async ({ names, rows }) => {
    if (!rows[0]) throw new Error("note not found: " + ref)
    return noteFrom(names, rows[0])
  })
})

const getHashFromId = FunCache(async (id: number) =>
  query_data(`select hash from note where id = ${id}`)
  .then(({ rows }) => {
    if (!rows[0]) throw new Error("note not found")
    return String(rows[0][0]) as Hash
  })
)


if (access_token === null) req("/v1/identity", "POST").then((res) => res.json()).then((text) => {access_token = text.token; });
export const validateNote = async (note: NoteData) => {
  let expanded: any;
  try {
    expanded = await expandLinks(JSON.parse(note.data), async (ref) => {
      const row = /^\d+$/.test(ref) ? await getNote(Number(ref)) : await getNote(ref as Hash);
      return JSON.parse(row.data);
    });
  } catch (e: any) {
    throw new Error(e.message || "Invalid JSON");
  }
  const schemaNote = await getNote(note.schemaHash);
  return validate(JSON.stringify(expanded), schemaNote.data);
}


export const noteLink = (ref: Ref, style : Record<string,string> = {color:"inherit", textDecoration:"none" , border: "1px solid #ccc", padding: "0.1em", borderRadius: "0.25em"}) => {

  let el = span(`#${ref}`)
  getNote(ref).then(note=>{
    let data = JSON.parse(note.data)
    el.innerHTML = `#${note.id}` + (data.title ? `:${data.title}` : "")
  })
  return routeLink(`/${ref}`, el, {style})

}
