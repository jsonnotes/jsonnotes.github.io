import { a, button, div, h2, style } from "./html";

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
  navigate: (path: string) => void
): HTMLElement => {
  const overlay = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));

  const dataView = div(
    style({ fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: "1em" }),
    formatJson(note.data)
  );

  const schemaButton = a(
    style({ textDecoration: "underline", color: "inherit" }),
    {
      href: `/${note.schemaId}`,
      onclick: (e) => {
        e.preventDefault();
        navigate(`/${note.schemaId}`);
      },
    },
    `schema: ${note.schemaId}`
  );

  const editLink = a(
    style({ textDecoration: "underline", color: "inherit" }),
    {
      href: `/edit?id=${note.id}`,
      onclick: (e) => {
        e.preventDefault();
        navigate(`/edit?id=${note.id}`);
      },
    },
    "edit"
  );

  overlay.append(
    h2(`document ${note.id}`),
    schemaButton,
    dataView,
    editLink
  );

  return overlay;
};
