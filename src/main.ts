import { a, div, h2, p, popup, style } from "./html";
import { openNoteView, Note } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { createSqlView } from "./sql_view";
import { Hash, hashData, NoteData } from "../spacetimedb/src/schemas"
import { add_note, getNote, query_data } from "./dbconn";

let runQuery = () => {};
let editFill: ((schemaHash: string, data: string) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let lastDraftRaw: string | null = null;
let handleRoute = () => {};
const body = document.body;

const render = (view: HTMLElement) => contentRoot && (contentRoot.innerHTML = "", contentRoot.appendChild(view));
const navigate = (path: string) => (history.pushState({}, "", path), handleRoute());



const submitNote = async (data: NoteData) => {
  try {
    await add_note(data);
    const hash = hashData(data);
    navigate(`/${(await getNote(hash)).id}`);
  } catch (e: any) {
    popup(h2("ERROR"), p(e.message || "failed to add note"));
  }
}


const showNote = (hash: Hash) => render(openNoteView(hash, submitNote))


const setActive = () =>
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const target = (el as HTMLElement).dataset.nav || "";
    const path = window.location.pathname.replace(/^\/+/, "") || "dashboard";
    (el as HTMLElement).style.opacity = target === path ? "1" : "0.5";
  });

handleRoute = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
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
          if (draft.schemaHash) {
            editFill(String(draft.schemaHash), String(draft.data || ""));
          } else if (draft.schemaId) {
            getNote(Number(draft.schemaId))
              .then((schemaNote) => editFill(String(schemaNote.hash), String(draft.data || "")))
              .catch((e) => popup(h2("ERROR"), p(e.message)));
          }
        } catch {}
      } else {
        getNote(0).then((schemaNote) => editFill(String(schemaNote.hash), "{}")).catch(() => {});
      }
    }else{
      getNote(Number(searchid))
        .then((note) => getNote(Number(note.schemaId)).then((schemaNote) =>
          editFill(String(schemaNote.hash), String(note.data))
        ))
        .catch((e) => popup(h2("ERROR"), p(e.message))); 
    }
  } else if (!path) {
    render(dashboard.root);
    runQuery();
  } else if (path === "sql") {
    render(sqlView.root);
  } else if (Number.isFinite(Number(path))) {
    getNote(Number(path)).then(note=>showNote(note.hash))
  } else {
    showNote(path as Hash);
  }
  setActive();
};

const bubble = style({
  padding: "1.5em",
  margin: ".5em",
  borderRadius: "1em",
  background: "var(--background-color)",
  color: "var(--color)",
  border: "1px solid #ccc",
});


body.appendChild(div(
  style({ display: "flex", flexDirection: "column", gap: "0.75em", padding: "1em" }),
  a(style({ textDecoration: "none", color: "inherit" }), h2("Json View"), { href: "/", onclick: (e) => { e.preventDefault(); navigate("/"); } }),
  div(
    style({ display: "flex", gap: "1em" }),
    a({ style: { textDecoration: "none", color: "inherit", fontWeight: "bold" }, href: "/", "data-nav": "dashboard", onclick: (e) => { if (e.metaKey) return; e.preventDefault(); navigate("/"); } }, "Dashboard"),
    a(style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }), { href: "/edit", "data-nav": "edit", onclick: (e) => { e.preventDefault(); navigate("/edit"); } }, "Edit"),
    a(style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }), { href: "/sql", "data-nav": "sql", onclick: (e) => { e.preventDefault(); navigate("/sql"); } }, "SQL")
  )
));

const dashboard = createDashboardView({ query: query_data, navigate});
const editView = createEditView({
  submit: submitNote,
  onChange: (note) => {
    localStorage.setItem("edit_draft", JSON.stringify(note));
    if (window.location.pathname !== "/edit" || window.location.search) {
      history.replaceState({}, "", "/edit");
      setActive();
    }
  },
});
editFill = editView.fill;
const sqlView = createSqlView({ query: query_data });

contentRoot = div(bubble);
body.appendChild(contentRoot);

runQuery = dashboard.runQuery;
render(dashboard.root);
handleRoute();

window.addEventListener("popstate", handleRoute);
