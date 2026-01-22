import { a, button, div, p, style, table, td, textarea, th, tr } from "./html";

type QueryResult = { names: string[]; rows: any[][] };

type DashboardDeps = {
  query: (sql: string) => Promise<QueryResult>;
  navigate: (path: string) => void;
};

export const createDashboardView = ({ query, navigate }: DashboardDeps) => {
  const userinput = textarea(
    style({ fontFamily: "monospace", padding: ".5em" }),
    "select * from json_note limit 100"
  );

  userinput.rows = 2;
  userinput.cols = 100;

  const result = div();

  const runQuery = () => {
    result.innerHTML = "";
    result.append(p("running..."));
    query(userinput.value).then((data) => {
      result.innerHTML = "";
      result.append(
        table(
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
                cell = String(cell).replace(/[\n\r]/g, "");
                const text = cell.length > 20 ? cell.substring(0, 20) + "..." : cell;
                return td(style({ border: "1px solid #ccc", padding: ".5em" }), link(text));
              })
            );
          })
        )
      );
    });
  };

  const root = div(
    style({ display: "flex", flexDirection: "column", gap: "0.75em" }),
    a(
      style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }),
      {
        href: "/edit",
        onclick: (e) => {
          e.preventDefault();
          navigate("/edit");
        },
      },
      "EDIT"
    ),
    p("SQL console:"),
    userinput,
    button("run", { onclick: runQuery }),
    result
  );

  return { root, runQuery };
};
