import { a, div, h2, p, popup, style } from "./html";
import { openNoteView, Note } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { Ajv } from "ajv";
import { hashData } from "../spacetimedb/src/schemas"

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000";
const body = document.body;
// const DBNAME = "jsonviewtest";
const DBNAME = "jsonview"

let access_token: string | null = null;
let runQuery = () => {};
let editFill: ((schemaId: string, data: string) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let lastDraftRaw: string | null = null;

const req = (path: string, method: string, body: string | null = null) =>
  fetch(`${db_url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}) },
    body,
  });

const query_data = async (sql: string) => {
  try {
    const text = await (await req(`/v1/database/${DBNAME}/sql`, "POST", sql)).text();
    const data = JSON.parse(text);
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this");
    const { schema, rows } = data[0];
    return { names: schema.elements.map((e) => e.name.some), rows };
  } catch (e: any) {
    console.error(e);
    popup(p(e.message));
    return { names: ["error"], rows: [e.message] };
  }
};

const add_note = (schemaId: string, data: string) =>
  req(`/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify({ schemaId: Number(schemaId || 0), data }))
    .then((res) => res.ok ? popup(h2("SUCESS"), p("data added")) : res.text().then((t) => Promise.reject(new Error(t || `Request failed (${res.status})`))))
    .catch((e) => popup(h2("ERROR"), p(e.message)));

const noteFrom = (names: string[], row: any[]): Note => Object.fromEntries(names.map((n, i) => [n, row[i]])) as Note;
const render = (view: HTMLElement) => contentRoot && (contentRoot.innerHTML = "", contentRoot.appendChild(view));
const navigate = (path: string) => (history.pushState({}, "", path), handleRoute());
const getNote = (id: number) =>
  query_data(`select * from note where id = ${id} limit 1`).then((data) => {
    if (!data.rows.length) throw new Error("note not found");
    return noteFrom(data.names, data.rows[0]);
  });
const showNoteById = (id: number) => getNote(id).then((note) => render(openNoteView(note, navigate))).catch((e) => popup(h2("ERROR"), p(e.message)));

req("/v1/identity", "POST").then((res) => res.json()).then((text) => { access_token = text.token; });

const setActive = () =>
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const target = (el as HTMLElement).dataset.nav || "";
    const path = window.location.pathname.replace(/^\/+/, "") || "dashboard";
    (el as HTMLElement).style.opacity = target === path ? "1" : "0.5";
  });

const handleRoute = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path === "edit") {
    render(editView.root);
    const searchid = new URLSearchParams(window.location.search).get("id");
    if (searchid === null){
      const raw = localStorage.getItem("edit_draft");
      if (raw && raw !== lastDraftRaw) {
        lastDraftRaw = raw;
        try {
          const draft = JSON.parse(raw);
          editFill(String(draft.schemaId || "0"), String(draft.data || ""));
        } catch {}
      }
    }else{
      getNote(Number(searchid)).then((note) => editFill(String(note.schemaId), String(note.data))).catch((e) => popup(h2("ERROR"), p(e.message))); 
    }
  } else if (!path) {
    render(dashboard.root);
    runQuery();
  } else if (Number.isFinite(Number(path))) {
    showNoteById(Number(path));
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
    a(style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }), { href: "/edit", "data-nav": "edit", onclick: (e) => { e.preventDefault(); navigate("/edit"); } }, "Edit")
  )
));

const dashboard = createDashboardView({ query: query_data, navigate });
const editView = createEditView({
  submit: (schemaId, data) =>
    query_data(`select hash from note where id = ${Number(schemaId || 0)}`)
      .then((r) => String(r.rows[0]?.[0] ?? "").replace(/^"|"$/g, ""))
      .then((schemaHash) => add_note(schemaId, data).then(() => query_data(`select id from note where hash = '${hashData(data, schemaHash)}'`)))
      .then((r) => r.rows[0]?.[0])
      .then((id) => {
        if (id === null || id === undefined) return;
        const nextId = Number(id);
        if (Number.isFinite(nextId)) navigate(`/${nextId}`);
        if (window.location.pathname === "/") runQuery();
      }),
  validate: (schemaId, data) =>
    query_data(`select data from note where id = ${Number(schemaId || 0)}`)
      .then((r) => String(r.rows[0]?.[0] ?? ""))
      .then((schemaData) => {
        try {
          const validate = new Ajv().compile(JSON.parse(schemaData));
          return validate(JSON.parse(data)) ? null : (validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
        } catch (e: any) {
          return e.message || "Invalid JSON";
        }
      }),
  onChange: (schemaId, data) => {
    localStorage.setItem("edit_draft", JSON.stringify({ schemaId, data }));
    if (window.location.pathname !== "/edit" || window.location.search) {
      history.replaceState({}, "", "/edit");
      setActive();
    }
  },
});
editFill = editView.fill;

contentRoot = div(bubble);
body.appendChild(contentRoot);

runQuery = dashboard.runQuery;
render(dashboard.root);
handleRoute();

window.addEventListener("popstate", handleRoute);
