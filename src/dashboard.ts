
import { button, div, p, routeLink, style } from "./html";
import { function_schema, hashData, script_result_schema, script_schema } from "../spacetimedb/src/notes";
import { createSchemaPicker, noteSearch, SchemaEntry } from "./helpers";
import { noteLink } from "./dbconn";

type QueryResult = { names: string[]; rows: any[][] };

type DashboardDeps = {
  query: (sql: string) => Promise<QueryResult>;
  navigate: (path: string) => void;
  onRow?: (row: any) => void;
};

export const createDashboardView = ({ query, navigate, onRow }: DashboardDeps) => {
  let lastId = 100;
  const schemaHashAny = "any";
  const schemaHashScript = hashData(script_schema);
  const schemaHashScriptResult = hashData(script_result_schema);

  const result = div();
  const schemaSelect = div(
    style({ display: "flex", gap: "0.5em", alignItems: "center", flexWrap: "wrap" }),
    button("any", { onclick: () => setSchema(schemaHashAny) }),
    button("function", { onclick: () => setSchema(hashData(function_schema)) }),
    button("script", { onclick: () => setSchema(schemaHashScript) }),
    button("script output", { onclick: () => setSchema(schemaHashScriptResult) }),
    createSchemaPicker(
      () =>
        Promise.all([
          query("select id, data, hash from note where schemaId = 0"),
          query("select schemaId from note")
        ]).then(([schemasRes, countsRes]) => {
          const counts = new Map<string, number>();
          countsRes.rows.forEach((row) => {
            const id = String(row[0]);
            counts.set(id, (counts.get(id) || 0) + 1);
          });
          return schemasRes.rows.map((row) => {
            let title = "";
            try {
              const parsed = JSON.parse(String(row[1] ?? ""));
              title = parsed?.title ? String(parsed.title) : "";
            } catch {}
            const id = String(row[0]);
            return { id, title, hash:String(row[2] ?? ""), count: counts.get(id) || 0 };
          });
        }),
      (s) => setSchema(s.hash)
    )
  );
  let currentSchema = schemaHashAny;

  const fetchAllNotes = (): Promise<SchemaEntry[]> =>
    query("select id, data, hash from note limit 200").then((r) =>
      r.rows.map((row) => {
        let title = "";
        try {
          title = JSON.parse(String(row[1] ?? ""))?.title ?? "";
        } catch {}
        return { id: String(row[0]), title, hash: String(row[2] ?? "") };
      })
    );

  const openSearch = () => {
    fetchAllNotes().then((notes) => {
      noteSearch((note) => navigate(`/${note.id}`), notes);
    });
  };

  const setSchema = (value: string) => {
    currentSchema = value;
    runQuery();
  };

  const runQuery = async () => {

    let maxitems = 50;

    result.innerHTML = "";
    result.append(p("running..."));
    let schemaId: number | null = null;
    try {
      const countRes = await query("select count from note_count");
      lastId = Math.max(maxitems, Number(countRes.rows[0][0]))
    } catch {}
    if (currentSchema !== schemaHashAny) {
      if (/^\d+$/.test(currentSchema)) schemaId = Number(currentSchema);
      else {
        const lookup = await query(`select id from note where hash = '${currentSchema}'`);
        schemaId = lookup.rows[0]?.[0] ?? null;
      }
    }
    if (currentSchema !== schemaHashAny && schemaId === null) {
      result.innerHTML = "";
      result.append(p("no matches"));
      return;
    }
    const range = `id >= ${(lastId - maxitems)} and id < ${lastId}`;
    const where = schemaId === null ? range : `schemaId = ${schemaId} and ${range}`;
    const sql = `select id, data from note where ${where} limit 50`;
    query(sql).then((data) => {
      result.innerHTML = "";
      const list = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
      const rows = [...data.rows].reverse();
      rows.forEach((row) => {
        const note: any = {};
        data.names.forEach((name, index) => {
          note[name] = row[index];
        });
        onRow && onRow(note);
        let text = String(note.data ?? "");
        text = text.replace(/[\n\r]/g, "");
        text = text.length > 60 ? text.substring(0, 60) + "..." : text;
        list.append(noteLink(note.id));
      });
      result.append(list);
    });
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
