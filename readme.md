# JSON Notes

Content-addressed JSON notes stored in [SpacetimeDB](https://spacetimedb.com). Notes are immutable, deduplicated by hash, and validated against schemas that are themselves notes.

## How It Works

- Every note is a row with `hash`, `schemaHash`, and `data` (JSON string).
- `hash` is derived from the data + schema hash — identical content produces the same hash.
- Schemas are notes with `schemaHash = "0"` (the built-in "top" schema).
- Notes can link to other notes via `#<hash>` references.
- Notes can be executable: scripts (Web Worker), local functions, or server functions.

## Project Structure

npm workspaces monorepo:

- **`core/`** — SpacetimeDB backend module + shared types (`@jsonview/core`)
- **`lib/`** — API client, utilities, and tests (`@jsonview/lib`)
- **`client/`** — Full Vite + TypeScript UI (`@jsonview/client`)
- **`scripts/`** — CLI tools
- **`docs/`** — GitHub Pages build output

## Development

```bash
npm install
npm run dev          # Client dev server
npm test             # Run lib tests
npm run check        # Type-check all packages
npm run build        # Build for GitHub Pages
```

## CLI

```bash
npm run db sql <query>
npm run db get-note <hash>
npm run db add-note <schemaHash> '<json>'
npm run db remote <hash> [args]
npm run db run-local <hash> [args]
```
