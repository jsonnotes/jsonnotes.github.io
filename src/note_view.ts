import { Hash, hashData, NoteData, script_result_schema, script_schema, isRef, Ref, Jsonable, function_schema, server_function } from "../spacetimedb/src/notes";
import { addNote, callProcedure, getId, getNote, getSchemaId, noteLink, noteOverview } from "./dbconn";

import { stringify } from "./helpers";
import { a, button, div, h2, h3, p, padding, popup, pre, routeLink, span, style } from "./html";

import { openrouter } from "./openrouter";

import { buildins as buildinlist } from "./script_worker";



const callNote = async (fn: Ref, ...args: Jsonable[]) => {
  let note = await getNote(fn)
  if (note.schemaHash != hashData(function_schema)) throw new Error("can only call Function schema notes")
  let data = note.data as {code: string, inputs: string[]}
  let F = new Function(...data.inputs, data.code)

  return F(...args)

}


export const buildins = {
  openrouter: async (prompt: string, schema: Ref | Jsonable) => {

    if (isRef(schema)){
      schema = (await getNote(schema as Ref)).data
    }
    return openrouter(prompt, schema)
  },
  getNote,
  addNote,
  callNote

}




for (let exp of buildinlist) if (!Object.keys(buildins).includes(exp)) throw new Error("buildin missing but expected: "+ exp)

const linkify = (text: string) => {
  const el = span(style({margin:"0.5em"}));
  const re = /#([a-f0-9]+)/g;
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

      console.info({code})

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

          
          if (msg.result == undefined) return 
          let result = {
            schemaHash: hashData(script_result_schema),
            data: {
              title: "result",
              script: `#${hash}`,
              content: msg.result
            }
          } as NoteData
          rs(result)
        }else popup(h2("ERROR"), pre(msg.error || "script error"))
      };
      worker.postMessage({ type: "run", code, input: {}});
    })

    const isScript = note.schemaHash === hashData(script_schema)

    const text = isScript ? String((note.data as any).code || "") : stringify(note.data)

    let useOverview = localStorage.getItem("note_view_mode") === "overview";
    const contentDiv = div(style({ fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", overflowX: "auto", paddingBottom: "0.5em" }));

    const updateContentDisplay = () => {
      contentDiv.innerHTML = "";
      if (useOverview && !isScript) {
        noteOverview(hash).then(overview => {
          contentDiv.append(pre(linkify(overview)));
        });
      } else {
        contentDiv.append(linkify(text));
      }
    };

    const toggleViewBtn = button(useOverview ? "json view" : "overview", {
      onclick: () => {
        useOverview = !useOverview;
        localStorage.setItem("note_view_mode", useOverview ? "overview" : "json");
        toggleViewBtn.textContent = useOverview ? "json view" : "overview";
        updateContentDisplay();
      }
    });

    overlay.innerHTML = "";
    const title = h3(`${isScript ? "Script" : "Note"} #${id} ${titleText} `);
    if (isScript) {
      const runner = button("run", { onclick: () => {
        runner.innerHTML = "running..."
        runScriptFromNote(note).then(result=>submitNote(result))
      }});
      title.append(runner);
    }
    if (note.schemaHash === hashData(server_function)) {
      const runFn = button("run server", { onclick: async () => {

        let lastarg = localStorage.getItem("server_fun_arg") ?? "{}";
        const argText =  prompt("args as JSON (array or value)", lastarg);
        localStorage.setItem("server_fun_arg", argText)
        if (argText == null) return;
        try {
          runFn.textContent = "running...";
          const raw = await callProcedure("run_note_v2", { id, arg: argText });
          let out: any = raw;
          try { out = JSON.parse(raw); } catch {}
          if (typeof out === "string") {
            try { out = JSON.parse(out); } catch {}
          }
          popup(h2("result"), pre(JSON.stringify(out, null, 2)));
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runFn.textContent = "run server";
        }
      }});

      const runAsyncFn = button("run async", { onclick: async () => {

        let lastarg = localStorage.getItem("server_fun_arg") ?? "{}";
        const argText =  prompt("args as JSON (array or value)", lastarg);
        localStorage.setItem("server_fun_arg", argText)
        if (argText == null) return;
        try {
          runAsyncFn.textContent = "running...";
          const raw = await callProcedure("run_note_async", { id, arg: argText });
          let out: any = raw;
          try { out = JSON.parse(raw); } catch {}
          if (typeof out === "string") {
            try { out = JSON.parse(out); } catch {}
          }
          popup(h2("result"), pre(JSON.stringify(out, null, 2)));
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runAsyncFn.textContent = "run async";
        }
      }});

      title.append(runFn, runAsyncFn);
    }

    updateContentDisplay();

    overlay.append(
      title,
      isScript ? "" : p("schema: ", noteLink(schemaId)),
      isScript ? "" : div(style({ marginBottom: "0.5em" }), toggleViewBtn),
      contentDiv,
      div(
        style({ display: "flex", gap: "0.75em", alignItems: "center", paddingBottom: "0.5em" }),
        routeLink(`/edit?id=${id}`, "edit" ),
        routeLink(`/deps/${hash}`, "deps" ),
        button("copy", {
          onclick: (e) =>
            navigator.clipboard.writeText(text)
              .then(() => (e.target as HTMLElement).textContent = "copied")
              .catch((e) => popup(h2("ERROR"), p(e.message || "copy failed")))
        })
      )
    );



  });

  return overlay;
};
