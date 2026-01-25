import { hashData, script_schema } from "../spacetimedb/src/schemas";
import { getNoteById } from "./conn";
import { a, button, div, h2, h3, noteLink, p, popup, style } from "./html";


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
      clearTimeout(timer);
      worker.terminate();
      const { ok, result, error } = e.data || {};
      ok ? resolve(result) : reject(new Error(error || "script error"));
    };
    worker.postMessage({ code, input: {}});
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

const formatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export const openNoteView = (note: Note,): HTMLElement => {
  const overlay = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));

  const dataView = div(
    style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
    formatJson(note.data)
  );

  const schemaButton = noteLink(
    note.schemaId,
    { style: { textDecoration: "underline", color: "inherit" } },
    `schema: ${note.schemaId}`
  );

  const editLink = a(
    { style: { textDecoration: "underline", color: "inherit" }, href: `/edit?id=${note.id}` },
    "edit"
  );



  let noteLabel = String(note.id);
  try {
    const parsed = JSON.parse(note.data);
    if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
      noteLabel = parsed.title.trim();
    }
  } catch {}

  overlay.append(
    h3(`Note ${noteLabel}`),
    schemaButton,
    dataView,
    editLink,
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
