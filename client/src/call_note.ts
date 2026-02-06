import { hashData, function_schema, Ref, Jsonable, hash128, normalizeRef } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { addNote, callNoteRemote, getNote } from "./dbconn";
import { openrouter } from "./openrouter";

const makeOpenrouter = () => async (prompt: string, schema: Ref | Jsonable) => {
  if (typeof schema === "string") {
    const raw = schema.startsWith("#") ? schema.slice(1) : schema;
    if (/^[a-f0-9]{32}$/.test(raw)) {
      schema = (await getNote(raw as Ref)).data;
    }
  }
  return openrouter(prompt, schema);
};

const makeStorage = (fnHash: string) => ({
  getItem: (key: string) => localStorage.getItem(`${fnHash}:${key}`),
  setItem: (key: string, value: string) => localStorage.setItem(`${fnHash}:${key}`, value),
});

export const callNote = async (fn: Ref, ...args: Jsonable[]): Promise<any> => {
  const fnHash = normalizeRef(fn);
  const note = await getNote(fn);
  if (note.schemaHash != hashData(function_schema)) throw new Error("can only call Function schema notes");
  const data = note.data as { code: string; inputs?: string[]; args?: Record<string, { name?: string; schema?: any }> };

  const argNames = data.inputs && data.inputs.length > 0
    ? data.inputs
    : Object.keys(data.args || {});

  const env: Record<string, unknown> = {
    getNote,
    addNote,
    call: callNote,
    remote: callNoteRemote,
    openrouter: makeOpenrouter(),
    hash: hash128,
    storage: makeStorage(fnHash),
  };

  if (argNames.length > 0) {
    let callArgs = args;
    if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
      const obj = args[0] as Record<string, Jsonable>;
      callArgs = argNames.map((name) => obj[name]);
    }
    argNames.forEach((name, i) => { env[name] = callArgs[i]; });
  } else {
    env.args = args.length === 1 ? args[0] : args;
  }

  const result = await runWithFuelAsync(data.code, 10000, env);
  if ("err" in result) throw new Error(result.err);
  return result.ok;
};
