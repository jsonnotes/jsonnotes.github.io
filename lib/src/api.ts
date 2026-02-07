import type { Hash, Jsonable, NoteData, Note } from "@jsonview/core";
import { tojson, fromjson, hashData } from "@jsonview/core";
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

  const setAccessToken = (token: string | null) => {
    accessToken = token;
  };

  return { server, baseUrl, req, callProcedure, sql, getNote, addNote, callNote, setAccessToken };
};

export type Api = ReturnType<typeof createApi>;
