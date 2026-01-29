import { Hash, hashData, NoteData, script_schema, tojson, top } from "../spacetimedb/src/schemas";
import { a, button, div, input, p, style, textarea } from "./html";
import { getId, getNote, query_data, validateNote } from "./dbconn";
import { createSchemaPicker, JsonFmt } from "./helpers";
import { Draft } from "./main";

type EditDeps = {
  submit: (data: NoteData) => Promise<void>;

};

export const createEditView = ({ submit }: EditDeps) => {
  const datafield = textarea(
    style({ fontFamily: "monospace", minHeight: "12em", resize: "vertical", background:"inherit" , color: "inherit"}),
  );

  const scriptHash = hashData(script_schema);


  let noteIndex: Array<{ id: string; title: string; hash: string }> | null = null;

  const titleField = input("", {
    placeholder: "script title",
    style: {
      display: "none",
      marginBottom: "0.5em",
      fontSize: "1.1em",
      padding: "0.4em 0.6em",
      color: "inherit",
      background: "inherit",
      border: "none",
      outline: "none",
      width: "100%",
    }
  });



  let schemaHash = hashData(top)


  const isScript = () => schemaHash == scriptHash

  const getDraft = (): {schemaHash: Hash, text: string} => 
    isScript() ? ({schemaHash, text: tojson({title: titleField.value, content: datafield.value})})
    :({schemaHash, text: datafield.value})



  const setText = (text: string) => {
    if (datafield.value !== text) datafield.value = text;
    updateStatus();
    localStorage.setItem("edit_draft", JSON.stringify(getDraft()));

  }

  const setSchemaHash = (hash: Hash) => {
    schemaHash = hash
    titleField.style.display = isScript() ? "block" : "none";
    updateSchemaPreview();

  }

  const jsonStatus = p();
  const setJsonStatus = (text: string, color: string) => {
    jsonStatus.textContent = text;
    jsonStatus.style.color = color;
  }
  setJsonStatus("valid", "green");

  const schemaTitle = p("");
  const schemaLink = a(
    { href: "/0", style: { textDecoration: "underline", color: "inherit" } },
    "view"
  );
  schemaLink.onclick = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const href = schemaLink.getAttribute("href") || "/";
    history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
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
  const schemaPicker = createSchemaPicker(fetchSchemas, (s) => setSchemaHash(s.hash as Hash));
  const schemaList = div();
  const suggestionBox = div(style({
    display: "none",
    border: "1px solid #ccc",
    padding: "0.5em",
    borderRadius: "0.5em",
    background: "var(--background-color)"
  }));

  let lastSchemaHash = "";

  datafield.rows = 10;
  datafield.cols = 100;

  const resizeTextarea = () => {
    datafield.style.height = "auto";
    datafield.style.height = `${datafield.scrollHeight}px`;
  };

  datafield.onkeydown = (e) => {
    datafield.dispatchEvent(new Event("input"));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      formatButton.click();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const start = datafield.selectionStart || 0;
      const end = datafield.selectionEnd || 0;
      const before = datafield.value.slice(0, start);
      const after = datafield.value.slice(end);
      const lineStart = before.lastIndexOf("\n") + 1;
      const line = before.slice(lineStart);
      const indent = line.match(/^\s*/)?.[0] || "";
      const extra = /[\{\[]\s*$/.test(line) ? "  " : "";
      const insert = `\n${indent}${extra}`;
      datafield.value =(`${before}${insert}${after}`);
      const cursor = start + insert.length;
      datafield.setSelectionRange(cursor, cursor);
    }else{
      const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")", "\"": "\"" };
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!(e.key in pairs)) return;
      const start = datafield.selectionStart || 0;
      const end = datafield.selectionEnd || 0;
      if (start === end && datafield.value[start] === pairs[e.key]) {
        e.preventDefault();
        datafield.setSelectionRange(start + 1, start + 1);
        return;
      }
      if (e.key === "\"" && start === end && datafield.value[start - 1] === "\\") return;
      e.preventDefault();
      const before = datafield.value.slice(0, start);
      const after = datafield.value.slice(end);
      const close = pairs[e.key];
      const selection = datafield.value.slice(start, end);
      datafield.value = (`${before}${e.key}${selection}${close}${after}`)
      const cursor = start + 1 + selection.length;
      datafield.setSelectionRange(cursor, cursor);
    }
  };

  const loadNotes = () => {
    if (noteIndex) return Promise.resolve(noteIndex);
    return query_data("select id, data, hash from note limit 200")
      .then((r) => r.rows.map((row) => {
        const id = String(row[0]);
        let title = "";
        try {
          const parsed = JSON.parse(String(row[1] ?? ""));
          title = parsed?.title ? String(parsed.title) : "";
        } catch {}
        const hash = String(row[2] ?? "");
        return { id, title, hash };
      }))
      .then((rows) => (noteIndex = rows));
  };

  const updateSuggestions = () => {
    if (!isScript()) {
      suggestionBox.style.display = "none";
      return;
    }
    const cursor = datafield.selectionStart ?? 0;
    const text = datafield.value;
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
    loadNotes().then((notes) => {
      const q = token.toLowerCase();
      const filtered = notes.filter((n) =>
        n.id.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q)
      ).slice(0, 8);
      suggestionBox.innerHTML = "";
      if (!filtered.length) {
        suggestionBox.style.display = "none";
        return;
      }
      filtered.forEach((n) => {
        const label = `#${n.id}${n.title ? `: ${n.title}` : ""}`;
        suggestionBox.appendChild(button(label, {
          onclick: () => {
            const before = text.slice(0, hashPos);
            const after = text.slice(cursor);
            const insert = `#${n.id}`;
            datafield.value = `${before}${insert}${after}`;
            const next = before.length + insert.length;
            datafield.setSelectionRange(next, next);
            setText(datafield.value);
            suggestionBox.style.display = "none";
          }
        }));
      });
      suggestionBox.style.display = "block";
    });
  };

  datafield.oninput = () => {
    setText(datafield.value);
    updateSuggestions();
  };
  titleField.oninput = () => setText(getDraft().text)

  const updateStatus = async () => {
    jsonStatus.innerText = "validating...";
    jsonStatus.style.color = "#666";
    try{
      const data = JSON.parse(datafield.value)
      console.log(schemaHash, data)
      validateNote({schemaHash, data})
      setJsonStatus("valid", "#2a3")
    }catch (e){
      setJsonStatus(e.message || "invalid json", "#f66")
    }
  };


  const updateSchemaPreview = () => {
    if (schemaHash === lastSchemaHash) return;
    lastSchemaHash = schemaHash;
    getNote(schemaHash).then(async (schemaNote) => {
      let schemaId: any = "?";
      try { schemaId = await getId(schemaHash); } catch {}
      schemaList.innerHTML = "";
      try {
        let data = schemaNote.data as Record<string, string>;
        const title = data.title ? data.title : "";
        schemaTitle.innerText = `#${schemaId}${title ? ` : ${title}` : ""}`;
        if (schemaId !== "?") schemaLink.setAttribute("href", `/${schemaId}`);
        const entries = Object.entries(data.properties || {});
        if (!entries.length) {
          schemaList.appendChild(p("no fields"));
          return;
        }
        entries.forEach(([key, def]: any) => {
          const typ = def?.type ? String(def.type) : "any";
          schemaList.appendChild(p(`${key}: ${typ}`));
        });
      } catch (e: any) {
        schemaTitle.innerText = `#${schemaId}`;
        schemaList.appendChild(p(e.message || "invalid schema json"));
      }
    }).catch((e) => {
      schemaList.innerHTML = "";
      schemaList.appendChild(p(e.message || "schema not found"));
    });
  };

  const formatButton = button("format json (cmd+s)", {
    onclick: () => {
      if (isScript()) return;
      setText(tojson(datafield.value));
    }
  });

  const root = div(
    titleField,
    datafield,
    suggestionBox,
    div(
      style({ display: "flex", gap: "0.5em", alignItems: "center" }),
      formatButton,
      jsonStatus
    ),
    button("push", {
      onclick: () => submit({schemaHash, data:tojson(getDraft().text)}),
    }),
    div(
      style({
        padding: "1em",
        marginTop: "0.5em",
        borderRadius: "1em",
        border: "1px solid #ccc",
        background: "var(--background-color)",
      }),
      div(
        style({ display: "flex", alignItems: "center", gap: "0.75em", flexWrap: "wrap" }),
        schemaTitle,
        schemaLink,
        schemaPicker
      ),
      div(
        style({ display: "flex", gap: "1em", alignItems: "flex-start" }),
        div(schemaList)
      )
    )
  );

  updateSchemaPreview();
  resizeTextarea();

  return { root, fill:({schemaHash, text} : Draft) => {
    setText(text);
    setSchemaHash(schemaHash);
    datafield.focus();
  } };
};
