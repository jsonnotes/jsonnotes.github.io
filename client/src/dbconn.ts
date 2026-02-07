import { Hash, Jsonable, NoteData, Note, validate, fromjson, expandLinks } from "@jsonview/core";
import { hash128 } from "@jsonview/core/hash";
import { createApi, server } from "@jsonview/lib";
import { p, popup, routeLink, span } from "./html";


const DBNAME = "jsonview"


let access_token: string | null = localStorage.getItem("access_token");
const api = createApi({ server, accessToken: access_token });

export const callProcedure = api.callProcedure;

export const query_data = async (sql: string, desc = false, maxitems = null) : Promise<{names:string[], rows:any[]}> => {

  if (desc && maxitems != null){
    sql = `select * from (${sql}) limit ${maxitems}`;
  }

  try {
    const { names, rows } = await api.sql(sql);
    const shouldReverse = desc && maxitems == null;
    return { names, rows: shouldReverse ? rows.reverse() : rows };
  } catch (e: any) {

    popup(p(String(e?.message || e)));
    return { names: ["error"], rows: [e.message] };
  }
};

const LocalCache = <X,Y> (fn: (x:X) => Promise<Y>) : ((x:X)=>Promise<Y>) => {
  const HotCache = new Map<string,Y>();
  const fkey = hash128(fn.toString() + ":cached:" + api.baseUrl)
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

export const addNote = api.addNote


export const callNoteRemote = api.callNote;

export const getNoteRaw = LocalCache(async (hash:Hash) => {

  const data = await query_data(`select * from note where hash = '${hash}'`)
  const row = data.rows[0];
  if (!row) throw new Error("note not found")
  return Object.fromEntries(data.names.map((n,i)=>[n, row[i]])) as Note
})

export const getSchemaHash = (ref: Hash) => getNoteRaw(ref).then((n)=>n.schemaHash)


export const getNote = LocalCache(async (ref: Hash) =>{
  const nt = await getNoteRaw(ref)
  return {
    schemaHash: nt.schemaHash,
    data: fromjson(nt.data)
  } as NoteData
})

if (access_token === null) {
  api.req("/v1/identity", "POST").then((res) => res.json()).then((text) => {
    access_token = text.token;
    api.setAccessToken(access_token);
  });
}
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


export const notePreview = (hash) => getNote(hash).then(async note=>{
  let data :any = note.data
  let preview = typeof data === "string" ? data : JSON.stringify(data);
  preview = preview.replace(/\n/g, " ");

  const short = hash.slice(0, 8);
  if (data?.title) return String(data.title);
  if (typeof data == "string" || typeof data == "number") return preview.slice(0, 20);
  return `#${short}`;

})

export const noteOverview = (ref) => getNote(ref).then(async note=>{
  let data = note.data
  let full = "";

  let table = (data:Jsonable, d)=> {
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

  table(data, 0)
  return full
})

export const noteLink = (
  hash: Hash,
  label?: string,
  args = {},
) => {
  let el = span(label ?? `#${hash}`)

  if (label === undefined) notePreview(hash).then(pr => el.innerHTML = pr)
  return routeLink(`/${hash}`, el, args)
}
