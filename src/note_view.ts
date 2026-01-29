import { Hash, hashData, NoteData, script_result_schema, script_schema, isRef } from "../spacetimedb/src/schemas";
import { addNote, getId, getNote, getSchemaId, noteLink, Ref } from "./dbconn";

import { stringify } from "./helpers";
import { a, button, div, h2, h3, p, padding, popup, routeLink, span, style } from "./html";

import { openrouter } from "./openrouter";

import { buildins as buildinlist } from "./script_worker";


export const buildins = {
  openrouter: async (...data: [string, any]) => {
    data = await  Promise.all(data.map(s=>{
      if (isRef(s)) return getNote(s).then(n=>n.data)
      return s
    })) as [string, any]
    return openrouter(...data)
  },
  getNote,
  addNote,
}


for (let exp of buildinlist) if (!Object.keys(buildins).includes(exp)) throw new Error("buildin missing but expected: "+ exp)

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
    el.append(noteLink(token as Ref,)),
    last = start + match[0].length;
  }
  if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  return el;
};

export const openNoteView = (hash: Hash, submitNote: (data: NoteData) => Promise<void>): HTMLElement => {

  
  const overlay = div(style({display: "flex", flexDirection: "column", gap: "0.75em"}));


  getNote(hash).then(async note => {
    const id = await getId(hash);
    const schemaId = await getSchemaId(hash);

    const titleText = (note.data as any)?.title ?? "";

    const runScriptFromNote = (noteData: NoteData) =>  new Promise <NoteData>(async (rs, rj)=>{


      let code = String((noteData.data as any)?.code || "")

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
            data: {
              title: "result",
              script: `#${hash}`,
              content: msg.result
            }
          } as NoteData
          rs(result)
        }else popup(h2("ERROR"), p(msg.error || "script error"))
      };
      worker.postMessage({ type: "run", code, input: {}});
    })

    const isScript = note.schemaHash === hashData(script_schema)

    console.log(note)

    const text = isScript ? String((note.data as any).code || "") : stringify(note.data)

    console.log(text)


    overlay.innerHTML = "";
    const title = h3(`${isScript ? "Script" : "Note"} #${id} ${titleText} `);
    if (isScript) {
      const runner = button("run", { onclick: () => {
        runner.innerHTML = "running..."
        runScriptFromNote(note).then(result=>submitNote(result))
      }});
      title.append(runner);
    }
    overlay.append(
      title,
      isScript ? "" : p("schema: ", noteLink(schemaId)),
      div(
        style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
        linkify(text)
      ),
      div(
        style({ display: "flex", gap: "0.75em", alignItems: "center" }),
        routeLink(`/edit?id=${id}`, "edit" ),
        button("copy", {
          onclick: () =>
            navigator.clipboard.writeText(text)
              .then(() => popup(h2("OK"), p("copied")))
              .catch((e) => popup(h2("ERROR"), p(e.message || "copy failed")))
        })
      )
    );



  });

  return overlay;
};
