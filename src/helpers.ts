import { Jsonable, Schema, tojson } from "../spacetimedb/src/notes";
import { button, div, input, p, padding, popup, style, textarea } from "./html"

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




export type formfield = {
  getData: () => Jsonable,
  setData: (data: Jsonable)=> void,
  element: HTMLElement,
}


export const safeInput = (
  schema: Schema
) : formfield => {
  let {type, properties, items} = schema as any;
  if (!type) throw new Error("no type in schema" + tojson(schema))
  if (type == "string") {
    let element:HTMLInputElement | HTMLTextAreaElement = input();

    let mkbig = ()=>{
      let ta = textarea(element.value, { style: { width: "100%", height: "10em" } })
      element.replaceWith(ta)
      element = ta
      element.focus()
    }

    element.addEventListener("keydown",(e)=>{
      if(e.key === "Enter")mkbig();
    })

    return {
      element,
      getData: () => element.value,
      setData: (data: Jsonable) => { element.value = data as string; }
    }
  }
  if (type == "number") {
    let element = input()
    element.type = "number";
    return {
      element,
      getData: () => Number(element.value),
      setData: (data: Jsonable) => { element.value = String(data); }
    }
  }

  if (type == "array"){
    let fm = safeInput (items)

    let list = div()
    let element = div(
      style({paddingLeft: "0.5em"}),
      list,
      button("+", {onclick: ()=> {
        list.append(p(safeInput(items).element))
      }}),
    )

    return {
      element,
      getData: ()=> ({}),
      setData: (data: Jsonable) => {}
    }
  }

  if (type == "object") {

    let entries = Object.entries(properties as Record<string, Schema>)
    .map(([key, val])=>{
      return {key, field: safeInput(val)}
    })
    return {
      element: div(
        entries.map(({key,field})=>{
          return p(key, ":", field.element)
        })
      ),
      getData: ()=> ({}),
      setData: (data: Jsonable) => {}
    }
  }
}