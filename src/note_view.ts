import { Hash, hashData, NoteData, script_result_schema, script_schema, top } from "../spacetimedb/src/schemas";
import { add_note, addNote, getNote, noteLink, Ref } from "./dbconn";
import { isRef } from "./expand_links";
import { JsonFmt } from "./helpers";
import { a, button, div, h2, h3, p, padding, popup, routeLink, span, style } from "./html";
import { AddNote } from "./module_bindings";
import { openrouter } from "./openrouter";

import { buildins as buildinlist } from "./script_worker";


export const buildins = {
  openrouter: async (...data: [string, any]) => {
    data = await  Promise.all(data.map(s=>{
      if (isRef(s)) return getNote(s).then(n=>JSON.parse(n.data))
      return s
    })) as [string, any]
    return openrouter(...data)
  },
  getNote,
  addNote,
}


for (let exp of buildinlist) if (!Object.keys(buildins).includes(exp)) throw new Error("buildin missing but expected: "+ exp)

export type Note = {
  id: number | string | bigint;
  hash: Hash;
  schemaId: number;
  data: string;
};

const linkify = (text: string) => {
  const el = span();
  const re = /#([A-Za-z0-9]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index;
    const raw = match[1];
    const token: Ref = /^\d+$/.test(raw) ? Number(raw) : raw as Ref;
    if (start > last) el.append(document.createTextNode(text.slice(last, start)));
    el.append(noteLink(token as Ref)),
    last = start + match[0].length;
  }
  if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  return el;
};

export const openNoteView = (hash: Hash, submitNote: (data: NoteData) => Promise<void>): HTMLElement => {

  
  const overlay = div(style({display: "flex", flexDirection: "column", gap: "0.75em"}));


  getNote(hash).then(note => {

    const parsed = JSON.parse(note.data);
    const titleText = parsed?.title ?? "";
    const codeText = String(parsed?.code || "");

    const runScriptFromNote = (note: Note) =>  new Promise <NoteData>(async (rs, rj)=>{

      let data = JSON.parse(note.data)
      let code = String(data.code || "")

      console.log({code})

      const worker = new Worker(new URL("./script_worker.ts", import.meta.url), { type: "module" });

      worker.onmessage = (e) => {

        const msg = e.data || {};
        if (msg.type === "call") {
          Promise.resolve(buildins[msg.name](...JSON.parse(msg.args)))
            .then((result) => {console.log("responding", result) ; worker.postMessage({ type: "response", id:msg.id, result: result })})
            .catch((err) => worker.postMessage({ type: "response", id:msg.id, error: String(err) }));
          return;
        }
        if (msg.type !== "run_result") return;
        worker.terminate();
        if (msg.ok) {
          let result = {
            schemaHash: hashData(script_result_schema),
            data: JSON.stringify({
              title: "result",
              script: `#${note.hash}`,
              content: msg.result
            }, null, 2)
          } as NoteData
          rs(result)
        }else popup(h2("ERROR"), p(msg.error || "script error"))
      };
      worker.postMessage({ type: "run", code, input: {}});
    })


    const renderNote = (isScript: boolean) => {
      overlay.innerHTML = "";
      const title = h3(`${isScript ? "Script" : "Note"} #${note.id} ${titleText} `);
      if (isScript) {
        const runner = button("run", { onclick: () => {
          runner.innerHTML = "running..."
          runScriptFromNote(note).then(result=>submitNote(result))
        }});
        title.append(runner);
      }
      overlay.append(
        title,
        isScript ? "" : p("schema: ", noteLink(note.schemaId)),
        div(
          style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
          linkify(isScript ? codeText : JsonFmt(note.data))
        ),
        div(
          style({ display: "flex", gap: "0.75em", alignItems: "center" }),
          routeLink(`/edit?id=${note.id}`, "edit" ),
          button("copy", {
            onclick: () =>
              navigator.clipboard.writeText(isScript ? codeText : JsonFmt(note.data))
                .then(() => popup(h2("OK"), p("copied")))
                .catch((e) => popup(h2("ERROR"), p(e.message || "copy failed")))
          })
        )
      );
    };

    getNote(note.schemaId)
      .then(schema => renderNote(schema.hash == hashData(script_schema)))
      .catch(() => renderNote(false));
  });

  return overlay;
};
