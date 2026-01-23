import { button, div, input, p, style, table, td, textarea, tr } from "./html";

type EditDeps = {
  submit: (schemaId: string, data: string) => Promise<void>;
  validate: (schemaId: string, data: string) => Promise<string | null>;
  onDirty: (schemaId: string, data: string) => void;
  loadDraft: () => { schemaId: string; data: string } | null;
};

export const createEditView = ({ submit, validate, onDirty, loadDraft }: EditDeps) => {
  const datafield = textarea(
    style({ fontFamily: "monospace", minHeight: "12em", resize: "vertical" }),
    `{"id": "some text"}`
  );

  const schemaIdField = input("1", { placeholder: "default: 1" });
  const jsonStatus = p("validating...");
  jsonStatus.style.color = "#666";

  datafield.rows = 10;
  datafield.cols = 100;

  const resizeTextarea = () => {
    datafield.style.height = "auto";
    datafield.style.height = `${datafield.scrollHeight}px`;
  };

  datafield.onkeydown = (e) => {
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
      datafield.value = `${before}${insert}${after}`;
      const cursor = start + insert.length;
      datafield.setSelectionRange(cursor, cursor);
      datafield.dispatchEvent(new Event("input"));
      return;
    }
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
    datafield.value = `${before}${e.key}${selection}${close}${after}`;
    const cursor = start + 1 + selection.length;
    datafield.setSelectionRange(cursor, cursor);
    datafield.dispatchEvent(new Event("input"));
  };

  let isDirty = false;

  const updateStatus = () => {
    jsonStatus.innerText = "validating...";
    jsonStatus.style.color = "#666";
    validate(schemaIdField.value.trim() || "1", datafield.value).then((error) => {
      if (error) {
        jsonStatus.innerText = error;
        jsonStatus.style.color = "#a33";
      } else {
        jsonStatus.innerText = "valid json + schema";
        jsonStatus.style.color = "#2f6f2f";
      }
    });
    resizeTextarea();
  };

  const markDirty = () => {
    if (!isDirty) isDirty = true;
    onDirty(schemaIdField.value.trim() || "1", datafield.value);
  };

  datafield.oninput = () => {
    markDirty();
    updateStatus();
  };
  schemaIdField.oninput = () => {
    markDirty();
    updateStatus();
  };

  const formatButton = button("format json (cmd+s)", {
    onclick: () => {
      try {
        const parsed = JSON.parse(datafield.value);
        datafield.value = JSON.stringify(parsed, null, 2);
        updateStatus();
      } catch (e: any) {
        jsonStatus.innerText = e.message || "invalid json";
        jsonStatus.style.color = "#a33";
      }
    },
  });

  const root = div(
    p("add note data:"),
    table(
      tr(td("schema id"), td(schemaIdField)),
      tr(td("data"), td(datafield))
    ),
    div(
      style({ display: "flex", gap: "0.5em", alignItems: "center" }),
      formatButton,
      jsonStatus
    ),
    button("push", {
      onclick: () => {
        submit(schemaIdField.value.trim() || "1", datafield.value).catch(() => {});
      },
    })
  );

  const fill = (schemaId: string, data: string) => {
    isDirty = false;
    schemaIdField.value = schemaId;
    datafield.value = data;
    datafield.dispatchEvent(new Event("input"));
  };

  const draft = loadDraft();
  if (draft) {
    schemaIdField.value = draft.schemaId;
    datafield.value = draft.data;
    updateStatus();
  }

  resizeTextarea();

  return { root, fill };
};
