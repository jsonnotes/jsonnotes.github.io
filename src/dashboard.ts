import { a, button, div, p, style, table, td, textarea, th, tr } from "./html";

type QueryResult = { names: string[]; rows: any[][] };

type DashboardDeps = {
  query: (sql: string) => Promise<QueryResult>;
  navigate: (path: string) => void;
};

export const createDashboardView = ({ query, navigate }: DashboardDeps) => {
  const cacheKey = "dashboard_sql";
  const cachedSql = localStorage.getItem(cacheKey);
  const userinput = textarea(
    style({ fontFamily: "monospace", padding: ".5em" }),
    cachedSql || "select id, data from note limit 50"
  );

  userinput.rows = 2;
  userinput.cols = 100;
  userinput.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };
  userinput.oninput = () => {
    localStorage.setItem(cacheKey, userinput.value);
  };

  const result = div();

  const formatCell = (cell: any) => {
    if (typeof cell === "bigint") return cell.toString();
    if (typeof cell === "number") {
      const text = String(cell);
      if (text.includes("e") || text.includes("E")) {
        return cell.toLocaleString("fullwide", { useGrouping: false });
      }
      return text;
    }
    return String(cell);
  };

  const runQuery = () => {
    result.innerHTML = "";
    result.append(p("running..."));
    query(userinput.value).then((data) => {
      result.innerHTML = "";
      const tableEl = table(
          style({ borderCollapse: "collapse" }),
          tr(data.names.map((name) => th(style({ border: "1px solid #ccc", padding: ".5em" }), name))),
          ...data.rows.map((row) => {
            const note: any = {};
            data.names.forEach((name, index) => {
              note[name] = row[index];
            });
            const href = `/${note.id}`;
            const link = (content: string) =>
              a(
                style({ color: "inherit", textDecoration: "none", display: "block" }),
                {
                  href,
                  onclick: (e) => {
                    e.preventDefault();
                    navigate(href);
                  },
                },
                content
              );

            return tr(
              style({ cursor: "pointer" }),
              ...row.map((cell: string) => {
                let text = formatCell(cell).replace(/[\n\r]/g, "");
                text = text.length > 20 ? text.substring(0, 20) + "..." : text;
                return td(
                  style({ border: "1px solid #ccc", padding: ".5em" }),
                  link(text)
                );
              })
            );
          })
        );
      result.append(tableEl);
    });
  };

  const sqlHeader = div(
    style({ display: "flex", alignItems: "center", gap: "0.5em" }),
    p(style({ opacity: "0.6", margin: "0" }), "SQL console:"),
    button("run", { onclick: runQuery, style: { fontSize: "0.85em", padding: "0.2em 0.5em" } })
  );

  const root = div(
    style({ display: "flex", flexDirection: "column", gap: "0.75em" }),
    a(
      style({ textDecoration: "none", color: "inherit", fontWeight: "bold", border: "1px solid #ccc", borderRadius: "0.25em", padding: "0.25em 0.5em"}),
      {
        href: "/edit",
        onclick: (e) => {
          e.preventDefault();
          navigate("/edit");
        },
      },
      "+ Add Note"
    ),
    result,
    sqlHeader,
    userinput
  );

  return { root, runQuery };
};
