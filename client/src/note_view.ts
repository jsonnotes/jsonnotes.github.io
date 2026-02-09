import { Hash, hashData, NoteData, script_schema, Jsonable, function_schema } from "@jsonview/core";
import { renderDom, type VDom } from "@jsonview/lib";
import { addNote, callProcedure, callNoteRemote, getNote, noteLink, noteOverview } from "./dbconn";

import { stringify } from "./helpers";
import { a, button, div, h2, h3, p, padding, popup, pre, routeLink, span, style } from "./html";

import { openrouter } from "./openrouter";


import { callNote } from "./call_note";


export const buildins = {
  openrouter: async (prompt: string, schema: Hash | Jsonable) => {

    if (typeof schema === "string") {
      const raw = schema.startsWith("#") ? schema.slice(1) : schema;
      if (/^[a-f0-9]{32}$/.test(raw)) {
        schema = (await getNote(raw as Hash)).data;
      }
    }
    return openrouter(prompt, schema)
  },
  getNote,
  addNote,
  callNote,
  remote: callNoteRemote

}




for (let exp of ["openrouter", "getNote", "addNote", "callNote", "remote"]) if (!Object.keys(buildins).includes(exp)) throw new Error("buildin missing but expected: "+ exp)

const linkify = (text: string) => {
  const el = span(style({margin:"0.5em"}));
  const re = /#([a-f0-9]{32})/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index;
    const raw = match[1];
    const token = raw as Hash;
    if (start > last) el.append(document.createTextNode(text.slice(last, start)));
    el.append(noteLink(token as Hash,)),
    last = start + match[0].length;
  }
  if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  return el;
};

export const openNoteView = (hash: Hash, submitNote: (data: NoteData) => Promise<void>): HTMLElement => {


  const overlay = div(style({display: "flex", flexDirection: "column", gap: "0.75em"}));


  getNote(hash).then(async note => {
    const schemaHash = note.schemaHash;

    const titleText = (note.data as any)?.title ?? "";

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
    const shortHash = hash.slice(0, 8);
    const title = h3(`${isScript ? "Script" : "Note"} #${shortHash} ${titleText} `);
    // if (note.schemaHash === hashData(server_function)) {
    //   const runAsyncFn = button("run async", { onclick: async () => {

    //     let lastarg = localStorage.getItem("server_fun_arg") ?? "{}";
    //     const argText = prompt("args as JSON (array or value)", lastarg);
    //     localStorage.setItem("server_fun_arg", argText)
    //     if (argText == null) return;
    //     try {
    //       runAsyncFn.textContent = "running...";
    //       const raw = await callProcedure("run_note_async", { hash, arg: argText });
    //       let out: any = raw;
    //       try { out = JSON.parse(raw); } catch {}
    //       if (typeof out === "string") {
    //         try { out = JSON.parse(out); } catch {}
    //       }
    //       popup(h2("result"), pre(JSON.stringify(out, null, 2)));
    //     } catch (e: any) {
    //       popup(h2("ERROR"), p(e.message || "run failed"));
    //     } finally {
    //       runAsyncFn.textContent = "run async";
    //     }
    //   }});

    //   title.append(runAsyncFn);
    // }

    if (note.schemaHash === hashData(function_schema)) {
      const isVDom = (value: unknown): value is VDom => {
        if (!value || typeof value !== "object") return false;
        const v = value as VDom;
        return (
          typeof v.tag === "string" &&
          typeof v.textContent === "string" &&
          typeof v.id === "string" &&
          typeof v.style === "object" &&
          Array.isArray(v.children)
        );
      };

      const vdomToggle = document.createElement("input");
      vdomToggle.type = "checkbox";
      vdomToggle.id = "render-vdom-toggle";
      vdomToggle.style.marginLeft = "0.75em";
      const vdomLabel = document.createElement("label");
      vdomLabel.htmlFor = vdomToggle.id;
      vdomLabel.style.marginLeft = "0.25em";
      vdomLabel.textContent = "render VDom";
      const vdomWrap = span(style({ marginLeft: "0.75em", fontSize: "0.9em" }), vdomToggle, vdomLabel);

      const showResult = (result: unknown) => {
        if (vdomToggle.checked && isVDom(result)) {
          popup(h2("result"), renderDom(() => result));
          return;
        }
        popup(h2("result"), pre(JSON.stringify(result, null, 2)));
      };

      const promptArgs = (storageKey: string) => {
        const fnData = note.data as any;
        const argNames = Object.keys(fnData?.args || {});
        const usesArgs = String(fnData?.code || "").includes("args");
        const needsArgs = argNames.length > 0 || usesArgs;
        if (!needsArgs) return { canceled: false, raw: null as string | null, parsed: undefined as any };

        const defaultArgs = argNames.length
          ? JSON.stringify(Object.fromEntries(argNames.map((n: string) => [n, null])), null, 2)
          : "{}";
        const lastarg = localStorage.getItem(storageKey) ?? defaultArgs;
        const argText = prompt("args as JSON object (use {} for none)", lastarg);
        if (argText == null) return { canceled: true, raw: null, parsed: undefined };
        const trimmed = argText.trim();
        if (!trimmed) {
          popup(h2("ERROR"), p("Args cannot be empty. Use {} for no arguments."));
          return { canceled: true, raw: null, parsed: undefined };
        }
        try {
          const parsed = JSON.parse(trimmed);
          localStorage.setItem(storageKey, trimmed);
          return { canceled: false, raw: trimmed, parsed };
        } catch (e: any) {
          popup(h2("ERROR"), p("Invalid JSON: " + e.message));
          return { canceled: true, raw: null, parsed: undefined };
        }
      };

      const runLocalFn = button("run local", { onclick: async () => {
        const { canceled, parsed } = promptArgs("local_fun_arg");
        if (canceled) return;
        const arg = parsed === undefined ? {} : parsed
        try {
          runLocalFn.textContent = "running...";
          const result = await callNote(hash, arg);
          showResult(result);
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runLocalFn.textContent = "run local";
        }
      }});

      const runRemoteFn = button("run remote", { onclick: async () => {
        const { canceled, parsed } = promptArgs("remote_fun_arg");
        if (canceled) return;
        try {
          runRemoteFn.textContent = "running...";
          const result = await callNoteRemote(hash, parsed);
          showResult(result);
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runRemoteFn.textContent = "run remote";
        }
      }});

      title.append(runLocalFn, runRemoteFn, vdomWrap);
    }

    updateContentDisplay();

    overlay.append(
      title,
      isScript ? "" : p("schema: ", noteLink(schemaHash)),
      isScript ? "" : div(style({ marginBottom: "0.5em" }), toggleViewBtn),
      contentDiv,
      div(
        style({ display: "flex", gap: "0.75em", alignItems: "center", paddingBottom: "0.5em" }),
        routeLink(`/edit?hash=${hash}`, "edit" ),
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
