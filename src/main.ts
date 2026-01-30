import { a, div, h2, p, popup, style } from "./html";
import { openNoteView } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { createSqlView } from "./sql_view";
import { createDepsView } from "./deps_view";
import { Hash, NoteData, Ref, tojson } from "../spacetimedb/src/notes"
import { addNote, getHash, getNote, query_data } from "./dbconn";

let runQuery = () => {};

export type Draft = {schemaHash: Hash, text: string}
let editFill: ((d:Draft) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let lastDraftRaw: string | null = null;
let handleRoute = () => {};
const body = document.body;

const render = (view: HTMLElement) => contentRoot && (contentRoot.innerHTML = "", contentRoot.appendChild(view));
const navigate = (path: string) => (history.pushState({}, "", path), handleRoute());


const submitNote = async (data: NoteData) => {
  try {
    const ref = await addNote(data.schemaHash, data.data);
    const hash = typeof ref === "string" ? ref.slice(1) : String(await getHash(ref));
    navigate(`/${hash}`);
  } catch (e: any) {
    popup(h2("ERROR"), p(e.message || "failed to add note"));
  }
}


const showNote = (hash: Hash) => render(openNoteView(hash, submitNote))


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
    const searchid = params.get("id");
    const isNew = params.get("new") === "1";
    if (isNew) localStorage.removeItem("edit_draft");
    if (searchid === null){
      const raw = localStorage.getItem("edit_draft");
      if (raw && raw !== lastDraftRaw) {
        lastDraftRaw = raw;
        try {
          const draft = JSON.parse(raw);
          editFill(draft)
        } catch {}
      } else {
        getHash(0).then((schemaHash) => editFill({schemaHash, text: "{}"})).catch(() => {});
      }
    }else{
      getNote(Number(searchid))
        .then((note) => editFill({schemaHash: note.schemaHash, text: tojson(note.data)}))
        .catch((e) => popup(h2("ERROR"), p(e.message))); 
    }
  } else if (!path) {
    render(dashboard.root);
    runQuery();
  } else if (path === "sql") {
    render(sqlView.root);
  } else if (path.startsWith("deps")) {
    render(depsView.root);
    depsView.render((path.slice(5) || lastNoteRef) as Ref);
  } else if (Number.isFinite(Number(path))) {
    getHash(Number(path)).then(hash=>{
      lastNoteRef = String(hash);
      showNote(hash)
    })
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

const dashboard = createDashboardView({ query: query_data, navigate});
const editView = createEditView({
  submit: submitNote
});
editFill = editView.fill;
const sqlView = createSqlView({ query: query_data });
const depsView = createDepsView({ query: query_data, navigate});

contentRoot = div(bubble);
body.appendChild(contentRoot);

runQuery = dashboard.runQuery;
render(dashboard.root);
handleRoute();

window.addEventListener("popstate", handleRoute);

// import { insert_scenarios } from "./scenarios";

// insert_scenarios()
