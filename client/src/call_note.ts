import { Jsonable, Hash } from "@jsonview/core";
import { callNoteRemote, callNoteLocal, getNote } from "./dbconn";
import { openrouter } from "./openrouter";

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
