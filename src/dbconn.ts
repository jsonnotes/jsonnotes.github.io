import { Hash, Jsonable, NoteData, Note, tojson, validate, fromjson, expandLinks, Ref, normalizeRef } from "../spacetimedb/src/notes";
import { p, popup, routeLink, span } from "./html";
import { hash128 } from "../spacetimedb/src/hash";


const DBNAME = "jsonview"

const local_url= "http://localhost:3000";
const prod_url= "https://maincloud.spacetimedb.com";

// let db_url = prod_url;
let db_url = local_url;
let access_token: string | null = localStorage.getItem("access_token");

const req = (path: string, method: string, body: string | null = null) : Promise<Response> =>
  new Promise(rs=> setTimeout(() => {
    rs(fetch(`${db_url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}) },
      body,
    }))
  }, 0))


export const callProcedure = async (name: string, payload: any) => {
  const res = await req(`/v1/database/${DBNAME}/call/${name}`, "POST", JSON.stringify(payload));
  if (!res.ok) throw new Error(await res.text());
  return res.text();
};

export const query_data = async (sql: string, desc = false, maxitems = null) : Promise<{names:string[], rows:any[]}> => {

  if (desc && maxitems != null){
    sql = `select * from (${sql}) limit ${maxitems}`;
  }

  const text = await (await req(`/v1/database/${DBNAME}/sql`, "POST", sql)).text();
  try {
    const data = JSON.parse(text);
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this");
    const { schema, rows } = data[0];
    const shouldReverse = desc && maxitems == null;
    return { names: schema.elements.map((e) => e.name.some), rows: shouldReverse ? rows.reverse() : rows };
  } catch (e: any) {

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
  const schemaHash = normalizeRef(schema);
  const res = await req(`/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify({
    schemaHash,
    data: tojson(data)
  }));
  if (!res.ok) throw new Error(await res.text())
  const raw = await res.text();
  try {
    return JSON.parse(raw) as Hash;
  } catch {
    return raw as Hash;
  }
}

export const getNoteRaw = FunCache(async (ref:Ref) => {
  const hash = normalizeRef(ref);
  const data = await query_data(`select * from note where hash = '${hash}'`)
  const row = data.rows[0];
  if (!row) throw new Error("note not found")
  return Object.fromEntries(data.names.map((n,i)=>[n, row[i]])) as Note
})

export const getSchemaHash = (ref: Ref) => getNoteRaw(ref).then((n)=>n.schemaHash)


export const getNote = FunCache(async (ref: Ref) =>{
  const nt = await getNoteRaw(ref)
  return {
    schemaHash: nt.schemaHash,
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
  let data :any = note.data
  let preview = typeof data === "string" ? data : JSON.stringify(data);
  preview = preview.replace(/\n/g, " ");
  const hash = normalizeRef(ref);
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
  ref: Ref,
  label?: string,
  args = {},
) => {
  let el = span(label ?? `#${normalizeRef(ref)}`)
  const hrefRef = normalizeRef(ref);
  if (label === undefined) notePreview(ref).then(pr => el.innerHTML = pr)
  return routeLink(`/${hrefRef}`, el, args)
}
