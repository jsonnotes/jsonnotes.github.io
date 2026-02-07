import type { Hash, Jsonable, NoteData, Note } from "@jsonview/core";
import { tojson, fromjson, hashData, function_schema, hash128 } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { dbname } from "./cli.ts";

const url_presets = {
  "local": "http://localhost:3000",
  "maincloud": "https://maincloud.spacetimedb.com"
}

export type { Jsonable, NoteData, Note, Hash }


export type ApiConfig = {
  server: "local" | "maincloud";
  accessToken?: string | null;
};

export const createApi = (config: ApiConfig) => {

  console.log("connection to", config.server, ".")
  const server = config.server ?? (typeof localStorage !== "undefined"
    ? ((localStorage.getItem("db_preset") || "maincloud") === "local" ? "local" : "maincloud")
    : "maincloud");

  let accessToken = config.accessToken ?? null;
  const baseUrl = url_presets[server];

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

  const getNote = async (hash: Hash): Promise<NoteData> => {

    const data = await sql(`select * from note where hash = '${hash}'`);
    const row = data.rows[0];
    if (!row) throw new Error("note not found");
    const note = Object.fromEntries(data.names.map((n, i) => [n, row[i]])) as Note;
    return { schemaHash: note.schemaHash, data: fromjson(note.data) };
  };


  async function addNote (note: NoteData): Promise<Hash>;
  async function addNote (schema: Hash, data: Jsonable): Promise<Hash>;

  async function addNote (schema: Hash| NoteData, data: Jsonable | undefined = undefined): Promise<Hash> {
    let schemaHash: Hash = schema as Hash
    if (data == undefined) ({schemaHash, data} = schema as NoteData)

    const res = await req(`/v1/database/${dbname}/call/add_note`, "POST", JSON.stringify({
      schemaHash,
      data: tojson(data),
    }));
    if (!res.ok) throw new Error(await res.text());
    return hashData({ schemaHash, data });
  };

  const callNote = async (fn: Hash, arg?: Jsonable): Promise<Jsonable> => {
    return fromjson(await callProcedure("call_note", { fn, arg: arg !== undefined ? tojson(arg) : "null" }))
  };

  const callNoteLocal = async (fn: Hash, args: Jsonable[] = [], extras: Record<string, unknown> = {}): Promise<any> => {
    const note = await getNote(fn);
    if (note.schemaHash !== hashData(function_schema)) throw new Error("can only call Function schema notes");
    const data = note.data as { code: string; inputs?: string[]; args?: Record<string, any> };
    const argNames = data.inputs?.length ? data.inputs : Object.keys(data.args || {});

    const env: Record<string, unknown> = {
      getNote, addNote, hash: hash128,
      call: (h: Hash, ...a: Jsonable[]) => callNoteLocal(h, a, extras),
      ...extras,
    };

    if (argNames.length > 0) {
      let callArgs = args;
      if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
        callArgs = argNames.map(name => (args[0] as any)[name]);
      }
      argNames.forEach((name, i) => { env[name] = callArgs[i]; });
    } else {
      env.args = args.length === 1 ? args[0] : args;
    }

    const result = await runWithFuelAsync(data.code, 10000, env);
    if ("err" in result) throw new Error(result.err);
    return result.ok;
  };

  const setAccessToken = (token: string | null) => {
    accessToken = token;
  };

  return { server, baseUrl, req, callProcedure, sql, getNote, addNote, callNote, callNoteLocal, setAccessToken };
};

export type Api = ReturnType<typeof createApi>;
