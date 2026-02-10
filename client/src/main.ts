import { a, div, h2, p, popup, pre, style } from "./html";
import { openNoteView } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { createSqlView } from "./sql_view";
import { createDepsView } from "./deps_view";
import { Hash, NoteData, tojson, hashData, top } from "@jsonview/core"
import { addNote, ensureAccessToken, getNote, renderDom, sql, type VDom } from "@jsonview/lib";
import { drawPipeline } from "./pipeline_view";
import { llmcall } from "@jsonview/lib/src/example/pipeline";
import { callNote, mountView } from "./call_note";

let runQuery = () => {};

export type Draft = {schemaHash: Hash, text: string}
let editFill: ((d:Draft) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let handleRoute = () => {};
const body = document.body;

const render = (view: HTMLElement) => contentRoot && (contentRoot.innerHTML = "", contentRoot.appendChild(view));
const navigate = (path: string) => (history.pushState({}, "", path), handleRoute());


const submitNote = async (data: NoteData) => {
  try {
    const hash = await addNote(data)
    navigate(`/${hash}`);
  } catch (e: any) {
    popup(h2("ERROR"), p(e.message || "failed to add note"));
  }
}


const showNote = (hash: Hash) => render(openNoteView(hash, submitNote))
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
const showFunctionView = (hash: Hash) => {
  render(div("running..."));
  callNote(hash, {}, {
    view: (renderView) => mountView(renderView, render),
  }).then((res) => {
    if (res === undefined) return;
    if (isVDom(res)) render(renderDom(() => res));
    else render(pre(typeof res === "string" ? res : JSON.stringify(res, null, 2)));
  }).catch((e: any) => {
    render(div(h2("ERROR"), p(e.message || "view call failed")));
  });
}


const navKey = (path: string) => {
  if (!path) return "/";
  if (path.startsWith("deps/")) return "/deps";
  return `/${path}`;
};

handleRoute = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  console.log(path)

  navitems.forEach((it) => {
    it.style.setProperty("opacity", it.pathname === navKey(path) ? "1" : "0.5");
  });
  if (path === "edit") {
    render(editView.root);
    const params = new URLSearchParams(window.location.search);
    const searchhash = params.get("hash");
    const isNew = params.get("new") === "1";
    if (isNew) localStorage.removeItem("edit_draft");
    if (searchhash === null){
      const raw = localStorage.getItem("edit_draft");
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          editFill(draft)
        } catch {
          const schemaHash = hashData(top);
          editFill({schemaHash, text: "{}"});
        }
      } else {
        const schemaHash = hashData(top);
        editFill({schemaHash, text: "{}"});
      }
    } else {
      getNote(searchhash as Hash)
        .then((note) => editFill({schemaHash: note.schemaHash, text: tojson(note.data)}))
        .catch((e) => popup(h2("ERROR"), p(e.message)));
    }
    if (window.location.search) {
      history.replaceState({}, "", "/edit");
    }
  } else if (!path) {
    render(dashboard.root);
    runQuery();
  } else if (path === "sql") {
    render(sqlView.root);
  } else if (path.startsWith("view/")) {
    const hash = path.slice(5);
    if (!hash) render(div(h2("ERROR"), p("missing function hash")));
    else showFunctionView(hash as Hash);
  } else if (path.startsWith("deps")) {
    render(depsView.root);
    depsView.render((path.slice(5) || lastNoteRef) as Hash);
  } else if (path === "pipeline" || path.startsWith("pipeline/")) {
    const hash = path.slice(9);
    if (!hash) render(renderDom(() => drawPipeline(llmcall.data)));
    else {
      render(div("loading..."));
      getNote(hash as Hash).then(note => {
        render(renderDom(() => drawPipeline(note.data)));
      }).catch(e => render(div(h2("ERROR"), p(e.message))));
    }
  } else {
    lastNoteRef = path;
    showNote(path as Hash);
  }
};

const bubble = style({
  padding: "1.5em",
  margin: ".5em",
  borderRadius: "1em",
  background: "var(--background-color)",
  color: "var(--color)",
  border: "1px solid #ccc",
});


let lastNoteRef: string | null = null;

let navitems = [
  ["Dashboard", "/"],
  ["Edit", "/edit"],
  ["SQL", "/sql"],
  ["Deps", "/deps"],
  ["Pipeline", "/pipeline"],
].map(([name, path])=>a(style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }), {"href": path, onclick: (e)=>{
  if (e.metaKey) return
  e.preventDefault()
  navigate(path)
}}, name))

body.appendChild(div(
  style({ display: "flex", flexDirection: "column", gap: "0.75em", padding: "1em" }),
  a(style({ textDecoration: "none", color: "inherit" }), h2("Json View"), { href: "/", onclick: (e) => { e.preventDefault(); navigate("/"); } }),
  div(style({ display: "flex", gap: "1em" }),navitems  )
));

const dashboard = createDashboardView({ query: sql, navigate});
const editView = createEditView({
  submit: submitNote
});
editFill = editView.fill;
const sqlView = createSqlView({ query: sql });
const depsView = createDepsView({ query: sql, navigate});

contentRoot = div(bubble);
body.appendChild(contentRoot);

runQuery = dashboard.runQuery;
render(dashboard.root);
ensureAccessToken().catch(() => {});
handleRoute();

window.addEventListener("popstate", handleRoute);
