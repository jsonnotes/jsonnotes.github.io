import { fromjson, isRef, Jsonable, Schema, tojson } from "../spacetimedb/src/notes";
import { button, div, input, p, padding, popup, span, style, textarea } from "./html"
import { query_data } from "./dbconn";

export const stringify = x=>JSON.stringify(x,null,2)
export const JsonFmt = (data:string) => stringify(JSON.parse(data))
export type SchemaEntry = { hash: string; title: string; count?: number };
const list = div(p("loading..."));


export const noteSearch = (
  onSelect: (schema: SchemaEntry) => void,
  schemas: SchemaEntry[]
)=>{
  const sorted = [...schemas].sort((a, b) =>
    (b.count || 0) - (a.count || 0) || b.hash.localeCompare(a.hash)
  );
  const renderList = (items: typeof schemas) => {
    list.innerHTML = "";
    const col = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
    items.slice(0, 10).forEach((s) => {
      const countLabel = s.count !== undefined ? ` (${s.count})` : "";
      const shortHash = s.hash.slice(0, 8);
      const row = div(
        style({ display: "flex", gap: "0.5em", alignItems: "center" }),
        button(`#${shortHash}${s.title ? ` : ${s.title}` : ""}${countLabel}`, {
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
  const search = input("", { placeholder: "search hash, title" });
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) return renderList(sorted);
    const byHash = sorted.filter((s) => s.hash.toLowerCase().includes(q));
    if (byHash.length) return renderList(byHash);
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
  onNavigate?: (ref: string)=>void,
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
    label.style.cursor = onNavigate ? "pointer" : "default";
    label.style.textDecoration = onNavigate ? "underline" : "none";
    label.onclick = (e) => {
      if (onNavigate && isRef(refValue)) {
        e.preventDefault();
        onNavigate(refValue.slice(1));
        return;
      }
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
      query_data("select hash, data from note", true, 200).then((res) =>
        res.rows.map((row) => {
          let title = "";
          try {
            const parsed = JSON.parse(String(row[1] ?? ""));
            title = parsed?.title ? String(parsed.title) : "";
          } catch {}
          return { hash: String(row[0] ?? ""), title };
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
    const minChars = 50;

    const suggestionBox = div(style({
      display: "none",
      position: "absolute",
      border: "1px solid #ccc",
      padding: "0.5em",
      borderRadius: "0.5em",
      background: "var(--background-color)",
      zIndex: "1000",
      maxHeight: "200px",
      overflowY: "auto"
    }));

    const fetchNotes = () =>
      query_data("select hash, data from note", true, 200).then((res) =>
        res.rows.map((row) => {
          let title = "";
          try {
            const parsed = JSON.parse(String(row[1] ?? ""));
            title = parsed?.title ? String(parsed.title) : "";
          } catch {}
          return { hash: String(row[0] ?? ""), title };
        })
      );

    const updateSuggestions = () => {
      const cursor = ta.selectionStart ?? 0;
      const text = ta.value;
      const hashPos = text.lastIndexOf("#", cursor - 1);
      if (hashPos < 0) {
        suggestionBox.style.display = "none";
        return;
      }
      const token = text.slice(hashPos + 1, cursor);
      if (!/^[A-Za-z0-9]*$/.test(token)) {
        suggestionBox.style.display = "none";
        return;
      }
      fetchNotes().then((notes) => {
        const q = token.toLowerCase();
        const filtered = notes.filter((n) =>
          n.hash.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)
        ).slice(0, 8);
        suggestionBox.innerHTML = "";
        if (!filtered.length) {
          suggestionBox.style.display = "none";
          return;
        }
        filtered.forEach((n) => {
          const shortHash = n.hash.slice(0, 8);
          suggestionBox.appendChild(button(`#${shortHash}${n.title ? `: ${n.title}` : ""}`, {
            onclick: () => {
              const before = text.slice(0, hashPos);
              const after = text.slice(cursor);
              ta.value = `${before}#${n.hash}${after}`;
              const next = hashPos + 1 + n.hash.length;
              ta.setSelectionRange(next, next);
              suggestionBox.style.display = "none";
              resize();
            }
          }));
        });
        suggestionBox.style.display = "block";
      });
    };

    const resize = () => {
      ta.style.height = "0px";
      ta.style.height = `${ta.scrollHeight}px`;
      const longest = ta.value.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
      ta.style.width = `${Math.max(minChars, longest + 1)}ch`;
      onChange();
    };

    ta.oninput = () => {
      resize();
      updateSuggestions();
    };

    ta.onkeydown = (e) => {
      if (e.key === "#") {
        updateSuggestions();
      }
    };

    requestAnimationFrame(resize);

    const container = div(
      style({ position: "relative", display: "inline-block" }),
      ta,
      suggestionBox
    );

    return withRef({
      element: container,
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
      getData: ()=> list.map(f => f.getData()),
      setData: (data: Jsonable) => {
        list = (data as Jsonable[]).map((item) => {
          let fm = safeInput(items, onChange);
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
