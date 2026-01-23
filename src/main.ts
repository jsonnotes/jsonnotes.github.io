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

const server_request = (path: string, method: string, body: string | null = null) => {
  return fetch(`${db_url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}),
    },
    body,
  });
};

const setup = () => {
  return server_request("/v1/identity", "POST")
    .then((res) => res.json())
    .then((text) => {access_token = text.token;});
};

setup();

const add_note = (schemaId: string, data: string) => {
  const schemaIdValue = Number(schemaId || 0);
  return server_request(
    `/v1/database/${DBNAME}/call/add_note`,
    "POST",
    JSON.stringify({ schemaId: schemaIdValue, data })
  )
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      popup(h2("SUCESS"), p("data added"));
    })
    .catch((e) => {
      popup(h2("ERROR"), p(e.message));
    });
};

const query_data = async (sql: string) => {
  try {
    const res = await server_request(`/v1/database/${DBNAME}/sql`, "POST", sql);
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this");
    const { schema, rows } = data[0];
    const names = schema.elements.map((e) => e.name.some);
    return { names, rows };
  } catch (e: any) {
    console.error(e);
    popup(p(e.message));
    return { names: ["error"], rows: [e.message] };
  }
};

const rowToNote = (names: string[], row: any[]): Note => {
  const note: any = {};
  names.forEach((name, index) => {
    note[name] = row[index];
  });
  return note as Note;
};

const render = (view: HTMLElement) => {
  if (!contentRoot) return;
  contentRoot.innerHTML = "";
  contentRoot.appendChild(view);
};

const navigate = (path: string) => {
  history.pushState({}, "", path);
  handleRoute();
};

const showNoteById = (id: number) => {
  query_data(`select * from note where id = ${id} limit 1`)
    .then((data) => {
      if (!data.rows.length) throw new Error("note not found");
      const note = rowToNote(data.names, data.rows[0]);
      render(openNoteView(note, navigate));
    })
    .catch((e) => popup(h2("ERROR"), p(e.message)));
};

const setActive = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  const links = document.querySelectorAll("[data-nav]");
  links.forEach((el) => {
    const target = (el as HTMLElement).dataset.nav || "";
    const isActive = target === (path || "dashboard");
    (el as HTMLElement).style.opacity = isActive ? "1" : "0.5";
  });
};

const handleRoute = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path === "edit") {
    render(editView.root);
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    const id = idParam ? Number(idParam) : NaN;
    if (Number.isFinite(id) && editFill) {
      query_data(`select * from note where id = ${id} limit 1`)
        .then((data) => {
          if (!data.rows.length) throw new Error("note not found");
          const note = rowToNote(data.names, data.rows[0]);
          editFill(String(note.schemaId), String(note.data));
        })
        .catch((e) => popup(h2("ERROR"), p(e.message)));
    }
    setActive();
    return;
  }
  if (!path) {
    render(dashboard.root);
    runQuery();
    setActive();
    return;
  }
  const id = Number(path);
  if (Number.isFinite(id)) showNoteById(id);
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


body.appendChild(

  div(
    style({
      display: "flex",
      flexDirection: "column",
      alignItems: "left",
      gap: "0.75em", padding: "1em" }),
    a(
      style({textDecoration: "none", color: "inherit"}),
      h2("Json View"), {href: "/", onclick: (e) => {
      e.preventDefault();
      navigate("/");
    }}),
    div (
      style({ display: "flex", gap: "1em" }),
      a(
      {
        style: { textDecoration: "none", color: "inherit", fontWeight: "bold" },

        href: "/",
        "data-nav": "dashboard",
        onclick: (e) => {
          if (e.metaKey) return
          e.preventDefault();
          navigate("/");
        },
      },
      "Dashboard"
    ),
    a(
      style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }),
      {
        href: "/edit",
        "data-nav": "edit",
        onclick: (e) => {
          e.preventDefault();
          navigate("/edit");
        },
      },
      "Edit"
    ))
  )
);

const dashboard = createDashboardView({ query: query_data, navigate });
const editView = createEditView({
  submit: (schemaId, data) =>
    query_data(`select hash from note where id = ${Number(schemaId || 0)}`)
      .then((result) => {
        const schemaHash = String(result.rows[0]?.[0] ?? "").replace(/^"|"$/g, "");
        const hash = hashData(data, schemaHash);
        return add_note(schemaId, data)
          .then(() => query_data(`select id from note where hash = '${hash}'`))
          .then((rows) => rows.rows[0]?.[0] ?? null);
      })
      .then((id) => {
        if (id === null || id === undefined) return;
        const nextId = Number(id);
        if (Number.isFinite(nextId)) navigate(`/${nextId}`);
        if (window.location.pathname === "/") runQuery();
      }),
  validate: (schemaId, data) =>
    query_data(`select data from note where id = ${Number(schemaId || 0)}`)
      .then((result) => {
        const schemaData = String(result.rows[0]?.[0] ?? "");
        try {
          const ajv = new Ajv();
          const validate = ajv.compile(JSON.parse(schemaData));
          const value = JSON.parse(data);
          return validate(value) ? null : (validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
        } catch (e: any) {
          return e.message || "Invalid JSON";
        }
      }),
  onDirty: (schemaId, data) => {
    localStorage.setItem("edit_draft", JSON.stringify({ schemaId, data }));
    if (window.location.pathname !== "/edit" || window.location.search) {
      navigate("/edit");
    }
  },
  loadDraft: () => {
    const raw = localStorage.getItem("edit_draft");
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      return { schemaId: String(draft.schemaId || "0"), data: String(draft.data || "") };
    } catch {
      return null;
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
