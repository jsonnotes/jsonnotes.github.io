import { button, div, input, p, style, table, td, textarea, tr } from "./html";

type EditDeps = {
  submit: (schemaId: string, data: string) => Promise<void>;
};

export const createEditView = ({ submit }: EditDeps) => {
  const datafield = textarea(
    style({ fontFamily: "monospace", minHeight: "12em", resize: "vertical" }),
    `{"id": "some text"}`
  );

  const schemaIdField = input("1", { placeholder: "schema id (seed is 1)" });
  const jsonStatus = p("valid json");
  jsonStatus.style.color = "#2f6f2f";

  datafield.rows = 10;
  datafield.cols = 100;

  const resizeTextarea = () => {
    datafield.style.height = "auto";
    datafield.style.height = `${datafield.scrollHeight}px`;
  };

  datafield.onkeydown = (e) => {
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

  datafield.oninput = () => {
    try {
      JSON.parse(datafield.value);
      jsonStatus.innerText = "valid json";
      jsonStatus.style.color = "#2f6f2f";
    } catch (e: any) {
      jsonStatus.innerText = e.message || "invalid json";
      jsonStatus.style.color = "#a33";
    }
    resizeTextarea();
  };

  const formatButton = button("format json", {
    onclick: () => {
      try {
        const parsed = JSON.parse(datafield.value);
        datafield.value = JSON.stringify(parsed, null, 2);
        datafield.dispatchEvent(new Event("input"));
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
    schemaIdField.value = schemaId;
    datafield.value = data;
    datafield.dispatchEvent(new Event("input"));
  };

  resizeTextarea();

  return { root, fill };
};
