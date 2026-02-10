import type { Hash, Jsonable, NoteData, Note } from "@jsonview/core";
import { tojson, fromjson, hashData, function_schema, hash128 } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { dbname, funCache, server as defaultServer } from "./helpers.ts";

const url_presets = {
  "local": "http://localhost:3000",
  "maincloud": "https://maincloud.spacetimedb.com"
}

export type { Jsonable, NoteData, Note, Hash }
export type ServerName = "local" | "maincloud";

export type ApiConfig = {
  server?: ServerName;
  accessToken?: string | null;
};

const ls = typeof localStorage !== "undefined" ? localStorage : null;
const tokenKey = (server: ServerName) => `access_token:${server}`;
const readInitialServer = (): ServerName =>
  (ls?.getItem("db_preset") === "local" ? "local" : defaultServer);

export const SERVER = {
  value: readInitialServer() as ServerName,
  get: (): ServerName => SERVER.value,
  set: (value: ServerName) => {
    SERVER.value = value;
    ls?.setItem("db_preset", value);
    return value;
  },
};

export const createApi = (config: ApiConfig = {}) => {
  const server = config.server ?? SERVER.get();
  SERVER.set(server);
  const baseUrl = url_presets[server];
  let accessToken = config.accessToken ?? ls?.getItem(tokenKey(server)) ?? null;
  if (config.accessToken !== undefined) {
    if (config.accessToken == null) ls?.removeItem(tokenKey(server));
    else ls?.setItem(tokenKey(server), config.accessToken);
  }

  const req = async (path: string, method: string, body: string | null = null): Promise<Response> => {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body,
    });
  };

  const ensureAccessToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    const res = await req("/v1/identity", "POST");
    const data = await res.json() as { token?: string };
    accessToken = data?.token || null;
    if (accessToken) ls?.setItem(tokenKey(server), accessToken);
    return accessToken;
  };

  const callProcedure = async (name: string, payload: unknown): Promise<string> => {
    const res = await req(`/v1/database/${dbname}/call/${name}`, "POST", JSON.stringify(payload));
    if (!res.ok) throw new Error(await res.text());
    return res.text();
  };

  const sql = async (query: string): Promise<{ names: string[]; rows: unknown[][] }> => {
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
  }, server)
  const getNote = (hash: Hash): Promise<NoteData> => Promise.resolve(getNoteCached(hash) as NoteData | Promise<NoteData>);

  async function addNote (note: NoteData): Promise<Hash>;
  async function addNote (schema: Hash, data: Jsonable): Promise<Hash>;

  async function addNote (schema: Hash| NoteData, data: Jsonable | undefined = undefined): Promise<Hash> {
    let schemaHash: Hash = schema as Hash
    if (data == undefined) ({schemaHash, data} = schema as NoteData)

    const hash = hashData({ schemaHash, data });
    setCacheNote(hash, {schemaHash, data})
    const res = await req(`/v1/database/${dbname}/call/add_note`, "POST", JSON.stringify({
      schemaHash,
      data: tojson(data),
    }));
    if (!res.ok) throw new Error(await res.text());
    return hash;
  };

  const callNote = async (fn: Hash, arg?: Jsonable): Promise<Jsonable> => {
    return fromjson(fromjson(await callProcedure("call_note", { fn, arg: arg !== undefined ? tojson(arg) : "null" })) as string)
  };

  const callNoteLocal = async (fn: Hash, arg: Record<string, Jsonable>, extras: Record<string, unknown> = {}): Promise<any> => {
    const note = await getNote(fn);
    if (note.schemaHash !== hashData(function_schema)) throw new Error("can only call Function schema notes");
    const data = note.data as { code: string; inputs?: string[]; args?: Record<string, any> };
    const argNames = data.inputs?.length ? data.inputs : Object.keys(data.args || {});

    const env: Record<string, unknown> = {
      getNote, addNote, hash: hash128,
      call: (h: Hash, a: Record<string,Jsonable>) => callNoteLocal(h, a, extras),
      ...extras,
    };

    argNames.forEach(nm=>env[nm] = arg[nm])
    const result = await runWithFuelAsync(data.code, 10000, env);
    if ("err" in result) throw new Error(result.err);
    return result.ok;
  };

  const setAccessToken = (token: string | null) => {
    accessToken = token;
    if (token == null) ls?.removeItem(tokenKey(server));
    else ls?.setItem(tokenKey(server), token);
  };

  return { server, baseUrl, req, callProcedure, sql, getNote, addNote, callNote, callNoteLocal, setAccessToken, ensureAccessToken };
};

export type Api = ReturnType<typeof createApi>;
