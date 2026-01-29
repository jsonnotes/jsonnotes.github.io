# Repository Guidelines

## Style Guide
- Don't add any external dependencies appart from SpacetimeDB
- Keep solutions maximally simple in terms of lines of code (while not sacrificing typing or variable names)
- no bloat, boilerplate reptetive logic

## Project Structure & Module Organization
- `src/` holds the Vite + TypeScript frontend. Entry points live in `src/main.ts` and markup helpers in `src/html.ts`.
- `spacetimedb/` is the database module with its own `package.json` and build/publish scripts.
- `docs/` is the build target for GitHub Pages.

## UI Layout
- **Dashboard**: schema‑filtered list of recent notes; schema picker is reused across views.
- **Edit**: script mode edits `title` + `code` directly; non‑script mode edits raw JSON.
- **Inspect**: shows parsed content; scripts emphasize title + code and expose run/copy controls.

## Key Files
- `src/main.ts`: routing + page composition.
- `src/edit.ts`: edit view + script mode handling.
- `src/note_view.ts`: inspect view + script execution.
- `src/dashboard.ts`: dashboard list + schema filtering.
- `src/dbconn.ts`: HTTP + caching + note fetch/validation helpers.
- `src/helpers.ts`: shared UI helpers (schema picker, formatting).
- `spacetimedb/src/index.ts`: reducers + validation logic.
- `spacetimedb/src/schemas.ts`: canonical schema definitions.
## Internal Architecture Notes
- **Current schema**: All data lives in the `note` table (`id`, `schemaId`, `data`, `hash`), but this is not a hard requirement.
- **Hashes are identity**: Notes are identified by `hash` (content-based). IDs exist only for temporal ordering and simple navigation.
- **Schemas are notes**: Schema rows are just notes with `schemaId = 0`. References should use hashes wherever possible.
- **Validation rule**: JSON is validated against the schema on the backend; links are expanded **for validation only** and stored data stays raw.
- **Reuse over duplication**: Prefer shared helpers (e.g., schema picker, link parsing) to avoid parallel logic in different views.

## Note Types
- `Note` (client raw): `{ id, hash, schemaId, data }` where `data` is the parsed JSON object.
- `NoteData` (payload): `{ schemaHash, data }` where `data` is raw JSON string for storage/validation.

## Build, Test, and Development Commands
- `npm run dev` — start the Vite dev server for the dashboard.
- `npm run build` — build for GitHub Pages (`BUILD_TARGET=gh-pages`).
