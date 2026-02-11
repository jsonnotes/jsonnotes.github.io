import { Jsonable, Hash, hash128 } from "@jsonview/core";
import { runWithFuelAsync } from "@jsonview/core/parser";
import { HTML, renderDom, type VDom } from "@jsonview/lib";
import { callNote as callNoteRemote, callNoteLocal, addNote, getNote } from "@jsonview/lib/src/dbconn";
import { h2, p, pre, popup } from "./html";
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

export type ViewUpdateOps = {
  add: (parent: VDom, ...el: VDom[]) => void
  del: (el: VDom) => void
  update: (el: VDom) => void
};

export type ViewRenderFn = (ops: ViewUpdateOps) => VDom;

export type CallNoteOptions = {
  view?: (render: ViewRenderFn) => ViewUpdateOps
};

export const mountView = (render: ViewRenderFn, mount: (el: HTMLElement) => void): ViewUpdateOps => {
  let updateOps: ViewUpdateOps | null = null;
  const rendered = renderDom((ufn) => {
    updateOps = ufn;
    return render(ufn);
  });
  mount(rendered);
  return updateOps!;
};

const makeView = (options?: CallNoteOptions) => (render: ViewRenderFn) => {
  if (options?.view) return options.view(render);
  return mountView(render, (el) => {
    popup(h2("view"), el);
  });
};

const browserExtras = (fn: Hash, options?: CallNoteOptions) => ({
  remote: callNoteRemote,
  openrouter: makeOpenrouter(),
  storage: makeStorage(fn),
  view: makeView(options),
  HTML,
});

export const callNote = async (fn: Hash, arg: Record<string, Jsonable>, options?: CallNoteOptions): Promise<any> =>
  callNoteLocal(fn, arg, browserExtras(fn, options));

export const isVDom = (value: unknown): value is VDom => {
  if (!value || typeof value !== "object") return false;
  const v = value as VDom;
  return typeof v.tag === "string" && typeof v.textContent === "string" && typeof v.id === "string" && typeof v.style === "object" && Array.isArray(v.children);
};

export const promptArgs = (fnData: { args?: Record<string, any>; code?: string }, storageKey: string): { canceled: boolean; parsed: any } => {
  const argNames = Object.keys(fnData.args || {});
  const usesArgs = String(fnData.code || "").includes("args");
  if (!argNames.length && !usesArgs) return { canceled: false, parsed: {} };
  const defaultArgs = argNames.length
    ? JSON.stringify(Object.fromEntries(argNames.map((n: string) => [n, null])), null, 2)
    : "{}";
  const argText = prompt("args as JSON object (use {} for none)", localStorage.getItem(storageKey) ?? defaultArgs);
  if (argText == null) return { canceled: true, parsed: undefined };
  const trimmed = argText.trim();
  if (!trimmed) {
    popup(h2("ERROR"), p("Args cannot be empty. Use {} for no arguments."));
    return { canceled: true, parsed: undefined };
  }
  try {
    const parsed = JSON.parse(trimmed);
    localStorage.setItem(storageKey, trimmed);
    return { canceled: false, parsed };
  } catch (e: any) {
    popup(h2("ERROR"), p("Invalid JSON: " + e.message));
    return { canceled: true, parsed: undefined };
  }
};

export const showResult = (res: unknown) => {
  if (res === undefined) return;
  if (isVDom(res)) popup(h2("result"), renderDom(() => res));
  else popup(h2("result"), pre(typeof res === "string" ? res : JSON.stringify(res, null, 2)));
};

export const callDraft = async (fnData: { code: string; args?: Record<string, any> }, arg: Record<string, Jsonable>, options?: CallNoteOptions): Promise<any> => {
  const extras = browserExtras("draft" as Hash, options);
  const env: Record<string, unknown> = {
    getNote: (h: string) => getNote(h.slice(1) as Hash),
    addNote,
    hash: hash128,
    call: (h: string, a: Record<string, Jsonable>) => callNoteLocal(h.slice(1) as Hash, a, extras),
    ...extras,
  };
  Object.keys(fnData.args || {}).forEach(nm => env[nm] = arg[nm]);
  const result = await runWithFuelAsync(fnData.code, 10000, env);
  if ("err" in result) throw new Error(String(result.err));
  return result.ok;
};
