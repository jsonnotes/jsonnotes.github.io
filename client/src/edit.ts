import { fromjson, Hash, hashData, NoteData, script_schema, tojson, top } from "@jsonview/core";
import { a, button, div, input, pre, style, textarea } from "./html";
import { jsonOverview, validateNote } from "@jsonview/lib";
import { getNote, searchNotes } from "@jsonview/lib/src/dbconn";
import { createSchemaPicker, formfield, safeInput } from "./helpers";
import { Draft } from "./main";
import { monacoView } from "./monaco_editor";

type EditDeps = { submit: (data: NoteData) => Promise<void> };

const topHash = hashData(top);


const createSchemaPanel = (onPick: (hash: Hash) => void) => {
  let schemaHash = "" as Hash;
  const schemaLink = a({ href: `/${topHash}`, style: { textDecoration: "underline", color: "inherit" } }, "view");
  schemaLink.onclick = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    history.pushState({}, "", schemaLink.getAttribute("href") || "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const schemaList = pre();
  const updateSchemaPreview = () => getNote(schemaHash).then(n => schemaList.innerHTML = jsonOverview(n.data));

  const setSchemaHash = (hash: Hash) => {
    if (hash === schemaHash) return;
    schemaHash = hash;
    schemaLink.setAttribute("href", `/${hash}`);
    onPick(hash);
    updateSchemaPreview();
  };

  const schemaPicker = createSchemaPicker((s) => setSchemaHash(s.hash as Hash));
  const root = div(
    style({ padding: "1em", marginTop: "0.5em", borderRadius: "1em", border: "1px solid #ccc", background: "var(--background-color)" }),
    div(style({ display: "flex", alignItems: "center", gap: "0.75em", flexWrap: "wrap" }), schemaLink, schemaPicker),
    div(style({ display: "flex", gap: "1em", alignItems: "flex-start" }), div(schemaList))
  );

  return { root, setSchemaHash, getSchemaHash: () => schemaHash };
};

const plainView = ({ submit }: EditDeps) => {
  const scriptHash = hashData(script_schema);
  let schemaHash = "" as Hash;


  const titleField = input("", {
    placeholder: "script title",
    style: { display: "none", marginBottom: "0.5em", fontSize: "1.1em", padding: "0.4em 0.6em", color: "inherit", background: "inherit", border: "none", outline: "none", width: "100%" }
  });

  const datafield = textarea(style({ fontFamily: "monospace", minHeight: "12em", resize: "vertical", background: "inherit", color: "inherit", width: "100%" }));
  datafield.rows = 10;
  datafield.cols = 100;

  const jsonStatus = document.createElement("p");
  const suggestionBox = div(style({ display: "none", border: "1px solid #ccc", padding: "0.5em", borderRadius: "0.5em", background: "var(--background-color)" }));

  const isScript = () => schemaHash === scriptHash;
  const getDraft = (): Draft => isScript()
    ? { schemaHash, text: tojson({ title: titleField.value, code: datafield.value }) }
    : { schemaHash, text: datafield.value };

  const resizeTextarea = () => {
    datafield.style.height = "auto";
    datafield.style.height = `${datafield.scrollHeight}px`;
  };

  const setJsonStatus = (text: string, color: string) => {
    jsonStatus.textContent = text;
    jsonStatus.style.color = color;
  };
  setJsonStatus("valid", "green");

  const handleKeydown = (e: KeyboardEvent) => {
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
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = line.match(/^\s*/)?.[0] || "";
      const extra = /[\{\[]\s*$/.test(line) ? "  " : "";
      datafield.value = `${before}\n${indent}${extra}${after}`;
      const cursor = start + 1 + indent.length + extra.length;
      datafield.setSelectionRange(cursor, cursor);
      return;
    }

    const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")", '"': '"' };
    if (e.metaKey || e.ctrlKey || e.altKey || !(e.key in pairs)) return;

    const start = datafield.selectionStart || 0;
    const end = datafield.selectionEnd || 0;
    if (start === end && datafield.value[start] === pairs[e.key]) {
      e.preventDefault();
      datafield.setSelectionRange(start + 1, start + 1);
      return;
    }
    if (e.key === '"' && start === end && datafield.value[start - 1] === "\\") return;
    e.preventDefault();
    const before = datafield.value.slice(0, start);
    const after = datafield.value.slice(end);
    const selection = datafield.value.slice(start, end);
    datafield.value = `${before}${e.key}${selection}${pairs[e.key]}${after}`;
    datafield.setSelectionRange(start + 1 + selection.length, start + 1 + selection.length);
  };

  datafield.onkeydown = handleKeydown;

  const updateSuggestions = () => {
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
    searchNotes(token).then((notes) => {
      suggestionBox.innerHTML = "";
      if (!notes.length) {
        suggestionBox.style.display = "none";
        return;
      }
      notes.slice(0, 8).forEach((n) => {
        const shortHash = n.hash.slice(0, 8);
        suggestionBox.appendChild(button(`#${shortHash}${n.title ? `: ${n.title}` : ""}`, {
          onclick: () => {
            const before = text.slice(0, hashPos);
            const after = text.slice(cursor);
            datafield.value = `${before}#${n.hash}${after}`;
            const next = hashPos + 1 + n.hash.length;
            datafield.setSelectionRange(next, next);
            setText(datafield.value);
            suggestionBox.style.display = "none";
          }
        }));
      });
      suggestionBox.style.display = "block";
    });
  };

  const updateStatus = async () => {
    jsonStatus.innerText = "validating...";
    jsonStatus.style.color = "#666";
    try {
      await validateNote({ schemaHash, data: JSON.parse(getDraft().text) });
      setJsonStatus("valid", "#2a3");
    } catch (e: any) {
      setJsonStatus(e.message || "invalid json", "#f66");
    }
  };

  const setText = (text: string) => {
    if (datafield.value !== text) datafield.value = text;
    updateStatus();
    localStorage.setItem("edit_draft", JSON.stringify(getDraft()));
  };

  const setSchemaHash = (hash: Hash) => {
    schemaHash = hash;
    titleField.style.display = isScript() ? "block" : "none";
  };

  datafield.oninput = () => {
    setText(datafield.value);
    updateSuggestions();
    resizeTextarea();
    if (window.location.search.includes("new=1")) history.replaceState({}, "", "/edit");
  };

  const formatButton = button("format json (cmd+s)", {
    onclick: () => { if (!isScript()) setText(tojson(fromjson(datafield.value))); }
  });

  const root = div(
    titleField,
    datafield,
    suggestionBox,
    div(style({ display: "flex", gap: "0.5em", alignItems: "center" }), formatButton, jsonStatus),
    button("push", { onclick: () => submit({ schemaHash, data: JSON.parse(getDraft().text) }) })
  );

  resizeTextarea();

  return {
    root,
    setSchemaHash,
    getDraft,
    fill: ({ schemaHash: hash, text }: Draft) => {
      setSchemaHash(hash);
      if (isScript()) {
        try {
          const parsed = fromjson(text) as { title?: string; code?: string };
          titleField.value = parsed.title ?? "";
          datafield.value = parsed.code ?? "";
        } catch {
          datafield.value = text;
        }
      } else {
        datafield.value = text;
      }
      updateStatus();
      localStorage.setItem("edit_draft", JSON.stringify(getDraft()));
      datafield.focus();
    }
  };
};

export const niceView = ({ submit }: EditDeps) => {
  let schemaHash: Hash;
  let form: formfield;
  const root = div();

  const getDraft = (): Draft => ({
    schemaHash,
    text: tojson(form.getData())
  });

  const saveDraft = () => {
    localStorage.setItem("edit_draft", JSON.stringify(getDraft()));
  };

  const setSchemaHash = (hash: Hash) => {
    schemaHash = hash;
    root.innerHTML = "";
    return getNote(schemaHash).then((schema) => {
      form = safeInput(schema.data, saveDraft);
      root.innerHTML = "";
      root.append(
        form.element,
        div(
          style({ marginTop: "0.5em" }),
          button("push", { onclick: () => submit({ schemaHash, data: form.getData() }) })
        )
      );
    });
  };

  const setText = (text: string) => {
    form.setData(fromjson(text));
    saveDraft();
  };

  return {
    setSchemaHash,
    getDraft,
    fill: ({ schemaHash, text }: Draft) => setSchemaHash(schemaHash).then(() => setText(text)),
    root
  };
};

export const createEditView = (submit: EditDeps) => {
  const monacoEditor = monacoView(submit);
  const active = monacoEditor;
  const schemaPanel = createSchemaPanel((hash) => active.setSchemaHash(hash));
  const root = div(active.root, schemaPanel.root);

  return {
    fill: (newdata: Draft) => {
      schemaPanel.setSchemaHash(newdata.schemaHash);
      active.fill(newdata);
    },
    root
  };
};
