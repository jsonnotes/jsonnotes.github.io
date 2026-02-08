import { hashData, page_schema, Jsonable, hash128, Hash } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { addNote, callNoteRemote, callNoteLocal, getNote } from "./dbconn";
import { openrouter } from "./openrouter";
import { div, h1, h2, h3, h4, p, span, a, pre, button, input, textarea, table, tr, td, th, canvas, style, margin, padding, width, height, color } from "./html";

const makeOpenrouter = () => async (prompt: string, schema: string | Jsonable) => {
  if (typeof schema === "string") {
    if (schema.startsWith("#")) schema = (await getNote(schema.slice(1) as Hash)).data;
  }
  return openrouter(prompt, schema);
};

const makeStorage = (fnHash: string) => ({
  getItem: (key: string) => localStorage.getItem(`${fnHash}:${key}`),
  setItem: (key: string, value: string) => localStorage.setItem(`${fnHash}:${key}`, value),
});

const browserExtras = (fn: Hash) => ({
  remote: callNoteRemote,
  openrouter: makeOpenrouter(),
  storage: makeStorage(fn),
});

export const callNote = async (fn: Hash, arg: Record<string, string>): Promise<any> =>
  callNoteLocal(fn, arg, browserExtras(fn));

export const renderPage = async (ref: Hash): Promise<HTMLElement> => {
  const note = await getNote(ref);
  if (note.schemaHash !== hashData(page_schema)) throw new Error("can only render Page schema notes");
  const data = note.data as { code: string };

  const env: Record<string, unknown> = {
    getNote, addNote, call: callNote, remote: callNoteRemote,
    openrouter: makeOpenrouter(), hash: hash128, storage: makeStorage(ref),
    div, h1, h2, h3, h4, p, span, a, pre, button, input, textarea,
    table, tr, td, th, canvas, style, margin, padding, width, height, color,
  };

  const result = await runWithFuelAsync(data.code, 10000, env);
  if ("err" in result) throw new Error(result.err);
  return result.ok as HTMLElement;
};
