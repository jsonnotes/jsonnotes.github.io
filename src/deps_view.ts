import { borderRadius, div, h3, p, popup, routeLink, style } from "./html";
import { getId, noteLink, notePreview, query_data } from "./dbconn";
import { Ref } from "../spacetimedb/src/notes";
import { noteSearch } from "./helpers";

type QueryResult = { names: string[]; rows: any[][] };
type DepsDeps = { query: (sql: string) => Promise<QueryResult> };



export const createDepsView = ({ query }: DepsDeps) => {
  const root = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));
  const cols = div(style({ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1em" }));
  const fetchSchemas = () =>
    Promise.all([
      query_data("select id, data, hash from note where schemaId = 0"),
      query_data("select schemaId from note")
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
    });
  root.append(h3("Dependencies"), cols);
  const render = async (ref?: Ref) => {
    cols.innerHTML = "";
    if (!ref) {
      fetchSchemas().then((schemas) =>
        noteSearch((s) => {
          window.history.pushState({}, "", `/deps/${s.id}`);
          render(s.id as Ref);
        }, schemas)
      );
      return;
    }
    const currentId = await getId(ref);
    const inputCol = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
    const currentCol = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
    const outputCol = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));

    inputCol.append(p("Inputs"));
    currentCol.append(p("Current"));
    outputCol.append(p("Outputs"));

    currentCol.append(noteLink(currentId));

    const links = await query("select to, from from links");
    const inputs: number[] = [];
    const outputs: number[] = [];
    links.rows.forEach((row) => {
      const to = Number(row[0]);
      const from: number[] = row[1] || [];
      if (from.some((id) => Number(id) === Number(currentId))) inputs.push(to);
      if (to === Number(currentId)) outputs.push(...from);
    });

    const uniq = (arr: number[]) => [...new Set(arr)];

    let link = (id:Ref) => routeLink(`/deps/${id}`, notePreview(id))
    uniq(inputs).forEach((id) => inputCol.append(link(id)));
    uniq(outputs).forEach((id) => outputCol.append(link(id)));

    cols.append(inputCol, currentCol, outputCol);
  };

  return { root, render };
};
