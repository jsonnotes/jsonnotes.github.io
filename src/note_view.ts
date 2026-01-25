import { Hash, hashData, NoteData, script_result_schema, script_schema, top } from "../spacetimedb/src/schemas";
import { add_note, getNoteById, getNote} from "./dbconn";
import { a, background, button, display, div, h2, h3, p, padding, popup, routeLink, span, style } from "./html";


const llmrequest = (prompt: string): string =>{
  console.log("request LLM:", prompt)
  return "<response>"
}



export type Note = {
  id: number | string | bigint;
  hash: Hash;
  schemaId: number;
  data: string;
};

export const openNoteView = (hash: Hash, submitNote: (data: NoteData) => void): HTMLElement => {

  
  const overlay = div(style({display: "flex", flexDirection: "column", gap: "0.75em"}));


  getNote(hash).then(note => {

    let title = h3(`Note ${note.id} ${JSON.parse(note.data).title ?? ""}`);

    overlay.append(
      title,
      routeLink(`/${note.schemaId}`, "schema" ),
      div(
        style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
        JSON.stringify(JSON.parse(note.data), null, 2)
      ),
      routeLink(`/edit?id=${note.id}`, "edit" )
    );

    const runScriptFromNote = async (note: Note) => {
      let data = JSON.parse(note.data)
      let code = data.code

      const worker = new Worker(new URL("./script_worker.ts", import.meta.url), { type: "module" });
      const timer = setTimeout(() => {
        worker.terminate();
        popup(h2("ERROR"), p("timeout"))
      }, 2000);
      worker.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === "llm_request") {
          Promise.resolve(llmrequest(String(msg.prompt || "")))
            .then((result) => worker.postMessage({ type: "llm_response", id: msg.id, result }))
            .catch((err) => worker.postMessage({ type: "llm_response", id: msg.id, error: String(err) }));
          return;
        }
        if (msg.type !== "run_result") return;
        clearTimeout(timer);
        worker.terminate();
        if (msg.ok) {
          let result = NoteData(
            script_result_schema,
            {
              title: "result",
              scriptHash: `$${note.hash}`,
              content: msg.result
            }
          )
          submitNote(result)
          

        }else popup(h2("ERROR"), p(msg.error || "script error"))
      };
      worker.postMessage({ type: "run", code, input: {}});

    };

    getNoteById(note.schemaId)
    .then(schema=>{
      if (schema.hash == hashData(script_schema)){
        title.innerHTML = `Script ${JSON.parse(note.data).title} `
        title.append(
          button("run", {onclick: () => runScriptFromNote(note)})
        )
      }
    })
  });

  return overlay;
};
