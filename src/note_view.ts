import { a, button, div, h2, h3, noteLink, style } from "./html";

export type Note = {
  id: number | string | bigint;
  hash: string;
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
  navigate: (path: string) => void
): HTMLElement => {
  const overlay = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));

  const dataView = div(
    style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
    formatJson(note.data)
  );

  const schemaButton = noteLink(
    note.schemaId,
    { style: { textDecoration: "underline", color: "inherit" } },
    `schema: ${note.schemaId}`
  );

  const editLink = a(
    { style: { textDecoration: "underline", color: "inherit" }, href: `/edit?id=${note.id}` },
    "edit"
  );

  let noteLabel = String(note.id);
  try {
    const parsed = JSON.parse(note.data);
    if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
      noteLabel = parsed.title.trim();
    }
  } catch {}

  overlay.append(
    h3(`Note ${noteLabel}`),
    schemaButton,
    dataView,
    editLink
  );

  return overlay;
};
