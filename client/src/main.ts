import { a, div, h2, p, popup, pre, style } from "./html";
import { openNoteView } from "./note_view";
import { createDashboardView } from "./dashboard";
import { createEditView } from "./edit";
import { createSqlView } from "./sql_view";
import { createDepsView } from "./deps_view";
import { Hash, Jsonable, NoteData, tojson, hashData, top } from "@jsonview/core"
import { renderDom, type VDom } from "@jsonview/lib";

import { drawPipeline } from "./pipeline_view";
import { drawTraceRun } from "./pipeline_run";
import { llmcall } from "@jsonview/lib/src/example/pipeline";
import { callNote, mountView } from "./call_note";
import { addNote, getNote, sql } from "@jsonview/lib/src/dbconn";

let runQuery = () => {};

export type Draft = {schemaHash: Hash, text: string}
let editFill: ((d:Draft) => void) | null = null;
let contentRoot: HTMLElement | null = null;
let handleRoute = () => {};
const body = document.body;
let currentNoteRef: Hash | null = null;

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

type Route =
  | { kind: "dashboard" }
  | { kind: "edit", hash?: Hash, isNew: boolean }
  | { kind: "sql" }
  | { kind: "functionView", hash?: Hash }
  | { kind: "deps", hash?: Hash }
  | { kind: "pipeline", hash?: Hash }
  | { kind: "trace", hash?: Hash }
  | { kind: "note", hash: Hash };

const parseRoute = (pathname: string, search: string): Route => {
  const path = pathname.replace(/^\/+/, "");
  const params = new URLSearchParams(search);
  if (!path) return { kind: "dashboard" };
  if (path === "edit") {
    const hash = params.get("hash");
    return { kind: "edit", hash: hash ? hash as Hash : undefined, isNew: params.get("new") === "1" };
  }
  if (path === "sql") return { kind: "sql" };
  if (path.startsWith("view/")) return { kind: "functionView", hash: (path.slice(5) || undefined) as Hash | undefined };
  if (path === "deps" || path.startsWith("deps/")) return { kind: "deps", hash: (path.slice(5) || undefined) as Hash | undefined };
  if (path === "pipeline" || path.startsWith("pipeline/")) return { kind: "pipeline", hash: (path.slice(9) || undefined) as Hash | undefined };
  if (path === "trace" || path.startsWith("trace/")) return { kind: "trace", hash: (path.slice(6) || undefined) as Hash | undefined };
  return { kind: "note", hash: path as Hash };
};

const routeNoteHash = (route: Route): Hash | null => {
  if (route.kind === "note") return route.hash;
  if (route.kind === "edit") return route.hash ?? null;
  if (route.kind === "functionView") return route.hash ?? null;
  if (route.kind === "deps") return route.hash ?? null;
  if (route.kind === "pipeline") return route.hash ?? null;
  if (route.kind === "trace") return route.hash ?? null;
  return null;
};

const navKey = (route: Route) => {
  if (route.kind === "dashboard") return "/";
  if (route.kind === "edit") return "/edit";
  if (route.kind === "sql") return "/sql";
  if (route.kind === "deps") return "/deps";
  if (route.kind === "pipeline") return "/pipeline";
  if (route.kind === "trace") return "/trace";
  if (route.kind === "functionView") return "/view";
  return "/view-note";
};

const resolveNavPath = (base: string): string => {
  if (!currentNoteRef) return base;
  if (base === "/view-note") return `/${currentNoteRef}`;
  if (base === "/edit") return `/edit?hash=${currentNoteRef}`;
  if (base === "/deps") return `/deps/${currentNoteRef}`;
  if (base === "/pipeline") return `/pipeline/${currentNoteRef}`;
  if (base === "/trace") return `/trace/${currentNoteRef}`;
  return base;
};

handleRoute = () => {
  const route = parseRoute(window.location.pathname, window.location.search);
  const routeHash = routeNoteHash(route);
  if (routeHash) currentNoteRef = routeHash;

  navitems.forEach(({ base, el }) => {
    const target = resolveNavPath(base);
    el.setAttribute("href", target);
    el.style.setProperty("opacity", base === navKey(route) ? "1" : "0.5");
  });

  if (route.kind === "edit") {
    render(editView.root);
    if (route.isNew) localStorage.removeItem("edit_draft");
    if (!route.hash){
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
      getNote(route.hash)
        .then((note) => editFill({schemaHash: note.schemaHash, text: tojson(note.data)}))
        .catch((e) => popup(h2("ERROR"), p(e.message)));
    }
    if (route.isNew) {
      history.replaceState({}, "", "/edit");
    }
  } else if (route.kind === "dashboard") {
    render(dashboard.root);
    runQuery();
  } else if (route.kind === "sql") {
    render(sqlView.root);
  } else if (route.kind === "functionView") {
    if (!route.hash) render(div(h2("ERROR"), p("missing function hash")));
    else showFunctionView(route.hash);
  } else if (route.kind === "deps") {
    const hash = route.hash || currentNoteRef || undefined;
    render(depsView.root);
    depsView.render(hash);
  } else if (route.kind === "pipeline") {
    const hash = route.hash || currentNoteRef || undefined;
    render(div("loading..."));
    const data = hash
      ? getNote(hash).then(n => n.data)
      : Promise.resolve(llmcall.data as Jsonable);
    data
      .then(d => drawPipeline(d))
      .then(maker => render(renderDom(maker)))
      .catch(e => render(div(h2("ERROR"), p(e.message))));
  } else if (route.kind === "trace") {
    const hash = route.hash || currentNoteRef || undefined;
    if (!hash) {
      render(div(h2("ERROR"), p("missing trace hash")));
      return;
    }
    render(div("loading..."));
    drawTraceRun(hash)
      .then(maker => render(renderDom(maker)))
      .catch(e => render(div(h2("ERROR"), p(e.message))));
  } else {
    showNote(route.hash);
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


const navitems = [
  ["Dashboard", "/"],
  ["View", "/view-note"],
  ["Edit", "/edit"],
  ["SQL", "/sql"],
  ["Deps", "/deps"],
  ["Pipeline", "/pipeline"],
  ["Trace", "/trace"],
].map(([name, base]) => {
  const link = a(style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }), {"href": base, onclick: (e) => {
  const target = resolveNavPath(base);
  if (e.metaKey || e.ctrlKey) {
    link.setAttribute("href", target);
    return;
  }
  e.preventDefault()
  navigate(target)
}}, name) as HTMLAnchorElement;
  return { base, el: link };
});

body.appendChild(div(
  style({ display: "flex", flexDirection: "column", gap: "0.75em", padding: "1em" }),
  a(style({ textDecoration: "none", color: "inherit" }), h2("Json View"), { href: "/", onclick: (e) => { e.preventDefault(); navigate("/"); } }),
  div(style({ display: "flex", gap: "1em" }), navitems.map((n) => n.el) )
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
// ensureAccessToken().catch(() => {});
handleRoute();

window.addEventListener("popstate", handleRoute);
