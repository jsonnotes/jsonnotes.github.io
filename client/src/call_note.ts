import { hashData, function_schema, Ref, Jsonable, normalizeRef, hash128 } from "@jsonview/core";
import { addNote, callProcedure, getNote } from "./dbconn";
import { openrouter } from "./openrouter";

export const callNote = async (fn: Ref, ...args: Jsonable[]): Promise<any> => {
  const note = await getNote(fn);
  if (note.schemaHash != hashData(function_schema)) throw new Error("can only call Function schema notes");
  const data = note.data as { code: string; inputs?: string[]; args?: Record<string, { name?: string; schema?: any }> };

  const localBuiltins = {
    getNote,
    addNote,
    call: callNote,
    remote: async (ref: Ref, arg?: Jsonable) => {
      const hash = normalizeRef(ref);
      const argStr = arg !== undefined ? JSON.stringify(arg) : "null";
      const raw = await callProcedure("run_note_async", { hash, arg: argStr });
      try { return JSON.parse(raw); } catch { return raw; }
    },
    openrouter: async (prompt: string, schema: Ref | Jsonable) => {
      if (typeof schema === "string") {
        const raw = schema.startsWith("#") ? schema.slice(1) : schema;
        if (/^[a-f0-9]{32}$/.test(raw)) {
          schema = (await getNote(raw as Ref)).data;
        }
      }
      return openrouter(prompt, schema);
    },
    hash: hash128
  };

  const argNames = data.inputs && data.inputs.length > 0
    ? data.inputs
    : Object.keys(data.args || {});

  if (argNames.length > 0) {
    const F = new Function(...argNames, ...Object.keys(localBuiltins), `return (async () => {${data.code}})()`);
    let callArgs = args;
    if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
      const obj = args[0] as Record<string, Jsonable>;
      callArgs = argNames.map((name) => obj[name]);
    }
    return F(...callArgs, ...Object.values(localBuiltins));
  }

  const F = new Function("args", ...Object.keys(localBuiltins), `return (async () => {${data.code}})()`);
  return F(args.length === 1 ? args[0] : args, ...Object.values(localBuiltins));
};
