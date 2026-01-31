import { fromjson, isRef, Jsonable, Schema, tojson } from "../spacetimedb/src/notes";
import { button, div, input, p, padding, popup, span, style, textarea } from "./html"
import { query_data } from "./dbconn";

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
  schema: Schema,
  onChange: ()=>void,
) : formfield => {
  let {type, properties, items} = schema as any;

  if (!type) {
    let fm = safeInput({type: "string"}, ()=>{
      try{
        let r = fm.getData() as string;
        let dat = fromjson(r)
        hints.innerHTML = ""
        format.onclick = ()=> fm.setData(tojson(dat))
      }catch (e){
        hints.innerHTML = String(e)
      }
    })
    // fm.setData("{}")
    let format = button("format")
    let hints = span("hello", style({color: "red", margin: "0.5em"}))
    return {
      element: div(fm.element, div(format, hints)),
      getData: () => fromjson(fm.getData() as string),
      setData: (data) => fm.setData(tojson(data))
    }
  }
  const withRef = (field: formfield) : formfield => {
    let refValue = "";
    const label = span();
    label.style.display = "none";
    label.onclick = () => {
      refValue = "";
      label.style.display = "none";
      field.element.style.display = "";
      onChange();
    };
    const setRef = (ref: string) => {
      refValue = ref;
      if (isRef(refValue)) {
        label.innerText = refValue;
        label.style.display = "";
        field.element.style.display = "none";
      } else {
        label.style.display = "none";
        field.element.style.display = "";
      }
      onChange();
    };
    const fetchNotes = () =>
      query_data("select id, data, hash from note", true, 200).then((res) =>
        res.rows.map((row) => {
          let title = "";
          try {
            const parsed = JSON.parse(String(row[1] ?? ""));
            title = parsed?.title ? String(parsed.title) : "";
          } catch {}
          return { id: String(row[0]), title, hash: String(row[2] ?? "") };
        })
      );
    const openSearch = () => {
      fetchNotes()
        .then((items) => {
          noteSearch((s) => setRef(`#${s.hash}`), items);
        })
        .catch((e) => {
          list.innerHTML = "";
          list.appendChild(p(e.message || "failed to load notes"));
        });
    };
    const btn = button("🔗", {
      onclick: openSearch,
      style: { background: "transparent", border: "none", padding: "0 0.1em", cursor: "pointer" }
    });
    return {
      element: div(
        style({ display: "inline-flex", alignItems: "center", gap: "0.25em" }),
        btn,
        label,
        field.element
      ),
      getData: () => (isRef(refValue) ? refValue : field.getData()),
      setData: (data: Jsonable) => {
        if (typeof data === "string" && isRef(data)) setRef(data);
        else {
          setRef("");
          field.setData(data);
        }
      }
    }
  }
  if (type == "string") {
    let ta = textarea()
    ta.rows = 1;
    ta.style.resize = "none";
    ta.style.overflow = "hidden";
    ta.style.verticalAlign = "middle";
    ta.style.boxSizing = "content-box";
    const minChars = 12;

    const resize = () => {
      ta.style.height = "0px";
      ta.style.height = `${ta.scrollHeight}px`;
      const longest = ta.value.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
      ta.style.width = `${Math.max(minChars, longest + 1)}ch`;
      onChange();
    };
    ta.oninput = resize;
    requestAnimationFrame(resize);

    return withRef({
      element:ta,
      getData: () => ta.value,
      setData: (data: Jsonable) => { ta.value = data as string; resize(); }
    })
  }
  if (type == "number") {
    let element = input()
    element.type = "number";
    element.oninput = onChange;
    return withRef({
      element,
      getData: () => Number(element.value),
      setData: (data: Jsonable) => { element.value = String(data); }
    })
  }

  if (type == "array"){

    let list = []
    let listels = div()
    const rowFor = (fm) => {
      const row = div(
        style({ display: "flex", alignItems: "center", gap: "0.25em" }),
        button("-", { onclick: () => {
          list = list.filter((x) => x !== fm);
          row.remove();
          onChange();
        }}),
        fm.element
      )
      return row
    }
    let element = div(
      style({paddingLeft: "0.5em"}),
      listels,
      button("+", {onclick: ()=> {
        let fm = safeInput (items,onChange)
        list.push(fm);
        listels.append(rowFor(fm));
        onChange();
      }}),
    )

    return withRef({
      element,
      getData: ()=> list.map(f => console.log(list, f) ?? f.getData()),
      setData: (data: Jsonable) => {
        list = (data as Jsonable[]).map((item) => {
          let fm = safeInput(items, onChange);
          console.log(fm)
          fm.setData(item);
          listels.append(rowFor(fm));
          return fm
        }
      )
      }
    })
  }

  if (type == "object") {

    const required = new Set((schema as any).required || []);
    let entries = Object.entries(properties as Record<string, Schema>)
    .map(([key, val])=>{
      return {key, field: safeInput(val, onChange), box: input()}
    })
    return withRef({
      element: div(
        entries.map(({key,field,box})=>{
          box.type = "checkbox";
          if (required.has(key)) {
            box.checked = true;
            box.disabled = true;
          }
          box.oninput = () => onChange();
          box.onchange = () => {
            const on = box.checked || required.has(key);
            field.element.style.display = on ? "" : "none";
            onChange();
          };
          if (!required.has(key)) field.element.style.display = "none";
          return p(box, key, ":", field.element)
        })
      ),
      getData: ()=> Object.fromEntries(entries
        .filter(({key, field}) => required.has(key) || field.element.style.display !== "none")
        .map(({key, field}) => [key, field.getData()])),
      setData: (data: Jsonable) => {
        entries.forEach(({key, field, box}) => {
          if (required.has(key)) field.element.style.display = "";
          else {
            box.checked = false;
            field.element.style.display = "none";
          }
        })
        Object.entries(data as Record<string, Jsonable>).forEach(([key, value]) => {
          const entry = entries.find(e => e.key === key);
          if (entry) {
            entry.field.setData(value);
            if (!required.has(key)) {
              entry.box.checked = true;
              entry.field.element.style.display = "";
            }
          }
        })
      }
    })
  }
}
