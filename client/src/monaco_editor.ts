import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { Hash, fromjson, tojson, hashData, script_schema, function_schema } from "@jsonview/core";
import { div, button, style, input } from "./html";
import { validateNote } from "@jsonview/lib";
import { sql } from "@jsonview/lib/src/dbconn";
import { notePreview, SchemaEntry } from "./helpers";
import { Draft } from "./main";

// Configure Monaco workers
self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

const fetchNotes = (): Promise<SchemaEntry[]> =>
  sql("select hash, data from note limit 200").then((r) =>
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
  const functionHash = hashData(function_schema);
  let schemaHash = "" as Hash;
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;
  let linkDecorations: string[] = [];
  const previewCache = new Map<string, string>();
  let updatePending = false;
  let styleInjected = false;

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
  const isFunction = () => schemaHash === functionHash;

  const getValue = (): string => editor?.getValue() ?? "";

  const buildFunctionData = () => {
    const args: Record<string, { name: string; schema: any }> = {};
    const list = argRows.map((r) => r.nameInput.value.trim()).filter(Boolean);
    list.forEach((name, i) => {
      const row = argRows[i];
      let schema: any = {};
      try { schema = row.schemaInput.value ? JSON.parse(row.schemaInput.value) : {}; } catch {}
      args[name] = { name, schema };
    });
    let returnSchema: any = {};
    try { returnSchema = returnSchemaInput.value ? JSON.parse(returnSchemaInput.value) : {}; } catch {}
    return { title: titleField.value, args, code: getValue(), returnSchema };
  };

  const getDraft = (): Draft => {
    if (isScript()) return { schemaHash, text: tojson({ title: titleField.value, code: getValue() }) };
    if (isFunction()) return { schemaHash, text: tojson(buildFunctionData()) };
    return { schemaHash, text: getValue() };
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

  const saveDraft = () => {
    localStorage.setItem("edit_draft", JSON.stringify(getDraft()));
  };

  const argRows: { row: HTMLElement; nameInput: HTMLInputElement; schemaInput: HTMLTextAreaElement }[] = [];
  const argsList = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
  const returnSchemaInput = document.createElement("textarea");
  returnSchemaInput.rows = 4;
  returnSchemaInput.style.width = "100%";
  returnSchemaInput.style.fontFamily = "monospace";
  const autoResize = (ta: HTMLTextAreaElement) => {
    ta.style.height = "0px";
    ta.style.height = `${ta.scrollHeight}px`;
  };
  returnSchemaInput.oninput = () => { autoResize(returnSchemaInput); updateStatus(); saveDraft(); };
  autoResize(returnSchemaInput);

  const addArgRow = (name = "", schemaText = "{}") => {
    const nameInput = input(name, {
      placeholder: "arg name",
      style: { width: "12em" },
    }) as HTMLInputElement;
    const schemaInput = document.createElement("textarea");
    schemaInput.rows = 2;
    schemaInput.style.width = "100%";
    schemaInput.style.fontFamily = "monospace";
    schemaInput.style.minHeight = "2.4em";
    schemaInput.value = schemaText;
    const remove = button("-", { onclick: () => {
      row.remove();
      const idx = argRows.findIndex((r) => r.row === row);
      if (idx >= 0) argRows.splice(idx, 1);
      updateStatus();
      saveDraft();
    }});
    nameInput.oninput = () => { updateStatus(); saveDraft(); };
    schemaInput.oninput = () => { autoResize(schemaInput); updateStatus(); saveDraft(); };
    const row = div(
      style({ display: "flex", gap: "0.5em", alignItems: "flex-start" }),
      nameInput,
      schemaInput,
      remove
    );
    argRows.push({ row, nameInput, schemaInput });
    argsList.appendChild(row);
    requestAnimationFrame(() => autoResize(schemaInput));
  };

  const setArgsFromData = (args: any) => {
    argsList.innerHTML = "";
    argRows.splice(0, argRows.length);
    if (Array.isArray(args)) {
      args.forEach((name) => addArgRow(String(name || ""), "{}"));
      return;
    }
    Object.entries(args || {}).forEach(([name, val]: any) => {
      const schema = val?.schema ?? {};
      addArgRow(name, JSON.stringify(schema, null, 2));
    });
    autoResize(returnSchemaInput);
  };

  const functionPanel = div(
    style({ display: "none", padding: "0.75em", border: "1px solid #ccc", borderRadius: "0.5em", background: "var(--background-color)" }),
    div(style({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5em" }),
      div("Function Args"),
      button("+ arg", { onclick: () => addArgRow() })
    ),
    argsList,
    div(style({ marginTop: "0.75em" }), "Return Schema", returnSchemaInput)
  );

  const formatButton = button("format json (cmd+s)", {
    onclick: () => {
      if (!isScript() && !isFunction() && editor) {
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

    const resolveBackground = () => {
      const root = document.documentElement;
      const fromVar =
        getComputedStyle(root).getPropertyValue("--background") ||
        getComputedStyle(root).getPropertyValue("--background-color");
      const trimmed = fromVar.trim();
      if (trimmed) return trimmed;
      return isDark ? "#1e1e1e" : "#ffffff";
    };

    monaco.editor.defineTheme("jsonview", {
      base: isDark ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": resolveBackground(),
      },
    });

    editor = monaco.editor.create(editorContainer, {
      value: "{}",
      language: isScript() ? "javascript" : isFunction() ? "javascript" : "json",
      theme: "jsonview",
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

    // Register #hash link provider (Cmd/Ctrl+click)
    monaco.languages.registerLinkProvider("json", {
      provideLinks: (model) => {
        const text = model.getValue();
        const links: monaco.languages.ILink[] = [];
        const re = /#([a-f0-9]{32})/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text))) {
          const hash = match[1];
          const start = model.getPositionAt(match.index);
          const end = model.getPositionAt(match.index + match[0].length);
          links.push({
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            url: monaco.Uri.parse(`jsonview:${hash}`),
          });
        }
        return { links };
      },
    });

    // Open #hash links in the same tab
    monaco.editor.registerLinkOpener({
      open: (uri) => {
        if (uri.scheme === "jsonview") {
          const raw = uri.path || uri.authority || "";
          const hash = raw.replace(/^\/+/, "");
          window.history.pushState({}, "", `/${hash}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
          return true;
        }
        return false;
      }
    });

    const injectStyles = () => {
      if (styleInjected) return;
      styleInjected = true;
      const style = document.createElement("style");
      style.textContent = `
        .jv-link-dim { opacity: 0.45; }
        .jv-link-preview {
          color: var(--color);
          opacity: 0.9;
          cursor: pointer;
          background: #ccc4;
          border: 1px solid #ccc4;
          border-radius: 6px;
          padding: 0 6px;
          margin-left: 0;
        }
      `;
      document.head.appendChild(style);
    };

    const scheduleUpdate = () => {
      if (updatePending) return;
      updatePending = true;
      requestAnimationFrame(() => {
        updatePending = false;
        updateLinkDecorations();
      });
    };

    const updateLinkDecorations = () => {
      if (!editor) return;
      injectStyles();
      const model = editor.getModel();
      if (!model) return;
      const text = model.getValue();
      const re = /#([a-f0-9]{32})/g;
      const next: monaco.editor.IModelDeltaDecoration[] = [];
      const hashesToFetch: Hash[] = [];
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const hash = match[1] as Hash;
        const start = model.getPositionAt(match.index);
        const end = model.getPositionAt(match.index + match[0].length);
        const preview = previewCache.get(hash);
        if (!preview) hashesToFetch.push(hash);
        next.push({
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: {
            inlineClassName: "jv-link-dim",
            after: {
              content: `${preview ?? `#${hash.slice(0, 8)}`}`,
              inlineClassName: "jv-link-preview",
              cursorStops: monaco.editor.InjectedTextCursorStops.None,
            },
          },
        });
      }
      linkDecorations = editor.deltaDecorations(linkDecorations, next);

      if (hashesToFetch.length) {
        Promise.all(hashesToFetch.map((h) => notePreview(h).then((p) => [h, p] as const).catch(() => [h, `#${h.slice(0,8)}`] as const)))
          .then((pairs) => {
            let changed = false;
            for (const [h, p] of pairs) {
              if (previewCache.get(h) !== p) {
                previewCache.set(h, p);
                changed = true;
              }
            }
            if (changed) scheduleUpdate();
          });
      }
    };

    // Listen for changes
    editor.onDidChangeModelContent(() => {
      updateStatus();
      saveDraft();
      if (window.location.search.includes("new=1"))
        history.replaceState({}, "", "/edit");
      scheduleUpdate();
      const pos = editor?.getPosition();
      const model = editor?.getModel();
      if (pos && model) {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: pos.lineNumber,
          startColumn: 1,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        });
        if (/#([a-f0-9]*)$/i.test(textUntilPosition)) {
          editor?.trigger("hash", "editor.action.triggerSuggest", {});
        }
      }
    });

    // Cmd+S to format
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      formatButton.click();
    });

    scheduleUpdate();
  };

  const setSchemaHash = (hash: Hash) => {
    schemaHash = hash;
    titleField.style.display = isScript() || isFunction() ? "block" : "none";
    functionPanel.style.display = isFunction() ? "block" : "none";
    if (editor) {
      monaco.editor.setModelLanguage(
        editor.getModel()!,
        isScript() ? "javascript" : isFunction() ? "javascript" : "json"
      );
    }
  };

  const root = div(
    titleField,
    functionPanel,
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
        } else if (isFunction()) {
          try {
            const parsed = fromjson(text) as any;
            titleField.value = parsed.title ?? "";
            const args = parsed.args || {};
            setArgsFromData(args);
            returnSchemaInput.value = parsed.returnSchema ? JSON.stringify(parsed.returnSchema, null, 2) : "{}";
            autoResize(returnSchemaInput);
            editor?.setValue(parsed.code ?? "");
          } catch {
            setArgsFromData({});
            returnSchemaInput.value = "{}";
            autoResize(returnSchemaInput);
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
