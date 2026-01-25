import { hashData, script_schema } from "../spacetimedb/src/schemas";
import { getNoteById } from "./conn";
import { a, background, button, div, h2, h3, p, padding, popup, routeLink, span, style } from "./html";


const llmrequest = (prompt: string): string =>{

  console.log("request LLM:", prompt)
  return "<response>"

}


const runScriptFromNote = (note: Note) => {
  let code = "";
  try {
    code = String(JSON.parse(String(note.data))?.code || "");
  } catch (e: any) {
    popup(h2("ERROR"), p(e.message || "invalid json"));
    return;
  }
  if (!code.trim()) {
    popup(h2("ERROR"), p("missing code"));
    return;
  }
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./script_worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("timeout"));
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
      msg.ok ? resolve(msg.result) : reject(new Error(msg.error || "script error"));
    };
    worker.postMessage({ type: "run", code, input: {}});
  }).then(
    (res) => popup(h2("RESULT"), p(typeof res === "string" ? res : JSON.stringify(res, null, 2))),
    (e: any) => popup(h2("ERROR"), p(e.message || "script error"))
  );
};

export type Note = {
  id: number | string | bigint;
  hash: string;
  schemaId: number;
  data: string;
};

export const openNoteView = (note: Note,): HTMLElement => {
  const overlay = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));
  let noteLabel = String(note.id);
  try {
    const parsed = JSON.parse(note.data);
    if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
      noteLabel = parsed.title.trim();
    }
  } catch {}

  overlay.append(
    h3(`Note ${noteLabel}`),
    routeLink(`/${note.schemaId}`, "schema" ),
    div(
      style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
      note.data
    ),
    routeLink(`/edit?id=${note.id}`, "edit" )
  );

  getNoteById(note.schemaId)
  .then(schema=>{
    if (schema.hash == hashData(script_schema)) overlay.append(
      button("run", {
        style: { textDecoration: "underline", color: "inherit", background: "none", border: "none", padding: "0" },
        onclick: () => runScriptFromNote(note)
      })
    )
  })

  return overlay;
};
