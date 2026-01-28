import { button, div, input, p, popup, style } from "./html"

export const JsonFmt = (data:string) => JSON.stringify(JSON.parse(data), null, 2)

export type SchemaEntry = { id: string; title: string; hash: string; count?: number };

export const createSchemaPicker = (
  fetchSchemas: () => Promise<SchemaEntry[]>,
  onSelect: (schema: SchemaEntry) => void,
  label = "change schema"
) =>
  button(label, {
    onclick: () => {
      const search = input("", { placeholder: "search id, title, hash" });
      const list = div(p("loading..."));
      const container = div(
        style({ display: "flex", flexDirection: "column", gap: "0.5em" }),
        search,
        list
      );
      const pop = popup(container);
      fetchSchemas()
        .then((schemas) => {
          const sorted = [...schemas].sort((a, b) =>
            (b.count || 0) - (a.count || 0) || (Number(b.id) || 0) - (Number(a.id) || 0)
          );
          const renderList = (items: typeof schemas) => {
            list.innerHTML = "";
            const col = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
            items.slice(0, 10).forEach((s) => {
              const countLabel = s.count !== undefined ? ` (${s.count})` : "";
              col.appendChild(
                button(`schema ${s.id}${s.title ? ` : ${s.title}` : ""}${countLabel}`, {
                  style: { textAlign: "left", width: "100%" },
                  onclick: () => {
                    onSelect(s);
                    pop.remove();
                  },
                })
              );
            });
            list.appendChild(col);
          };
          renderList(sorted);
          search.oninput = () => {
            const q = search.value.trim().toLowerCase();
            if (!q) return renderList(sorted);
            const byId = sorted.filter((s) => s.id.toLowerCase().includes(q));
            if (byId.length) return renderList(byId);
            const byTitle = sorted.filter((s) => s.title.toLowerCase().includes(q));
            return renderList(byTitle);
          };
        })
        .catch((e) => {
          list.innerHTML = "";
          list.appendChild(p(e.message || "failed to load schemas"));
        });
    },
  });
