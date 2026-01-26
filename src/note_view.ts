import { Hash, hashData, NoteData, script_result_schema, script_schema, top } from "../spacetimedb/src/schemas";
import { getNote, noteLink, Ref } from "./dbconn";
import { JsonFmt } from "./helpers";
import { a, button, div, h2, h3, p, padding, popup, routeLink, span, style } from "./html";
import { openrouter } from "./openrouter";




const llmrequest = (prompt: string): string =>{
  console.log("request LLM:", prompt)
  return "<response>"
}


export const buildins = {
  openrouter,
  llmrequest
}

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
    const token = match[1];
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

    let title = h3(`Note ${note.id} ${JSON.parse(note.data).title ?? ""}`);

    overlay.append(
      title,
      p("schema: ", noteLink(note.schemaId)),
      div(
        style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
        linkify(JsonFmt(note.data))
      ),
      div(
        style({ display: "flex", gap: "0.75em", alignItems: "center" }),
        routeLink(`/edit?id=${note.id}`, "edit" ),
        button("copy", {
          onclick: () =>
            navigator.clipboard.writeText(JsonFmt(note.data))
              .then(() => popup(h2("OK"), p("copied")))
              .catch((e) => popup(h2("ERROR"), p(e.message || "copy failed")))
        })
      )
    );

    const runScriptFromNote = (note: Note) =>  new Promise <NoteData>(async (rs, rj)=>{

      let data = JSON.parse(note.data)
      let code = data.code

      let resultSchema;
      try {
        resultSchema = await getNote(hashData(script_result_schema));
      } catch (e: any) {
        popup(h2("ERROR"), p(e.message || "missing script_result_schema (republish with -c)"));
        return;
      }

      const worker = new Worker(new URL("./script_worker.ts", import.meta.url), { type: "module" });
      const timer = setTimeout(() => {
        worker.terminate();
        popup(h2("ERROR"), p("timeout"))
      }, 2000);


      worker.onmessage = (e) => {

        const msg = e.data || {};
        if (msg.type === "call") {
          Promise.resolve(buildins[msg.name](String(msg.args || "")))
            .then((result) => {console.log("responding", result) ; worker.postMessage({ type: "response", id:msg.id, result: JSON.stringify(result) })})
            .catch((err) => worker.postMessage({ type: "response", id:msg.id, error: String(err) }));
          return;
        }
        if (msg.type !== "run_result") return;
        clearTimeout(timer);
        worker.terminate();
        if (msg.ok) {
          let result = {
            schemaHash: resultSchema.hash,
            data: JSON.stringify({
              title: "result",
              scriptHash: `#${note.hash}`,
              content: msg.result
            }, null, 2)
          } as NoteData
          rs(result)
        }else popup(h2("ERROR"), p(msg.error || "script error"))
      };
      worker.postMessage({ type: "run", code, input: {}});
    })


    getNote(note.schemaId)
    .then(schema=>{
      if (schema.hash == hashData(script_schema)){
        title.innerHTML = `Script ${JSON.parse(note.data).title} `
        let runner = button("run", {onclick: () =>{
          runner.innerHTML = "running..."
          runScriptFromNote(note).then(result=>submitNote(result))
        }})
        title.append(runner)
      }
    })
  });

  return overlay;
};
