import { hashData, function_schema, isRef, Ref, Jsonable } from "../spacetimedb/src/notes";
import { addNote, callProcedure, getId, getNote } from "./dbconn";
import { hash128 } from "../spacetimedb/src/hash";
import { openrouter } from "../spacetimedb/src/openrouter";

export const callNote = async (fn: Ref, ...args: Jsonable[]): Promise<any> => {
  const note = await getNote(fn);
  if (note.schemaHash != hashData(function_schema)) throw new Error("can only call Function schema notes");
  const data = note.data as { code: string; inputs?: string[] };

  const localBuiltins = {
    getNote,
    addNote,
    call: callNote,
    remote: async (ref: Ref, arg?: Jsonable) => {
      const idOrHash = String(ref).replace(/^#/, "");
      const id = /^\d+$/.test(idOrHash) ? Number(idOrHash) : await getId(idOrHash as any);
      const argStr = arg !== undefined ? JSON.stringify(arg) : "null";
      const raw = await callProcedure("run_note_async", { id, arg: argStr });
      try { return JSON.parse(raw); } catch { return raw; }
    },
    openrouter: async (prompt: string, schema: Ref | Jsonable) => {
      if (isRef(schema)) schema = (await getNote(schema as Ref)).data;
      return openrouter(prompt, schema);
    },
    hash: hash128
  };

  if (data.inputs && data.inputs.length > 0) {
    const F = new Function(...data.inputs, ...Object.keys(localBuiltins), `return (async () => {${data.code}})()`);
    return F(...args, ...Object.values(localBuiltins));
  } else {
    const F = new Function('args', ...Object.keys(localBuiltins), `return (async () => {${data.code}})()`);
    return F(args.length === 1 ? args[0] : args, ...Object.values(localBuiltins));
  }
};
