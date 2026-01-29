import { button, div, input, p, popup, style } from "./html"

export const stringify = x=>JSON.stringify(x,null,2)

export const JsonFmt = (data:string) => stringify(JSON.parse(data))

export type SchemaEntry = { id: string; title: string; hash: string; count?: number };



const list = div(p("loading..."));


export const noteSearch = (
  onSelect: (schema: SchemaEntry) => void,
  schemas: SchemaEntry[]
)=>{
  const sorted = [...schemas].sort((a, b) =>
    (b.count || 0) - (a.count || 0) || (Number(b.id) || 0) - (Number(a.id) || 0)
  );
  const renderList = (items: typeof schemas) => {
    list.innerHTML = "";
    const col = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
    items.slice(0, 10).forEach((s) => {
      const countLabel = s.count !== undefined ? ` (${s.count})` : "";
      const row = div(
        style({ display: "flex", gap: "0.5em", alignItems: "center" }),
        button(`#${s.id}${s.title ? ` : ${s.title}` : ""}${countLabel}`, {
          style: { textAlign: "left", width: "100%" },
          onclick: () => {
            onSelect(s);
            pop.remove();
          },
        }),
        button("preview", {
          onclick: () => window.open(`/${s.hash}`, "_blank", "noopener"),
          style: { fontSize: "0.85em", padding: "0.2em 0.4em" }
        })
      );
      col.appendChild(row);
    });
    list.appendChild(col);
  };

  renderList(sorted);
  const search = input("", { placeholder: "search id, title, hash" });
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) return renderList(sorted);
    const byId = sorted.filter((s) => s.id.toLowerCase().includes(q));
    if (byId.length) return renderList(byId);
    const byTitle = sorted.filter((s) => s.title.toLowerCase().includes(q));
    return renderList(byTitle);
  };

  let pop = popup(div(
    style({ display: "flex", flexDirection: "column", gap: "0.5em" }),
    search,
    list
  ));

} 


export const createSchemaPicker = (
  fetchSchemas: () => Promise<SchemaEntry[]>,
  onSelect: (schema: SchemaEntry) => void,
  label = "change schema"
) =>
  button(label, {
    onclick: () => {

      fetchSchemas()
        .then((schemas) => {
          noteSearch(onSelect, schemas);
        })
        .catch((e) => {
          list.innerHTML = "";
          list.appendChild(p(e.message || "failed to load schemas"));
        });
    },
  });
