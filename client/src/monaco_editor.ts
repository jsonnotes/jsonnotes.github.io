import * as monaco from "monaco-editor";
import { Hash, fromjson, tojson, hashData, script_schema } from "@jsonview/core";
import { div, button, style, input } from "./html";
import { query_data, validateNote } from "./dbconn";
import { SchemaEntry } from "./helpers";
import { Draft } from "./main";

// Configure Monaco workers
self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, label: string) {
    const getWorkerModule = (moduleUrl: string, label: string) => {
      return new Worker(self.MonacoEnvironment!.getWorkerUrl!(moduleUrl, label), {
        name: label,
        type: "module",
      });
    };
    switch (label) {
      case "json":
        return getWorkerModule("/monaco-editor/esm/vs/language/json/json.worker?worker", label);
      case "css":
      case "scss":
      case "less":
        return getWorkerModule("/monaco-editor/esm/vs/language/css/css.worker?worker", label);
      case "html":
      case "handlebars":
      case "razor":
        return getWorkerModule("/monaco-editor/esm/vs/language/html/html.worker?worker", label);
      case "typescript":
      case "javascript":
        return getWorkerModule("/monaco-editor/esm/vs/language/typescript/ts.worker?worker", label);
      default:
        return getWorkerModule("/monaco-editor/esm/vs/editor/editor.worker?worker", label);
    }
  },
};

const fetchNotes = (): Promise<SchemaEntry[]> =>
  query_data("select hash, data from note limit 200").then((r) =>
    r.rows.map((row) => {
      let title = "";
      try {
        title = JSON.parse(String(row[1] ?? ""))?.title ?? "";
      } catch {}
      return { hash: String(row[0] ?? ""), title };
    })
  );

let noteIndex: SchemaEntry[] | null = null;
const loadNotes = () =>
  noteIndex ? Promise.resolve(noteIndex) : fetchNotes().then((rows) => (noteIndex = rows));

type MonacoViewDeps = {
  submit: (data: { schemaHash: Hash; data: any }) => Promise<void>;
};

export const monacoView = ({ submit }: MonacoViewDeps) => {
  const scriptHash = hashData(script_schema);
  let schemaHash = "" as Hash;
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;

  const titleField = input("", {
    placeholder: "script title",
    style: {
      display: "none",
      marginBottom: "0.5em",
      fontSize: "1.1em",
      padding: "0.4em 0.6em",
      color: "inherit",
      background: "inherit",
      border: "1px solid #555",
      borderRadius: "4px",
      outline: "none",
      width: "100%",
    },
  });

  const editorContainer = div(
    style({
      width: "100%",
      height: "400px",
      border: "1px solid #555",
      borderRadius: "4px",
    })
  );

  const jsonStatus = document.createElement("p");
  const setJsonStatus = (text: string, color: string) => {
    jsonStatus.textContent = text;
    jsonStatus.style.color = color;
  };
  setJsonStatus("valid", "green");

  const isScript = () => schemaHash === scriptHash;

  const getValue = (): string => editor?.getValue() ?? "";

  const getDraft = (): Draft =>
    isScript()
      ? { schemaHash, text: tojson({ title: titleField.value, code: getValue() }) }
      : { schemaHash, text: getValue() };

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

  const saveDraft = () => {
    localStorage.setItem("edit_draft", JSON.stringify(getDraft()));
  };

  const formatButton = button("format json (cmd+s)", {
    onclick: () => {
      if (!isScript() && editor) {
        try {
          const formatted = tojson(fromjson(getValue()));
          editor.setValue(formatted);
        } catch {}
      }
    },
  });

  const initEditor = () => {
    if (editor) return;

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    editor = monaco.editor.create(editorContainer, {
      value: "{}",
      language: "json",
      theme: isDark ? "vs-dark" : "vs",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
    });

    // Register # link completion provider
    monaco.languages.registerCompletionItemProvider("json", {
      triggerCharacters: ["#"],
      provideCompletionItems: async (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const hashMatch = textUntilPosition.match(/#([a-f0-9]*)$/i);
        if (!hashMatch) return { suggestions: [] };

        const token = hashMatch[1].toLowerCase();
        const notes = await loadNotes();
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - token.length - 1,
          endColumn: position.column,
        };

        const filtered = notes
          .filter(
            (n) =>
              n.hash.toLowerCase().includes(token) ||
              n.title.toLowerCase().includes(token)
          )
          .slice(0, 10);

        return {
          suggestions: filtered.map((n) => ({
            label: `#${n.hash.slice(0, 8)}${n.title ? `: ${n.title}` : ""}`,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: `#${n.hash}`,
            range,
            detail: n.title || n.hash,
          })),
        };
      },
    });

    // Listen for changes
    editor.onDidChangeModelContent(() => {
      updateStatus();
      saveDraft();
      if (window.location.search.includes("new=1"))
        history.replaceState({}, "", "/edit");
    });

    // Cmd+S to format
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      formatButton.click();
    });
  };

  const setSchemaHash = (hash: Hash) => {
    schemaHash = hash;
    titleField.style.display = isScript() ? "block" : "none";
    if (editor) {
      monaco.editor.setModelLanguage(
        editor.getModel()!,
        isScript() ? "javascript" : "json"
      );
    }
  };

  const root = div(
    titleField,
    editorContainer,
    div(
      style({ display: "flex", gap: "0.5em", alignItems: "center", marginTop: "0.5em" }),
      formatButton,
      jsonStatus
    ),
    button("push", {
      onclick: () => submit({ schemaHash, data: JSON.parse(getDraft().text) }),
      style: { marginTop: "0.5em" },
    })
  );

  // Initialize editor when container is mounted
  requestAnimationFrame(() => {
    initEditor();
  });

  return {
    root,
    setSchemaHash,
    getDraft,
    fill: ({ schemaHash: hash, text }: Draft) => {
      setSchemaHash(hash);
      requestAnimationFrame(() => {
        initEditor();
        if (isScript()) {
          try {
            const parsed = fromjson(text) as { title?: string; code?: string };
            titleField.value = parsed.title ?? "";
            editor?.setValue(parsed.code ?? "");
          } catch {
            editor?.setValue(text);
          }
        } else {
          editor?.setValue(text);
        }
        updateStatus();
        saveDraft();
        editor?.focus();
      });
    },
  };
};
