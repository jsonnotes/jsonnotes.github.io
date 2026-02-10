import { Jsonable, Hash } from "@jsonview/core";
import { HTML, renderDom, type VDom } from "@jsonview/lib";
import { callNote as callNoteRemote, callNoteLocal, getNote } from "@jsonview/lib/src/dbconn";
import { h2, popup } from "./html";
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
