# Lexxtract Database

View, validate, and edit JSON notes stored in SpacetimeDB. Notes are immutable and deduplicated by a content hash that includes the schema hash. Schemas live as notes too, referenced by hash.

## Project Layout
- `src/` — Vite + TypeScript client (dashboard, editor, note view).
- `spacetimedb/` — SpacetimeDB module (schema, reducers, validation).
- `docs/` — GitHub Pages build output.

## Local Development
Frontend:
```bash
npm install
npm run dev
```

Backend (SpacetimeDB module):
```bash
cd spacetimedb
npm install
npm run build
spacetime publish -c jsonview
```

## URLs
- Local API: `http://localhost:3000`
- Live module: `https://spacetimedb.com/@DKormann/lexxtract`
- Live dashboard: `https://lexxtract.github.io/dashboard`

## How It Works
- Notes are rows in a single `note` table with `hash`, `schemaHash`, and `data`.
- `hash` is a hex string derived from note data + schema hash; it drives deduplication.
- The module seeds the top schema note (`schemaHash = "0"`) and inserts default schemas at init.

## Contributing
See `AGENTS.md` for contributor guidelines and design goals (minimal logic + dependencies).

## Global CLI

From the repo root:

```bash
npm link -w @jsonview/lib
```

Then use:

```bash
jsonview sql "select hash, data from note limit 10"
jsonview get-note <hash>
jsonview add-note <schemaHash> '{"title":"Hello"}'
```


