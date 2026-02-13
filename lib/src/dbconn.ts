import type { Hash, Jsonable, NoteData, Note } from "@jsonview/core";
import { tojson, fromjson, hashData, function_schema, hash128 } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { funCache } from "./helpers.ts";

export const dbname = "jsonview";

const url_presets = {
  "local": "http://localhost:3000",
  "maincloud": "https://maincloud.spacetimedb.com"
}

export type ServerName = "local" | "maincloud";
const ls = typeof localStorage !== "undefined" ? localStorage : null;

export const SERVER = {
  value: (ls?.getItem("db_preset") === "local" ? "local" : "maincloud") as ServerName,
  get: (): ServerName => SERVER.value,
  set: async (value: ServerName) => {
    SERVER.value = value;
    ls?.setItem("db_preset", value);
    baseUrl = url_presets[value];
    await getToken()
    console.log("changed server to", value)
    return value;
  },
};

console.log("server: ", SERVER.get());


let accessToken: string | null;
let baseUrl = url_presets[SERVER.get()];

const req = async (path: string, method: string, body: string | null = null): Promise<Response> => {
  // console.log(`Making request to ${path} with method ${method} and body ${body}`);
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
  });
};

const getToken = async () =>{
  const tokenkey = `access_token:${SERVER.get()}`
  accessToken = ls?.getItem(tokenkey) ?? null

  if (!accessToken){
    const res = await req("/v1/identity", "POST");
    const data = await res.json() as { token?: string };
    accessToken = data?.token || null;
    if (accessToken) ls?.setItem(tokenkey, accessToken);
  }
}
if (typeof fetch !== "undefined") await getToken();


export const callProcedure = async (name: string, payload: unknown): Promise<string> => {
  const res = await req(`/v1/database/${dbname}/call/${name}`, "POST", JSON.stringify(payload));
  if (!res.ok) throw new Error(await res.text());
  return res.text();
};

export type SearchResult = { title: string, hash: Hash, count: number }

export const searchNotes = async (query: string): Promise<SearchResult[]> => {
  const raw = await callProcedure("search_note", { query });
  return (fromjson(raw) as [string, number, string][]).map(([title, count, hash]) => ({ title, count, hash: hash as Hash }));
};

export const sql = async (query: string): Promise<{ names: string[]; rows: unknown[][] }> => {
  const text = await (await req(`/v1/database/${dbname}/sql`, "POST", query)).text();
  const data = JSON.parse(text);
  if (data.length > 1) console.warn("multiple result sets returned");
  const { schema, rows } = data[0];
  return { names: schema.elements.map((e: { name: { some: string } }) => e.name.some), rows };
};

const {get: getNoteCached, set: setCacheNote} = funCache(async (hash: Hash) : Promise<NoteData> => {
  const data = await sql(`select * from note where hash = '${hash}'`);
  const row = data.rows[0];
  if (!row) throw new Error("note note found")
  const note = Object.fromEntries(data.names.map((n, i) => [n, row[i]])) as Note;
  return {schemaHash: note.schemaHash, data: fromjson(note.data)}
})
export { setCacheNote }
export const getNote = (hash: Hash): Promise<NoteData> => Promise.resolve(getNoteCached(hash) as NoteData | Promise<NoteData>);



const normalizeAddNoteArgs = (schema: Hash | NoteData, data?: Jsonable): NoteData => {
  if (data !== undefined) return { schemaHash: schema as Hash, data };
  return schema as NoteData;
};

export async function addNote (note: NoteData): Promise<Hash>;
export async function addNote (schema: Hash, data: Jsonable): Promise<Hash>;

export async function addNote (schema: Hash| NoteData, data: Jsonable | undefined = undefined): Promise<Hash> {
  const note = normalizeAddNoteArgs(schema, data);
  const hash = hashData(note);
  const res = await req(`/v1/database/${dbname}/call/add_note`, "POST", JSON.stringify({
    schemaHash: note.schemaHash,
    data: tojson(note.data),
  }));
  if (!res.ok) throw new Error(await res.text());
  setCacheNote(hash, note);
  return hash;
};

export const callNote = async (fn: Hash, arg?: Jsonable): Promise<Jsonable> => {
  return fromjson(fromjson(await callProcedure("call_note", { fn, arg: arg !== undefined ? tojson(arg) : "null" })) as string)
};

export const callNoteLocal = async (fn: Hash, arg: Record<string, Jsonable>, extras: Record<string, unknown> = {}): Promise<any> => {
  const note = await getNote(fn);
  if (note.schemaHash !== hashData(function_schema)) throw new Error("can only call Function schema notes");
  const data = note.data as { code: string; inputs?: string[]; args?: Record<string, any> };
  const argNames = data.inputs?.length ? data.inputs : Object.keys(data.args || {});

  const env: Record<string, unknown> = {
    getNote: (h:string) => getNote(h.slice(1) as Hash),
    addNote,
    hash: hash128,
    call: (h: string, a: Record<string,Jsonable>) => callNoteLocal(h.slice(1) as Hash, a, extras),
    ...extras,
  };

  argNames.forEach(nm=>env[nm] = arg[nm])
  const result = await runWithFuelAsync(data.code, 10000, env);
  if ("err" in result) throw new Error(result.err);
  return result.ok;
};
