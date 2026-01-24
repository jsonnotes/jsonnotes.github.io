import { a, div, h2, p, popup, style } from "./html";
import { openNoteView, Note } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { Ajv } from "ajv";
import { hashData } from "../spacetimedb/src/schemas"
import { hash128 } from "./hash";

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000";
const body = document.body;
// const DBNAME = "jsonviewtest";
const DBNAME = "jsonview"

let access_token: string | null = null;
let runQuery = () => {};
let editFill: ((schemaHash: string, data: string) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let lastDraftRaw: string | null = null;
let handleRoute = () => {};
const noteCachePrefix = "note:";
const noteHashPrefix = "note_hash:";

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

const FunCache = <X,Y> (fn: (x:X) => Promise<Y>) : ((x:X)=>Promise<Y>) => {
  const HotCache = new Map<string,Y>();
  const fkey = hash128(fn.toString() + ":cached")
  return async (x:X) => {
    const lkey = fkey + JSON.stringify(x)
    if (HotCache.has(lkey)) return HotCache.get(lkey)!
    const raw = localStorage.getItem(lkey)
    if (raw) {
      const res = JSON.parse(raw)
      HotCache.set(lkey, res)
      return res
    }
    const res = await fn(x)
    localStorage.setItem(lkey, JSON.stringify(res))
    HotCache.set(lkey, res)
    return res 
  }
}

const getNote = FunCache(async (hash: string) =>
  query_data(`select * from note where hash = '${hash}'`)
  .then(({ names, rows }) => {
    if (!rows[0]) throw new Error("note not found")
    return noteFrom(names, rows[0])
  })
)

const getHashFromId = FunCache(async (id: number) =>
  query_data(`select hash from note where id = ${id}`)
  .then(({ rows }) => {
    if (!rows[0]) throw new Error("note not found")
    return String(rows[0][0])
  })
)

const getNoteById = (id: number) => getHashFromId(id).then(getNote)
const render = (view: HTMLElement) => contentRoot && (contentRoot.innerHTML = "", contentRoot.appendChild(view));
const navigate = (path: string) => (history.pushState({}, "", path), handleRoute());

const showNoteById = (id: number) => getNoteById(id).then((note) => render(openNoteView(note, navigate))).catch((e) => popup(h2("ERROR"), p(e.message)));

req("/v1/identity", "POST").then((res) => res.json()).then((text) => { access_token = text.token; });

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
    const searchid = new URLSearchParams(window.location.search).get("id");
    if (searchid === null){
      const raw = localStorage.getItem("edit_draft");
      if (raw && raw !== lastDraftRaw) {
        lastDraftRaw = raw;
        try {
          const draft = JSON.parse(raw);
          if (draft.schemaHash) {
            editFill(String(draft.schemaHash), String(draft.data || ""));
          } else if (draft.schemaId) {
            getNoteById(Number(draft.schemaId))
              .then((schemaNote) => editFill(String(schemaNote.hash), String(draft.data || "")))
              .catch((e) => popup(h2("ERROR"), p(e.message)));
          }
        } catch {}
      } else {
        getNoteById(0).then((schemaNote) => editFill(String(schemaNote.hash), "{}")).catch(() => {});
      }
    }else{
      getNoteById(Number(searchid))
        .then((note) => getNoteById(Number(note.schemaId)).then((schemaNote) =>
          editFill(String(schemaNote.hash), String(note.data))
        ))
        .catch((e) => popup(h2("ERROR"), p(e.message))); 
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

const dashboard = createDashboardView({ query: query_data, navigate});
const editView = createEditView({
  submit: async (schemaHash, data) => {
    const schemaNote = await getNote(schemaHash);
    const hash = hashData(data, schemaHash);
    await add_note(String(schemaNote.id), data);
    const note = await getNote(hash);
    navigate(`/${note.id}`);
    if (window.location.pathname === "/") runQuery();
  },
  validate: (schemaHash, data) =>
    getNote(schemaHash)
      .then((schemaNote) => {
        try {
          const validate = new Ajv().compile(JSON.parse(String(schemaNote.data)));
          return validate(JSON.parse(data)) ? null : (validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
        } catch (e: any) {
          return e.message || "Invalid JSON";
        }
      })
      .catch((e) => e.message || "Schema not found"),
  onChange: (schemaHash, data) => {
    localStorage.setItem("edit_draft", JSON.stringify({ schemaHash, data }));
    if (window.location.pathname !== "/edit" || window.location.search) {
      history.replaceState({}, "", "/edit");
      setActive();
    }
  },
  fetchSchema: (schemaHash) =>
    getNote(schemaHash).then((note) => ({ id: String(note.id), data: String(note.data) })),
  fetchSchemaList: () =>
    query_data("select id, data, hash from note where schemaId = 0")
      .then((r) => r.rows.map((row) => {
        const id = String(row[0]);
        let title = "";
        try {
          const parsed = JSON.parse(String(row[1] ?? ""));
          title = parsed?.title ? String(parsed.title) : "";
        } catch {}
        const hash = String(row[2] ?? "").replace(/^"|"$/g, "");
        return { id, title, hash };
      })),
});
editFill = editView.fill;

contentRoot = div(bubble);
body.appendChild(contentRoot);

runQuery = dashboard.runQuery;
render(dashboard.root);
handleRoute();

window.addEventListener("popstate", handleRoute);
