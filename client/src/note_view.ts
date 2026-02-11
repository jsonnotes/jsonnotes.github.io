import { Hash, hashData, NoteData, script_schema, function_schema } from "@jsonview/core";
import { jsonOverview, splitRefs, type VDom } from "@jsonview/lib";
import { getNote, callNote as callNoteRemote } from "@jsonview/lib/src/dbconn";
import { graph_schema } from "@jsonview/lib/src/example/pipeline";
import { noteLink, stringify } from "./helpers";
import { button, div, h2, h3, p, popup, pre, routeLink, span, style } from "./html";
import { callNote, mountView, promptArgs, showResult } from "./call_note";

const linkify = (text: string) => {
  const el = span(style({margin:"0.5em"}));
  splitRefs(text).forEach(tok => {
    if (tok.type === "text") el.append(document.createTextNode(tok.value));
    else el.append(noteLink(tok.value as Hash));
  })
  return el;
};

export const openNoteView = (hash: Hash, submitNote: (data: NoteData) => Promise<void>): HTMLElement => {


  const overlay = div(style({display: "flex", flexDirection: "column", gap: "0.75em"}));


  getNote(hash).then(async note => {
    const schemaHash = note.schemaHash;
    const isGraph = schemaHash === hashData(graph_schema);

    const titleText = (note.data as any)?.title ?? "";

    const isScript = note.schemaHash === hashData(script_schema)

    const text = isScript ? String((note.data as any).code || "") : stringify(note.data)

    let useOverview = localStorage.getItem("note_view_mode") === "overview";
    const contentDiv = div(style({ fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", overflowX: "auto", paddingBottom: "0.5em" }));

    const updateContentDisplay = () => {
      contentDiv.innerHTML = "";
      if (useOverview && !isScript) {
        getNote(hash).then(n => {
          contentDiv.append(pre(linkify(jsonOverview(n.data))));
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

    if (note.schemaHash === hashData(function_schema)) {
      const fnData = note.data as any;

      const runLocalFn = button("run local", { onclick: async () => {
        const { canceled, parsed } = promptArgs(fnData, "local_fun_arg");
        if (canceled) return;
        try {
          runLocalFn.textContent = "running...";
          const res = await callNote(hash, parsed ?? {}, {
            view: (renderView) => mountView(renderView, (rendered) => {
              overlay.innerHTML = "";
              overlay.append(rendered);
              history.pushState({}, "", `/view/${hash}`);
            }),
          });
          showResult(res);
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runLocalFn.textContent = "run local";
        }
      }});

      const runRemoteFn = button("run remote", { onclick: async () => {
        const { canceled, parsed } = promptArgs(fnData, "remote_fun_arg");
        if (canceled) return;
        try {
          runRemoteFn.textContent = "running...";
          const res = await callNoteRemote(hash, parsed ?? {});
          showResult(res);
        } catch (e: any) {
          popup(h2("ERROR"), p(e.message || "run failed"));
        } finally {
          runRemoteFn.textContent = "run remote";
        }
      }});

      title.append(runLocalFn, runRemoteFn);
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
        isGraph ? routeLink(`/pipeline/${hash}`, "pipeline") : "",
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
