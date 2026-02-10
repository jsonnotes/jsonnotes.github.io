
import { button, div, p, routeLink, style } from "./html";
import { function_schema, hashData, script_result_schema, script_schema, top } from "@jsonview/core";
import { newestRows } from "@jsonview/lib";
import { createSchemaPicker, noteLink, noteSearch } from "./helpers";

type QueryResult = { names: string[]; rows: any[][] };

type DashboardDeps = {
  query: (sql: string) => Promise<QueryResult>;
  navigate: (path: string) => void;
  onRow?: (row: any) => void;
};

export const createDashboardView = ({ query, navigate, onRow }: DashboardDeps) => {
  const schemaHashAny = "any";
  const schemaHashScript = hashData(script_schema);
  const schemaHashScriptResult = hashData(script_result_schema);
  const topHash = hashData(top);

  let cachedCount: number | null = null;
  let cachedRows: Map<string, any[][]> = new Map(); // schema -> rows

  const result = div();
  const schemaSelect = div(
    style({ display: "flex", gap: "0.5em", alignItems: "center", flexWrap: "wrap" }),
    button("any", { onclick: () => setSchema(schemaHashAny) }),
    button("function", { onclick: () => setSchema(hashData(function_schema)) }),
    button("script", { onclick: () => setSchema(schemaHashScript) }),
    button("script output", { onclick: () => setSchema(schemaHashScriptResult) }),
    createSchemaPicker((s) => setSchema(s.hash))
  );
  let currentSchema = schemaHashAny;

  const openSearch = () => noteSearch((note) => navigate(`/${note.hash}`));

  const setSchema = (value: string) => {
    currentSchema = value;
    runQuery();
  };

  const renderRows = (rows: any[][]) => {
    result.innerHTML = "";
    const list = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
    rows.forEach((row) => {
      const note = { hash: row[0], data: row[1] };
      onRow && onRow(note);
      list.append(noteLink(note.hash));
    });
    result.append(list);
  };

  const runQuery = async () => {
    const maxitems = 50;

    // Show cached immediately if available
    if (cachedRows.has(currentSchema)) {
      renderRows(cachedRows.get(currentSchema)!);
    } else {
      result.innerHTML = "";
      result.append(p("running..."));
    }

    let currentCount: number | null = null;
    try {
      const countRes = await query("select count from note_count");
      currentCount = Number(countRes.rows[0][0]);
    } catch {}

    // Cache still valid - no need to refetch
    if (currentCount !== null && currentCount === cachedCount && cachedRows.has(currentSchema)) {
      return;
    }

    // Cache miss - invalidate all cached rows on count change
    if (currentCount !== cachedCount) {
      cachedRows.clear();
      cachedCount = currentCount;
    }

    const sql = currentSchema === schemaHashAny
      ? "select hash, data from note"
      : `select hash, data from note where schemaHash = '${currentSchema}'`;
    const data = await query(sql);
    const rows = newestRows(data.rows, maxitems);
    cachedRows.set(currentSchema, rows);
    renderRows(rows);
  };

  const searchButton = button("🔍 Search Notes", {
    onclick: openSearch,
    style: {
      padding: "0.25em 0.5em",
      border: "1px solid #ccc",
      borderRadius: "0.25em",
      background: "inherit",
      color: "inherit",
      cursor: "pointer"
    }
  });

  const root = div(
    style({ display: "flex", flexDirection: "column", gap: "0.75em" }),
    div(
      style({ display: "flex", gap: "0.5em", flexWrap: "wrap" }),
      routeLink(
        "/edit?new=1",
        { style: { textDecoration: "none", color: "inherit", fontWeight: "bold", border: "1px solid #ccc", borderRadius: "0.25em", padding: "0.25em 0.5em" } },
        "+ Add Note"
      ),
      searchButton
    ),
    schemaSelect,
    result
  );

  return { root, runQuery };
};
