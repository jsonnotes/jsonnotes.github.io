import { a, button, div, h2, p, style } from "./html";

export type Note = {
  id: number | string | bigint;
  schemaId: number | string | bigint;
  data: string;
};

const formatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export const openNoteView = (
  note: Note,
  onClose: () => void,
  onOpenSchema: (id: number) => void
): HTMLElement => {
  const overlay = div(
    style({
      position: "fixed",
      inset: "0",
      background: "var(--background-color)",
      color: "var(--color)",
      padding: "2em",
      overflow: "auto",
      zIndex: "3000",
    })
  );

  const dataView = div(
    style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
    formatJson(note.data)
  );

  const schemaButton = button(`schema id: ${note.schemaId}`, {
    onclick: () => onOpenSchema(Number(note.schemaId)),
  });

  const header = div(
    style({ display: "flex", alignItems: "center", gap: "1em" }),
    a(
      style({ textDecoration: "none", color: "inherit", fontWeight: "bold" }),
      { href: "/", onclick: (e) => { e.preventDefault(); onClose(); } },
      "LEXXTRACT DATABASE DASHBOARD"
    ),
    h2(`note ${note.id}`),
    a(style({ textDecoration: "none", color: "inherit" }), { href: `/edit?id=${note.id}` }, "EDIT")
  );

  overlay.append(
    header,
    schemaButton,
    dataView
  );

  document.body.appendChild(overlay);
  return overlay;
};
