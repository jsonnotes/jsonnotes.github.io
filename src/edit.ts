import { a, button, div, input, p, popup, style, table, td, textarea, tr } from "./html";

type EditDeps = {
  submit: (schemaHash: string, data: string) => Promise<void>;
  validate: (schemaHash: string, data: string) => Promise<string | null>;
  onChange: (schemaHash: string, data: string) => void;
  fetchSchema: (schemaHash: string) => Promise<{ id: string; data: string }>;
  fetchSchemaList: () => Promise<Array<{ id: string; title: string; hash: string }>>;
};

export const createEditView = ({ submit, validate, onChange, fetchSchema, fetchSchemaList }: EditDeps) => {
  const datafield = textarea(
    style({ fontFamily: "monospace", minHeight: "12em", resize: "vertical" }),
  );

  const jsonStatus = p("validating...");
  jsonStatus.style.color = "#666";
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
  const schemaPicker = button("change schema", {
    onclick: () => {
      const search = input("", { placeholder: "search id, title, hash" });
      const list = div(p("loading..."));
      const container = div(
        style({ display: "flex", flexDirection: "column", gap: "0.5em" }),
        search,
        list
      );
      const pop = popup(container);
      fetchSchemaList()
        .then((schemas) => {
          const renderList = (items: typeof schemas) => {
            list.innerHTML = "";
            const col = div(style({ display: "flex", flexDirection: "column", gap: "0.5em" }));
            items.slice(0, 10).forEach((s) => {
              col.appendChild(
                button(`schema ${s.id}${s.title ? ` : ${s.title}` : ""}`, {
                  onclick: () => {
                    currentSchemaHash = s.hash;
                    updateSchemaPreview();
                    updateStatus();
                    markChange();
                    pop.remove();
                  },
                })
              );
            });
            list.appendChild(col);
          };
          renderList(schemas);
          search.oninput = () => {
            const q = search.value.trim().toLowerCase();
            if (!q) return renderList(schemas);
            const byId = schemas.filter((s) => s.id.toLowerCase().includes(q));
            if (byId.length) return renderList(byId);
            const byTitle = schemas.filter((s) => s.title.toLowerCase().includes(q));
            if (byTitle.length) return renderList(byTitle);
            const byHash = schemas.filter((s) => s.hash.toLowerCase().includes(q));
            return renderList(byHash);
          };
        })
        .catch((e) => {
          list.innerHTML = "";
          list.appendChild(p(e.message || "failed to load schemas"));
        });
    },
  });
  const schemaList = div();
  let currentSchemaHash = "";
  let lastSchemaHash = "";

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

  const updateStatus = () => {
    jsonStatus.innerText = "validating...";
    jsonStatus.style.color = "#666";
    if (!currentSchemaHash) {
      jsonStatus.innerText = "select schema";
      jsonStatus.style.color = "#666";
      return;
    }
    validate(currentSchemaHash, datafield.value).then((error) => {
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

  const updateSchemaPreview = () => {
    const schemaHash = currentSchemaHash;
    if (!schemaHash) return;
    if (schemaHash === lastSchemaHash) return;
    lastSchemaHash = schemaHash;
    fetchSchema(schemaHash).then((schemaNote) => {
      schemaList.innerHTML = "";
      try {
        const parsed = JSON.parse(schemaNote.data);
        const title = parsed?.title ? String(parsed.title) : "";
        schemaTitle.innerText = `schema: ${schemaNote.id}${title ? ` : ${title}` : ""}`;
        schemaLink.setAttribute("href", `/${schemaNote.id}`);
        const props = parsed?.properties || {};
        const entries = Object.entries(props);
        if (!entries.length) {
          schemaList.appendChild(p("no fields"));
          return;
        }
        entries.forEach(([key, def]: any) => {
          const typ = def?.type ? String(def.type) : "any";
          schemaList.appendChild(p(`${key}: ${typ}`));
        });
      } catch (e: any) {
        schemaTitle.innerText = `schema: ${schemaNote.id}`;
        schemaList.appendChild(p(e.message || "invalid schema json"));
      }
    }).catch((e) => {
      schemaList.innerHTML = "";
      schemaList.appendChild(p(e.message || "schema not found"));
    });
  };

  const markChange = () => currentSchemaHash && onChange(currentSchemaHash, datafield.value);

  datafield.oninput = () => {
    markChange();
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
    datafield,
    div(
      style({ display: "flex", gap: "0.5em", alignItems: "center" }),
      formatButton,
      jsonStatus
    ),
    button("push", {
      onclick: () => {
        if (!currentSchemaHash) return;
        submit(currentSchemaHash, datafield.value).catch(() => {});
      },
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

  const fill = (schemaHash: string, data: string) => {
    currentSchemaHash = schemaHash;
    datafield.value = data;
    updateStatus();
    updateSchemaPreview();
  };

  updateSchemaPreview();
  resizeTextarea();

  return { root, fill };
};
