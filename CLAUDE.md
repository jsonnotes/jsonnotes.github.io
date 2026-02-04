# Repository Guidelines

## Style Guide
- Don't add any external dependencies apart from SpacetimeDB (core), ajv, vite, monaco-editor (client)
- Keep solutions maximally simple in terms of lines of code (while not sacrificing typing or variable names)
- No bloat, boilerplate, repetitive logic
- All new utilities go in `lib/` with tests

## Project Structure (npm workspaces)

```
jsonview/
├── core/                # @jsonview/core - SpacetimeDB backend + shared types
│   └── src/
│       ├── notes.ts     # Types: Hash, Note, NoteData, Ref, Jsonable, schemas
│       ├── hash.ts      # hash128 function
│       ├── parser.ts    # JS parser for server functions (fuel-limited)
│       └── index.ts     # SpacetimeDB module (tables, reducers, procedures)
│
├── lib/                 # @jsonview/lib - Tested utilities + minimal reference client
│   ├── src/
│   │   ├── api.ts       # createApi: getNote, addNote, sql, callProcedure
│   │   └── index.ts
│   ├── __tests__/       # Tests (node --test)
│   └── index.html       # Minimal webapp (sql, get_note, add_note)
│
├── client/              # @jsonview/client - Full UI
│   └── src/
│       ├── main.ts      # Router + page composition
│       ├── html.ts      # DOM helpers
│       ├── dbconn.ts    # API client with caching (imports from @jsonview/lib)
│       ├── edit.ts      # Edit view (plain/nice/monaco modes)
│       ├── monaco_editor.ts  # Monaco integration with # autocomplete
│       ├── note_view.ts # Note view + script execution
│       ├── dashboard.ts # Dashboard + schema filtering
│       └── ...
│
├── scripts/             # CLI tools (db-cli.js)
└── docs/                # Build output for GitHub Pages
```

## Commands

```bash
# Development
npm run dev                    # Start client dev server (port 5173+)
npm run dev -w @jsonview/lib   # Start minimal webapp (port 5180)

# Testing
npm test                       # Run lib tests

# Type checking
npm run check                  # Check all packages
npm run check -w @jsonview/lib # Check lib only

# Building
npm run build                  # Build core + client for GitHub Pages
npm run build -w @jsonview/core # Run spacetime build

# Database CLI
npm run db get-note <hash>
npm run db add-note <schemaHash> '<json>'
npm run db sql <query>
npm run db remote <hash> [args]
npm run db run-local <hash> [args]
```

## Key Exports

### @jsonview/core (core/src/notes.ts)
```ts
// Types
Hash, Note, NoteData, Ref, Jsonable, Schema

// Functions
hash128(...data)              // 32-char hex hash
hashData({schemaHash, data})  // Hash a note
tojson(x) / fromjson(s)       // JSON helpers
validate(data, schema)        // Ajv validation
isRef(value)                  // Check if "#hash" format
normalizeRef(ref)             // Strip leading #
expandLinks(value, resolve)   // Async link expansion
expandLinksSync(value, resolve)

// Schemas (NoteData objects)
top, script_schema, function_schema, server_function, script_result_schema
```

### @jsonview/lib (lib/src/api.ts)
```ts
createApi({ baseUrl?, server?, dbName, accessToken? }) => {
  sql(query)                   // Run SQL, returns {names, rows}
  getNote(ref)                 // Get note by hash
  addNote(schemaRef, data)     // Add note, returns hash
  callProcedure(name, payload) // Call any procedure
  setAccessToken(token)        // Update auth
}
```

## Internal Architecture

- **Hashes are identity**: Notes identified by `hash` (content-addressed, 32 hex chars)
- **Schemas are notes**: Schema rows are notes with `schemaHash = "0"` (top)
- **Validation**: JSON validated against schema on backend; links expanded for validation only
- **Link format**: `#` followed by 32 lowercase hex chars (e.g., `#a1b2c3d4...`)

## Note Types
- `Note`: `{ hash, schemaHash, data }` where `data` is JSON string
- `NoteData`: `{ schemaHash, data }` where `data` is parsed Jsonable

## Executable Notes

### Three Environments

1. **Scripts** (`script_schema`) - Web Worker, fields: `title`, `code`
2. **Local Functions** (`function_schema`) - `new Function()`, builtins: `getNote`, `addNote`, `call`, `remote`, `openrouter`, `hash`
3. **Server Functions** (`server_function`) - `run_note_async` procedure, fuel-limited, isolated storage per call

### Key Details
- `hash128()` returns 32-char hex (not BigInt)
- Args default to `"null"` string (not undefined)
- Server storage isolated: each function gets keyspace `${noteId}:${key}`

## UI Features (client)

**Edit Modes** (cycle with button):
- Nice: schema-based forms
- Plain: raw JSON textarea
- Monaco: full editor with # autocomplete

**Link Autocomplete**: Type `#` to search notes by hash/title

## Database Procedures

- `add_note({schemaHash, data})` → returns hash string
- `run_note_async({hash, arg})` → executes server function outside transaction
- `setup` reducer → initializes schema notes

## Common Pitfalls

❌ Use `BigInt` in procedure returns → ✅ Use `Number` or `String`
❌ Assume shared storage in nested server calls → ✅ Each call has isolated storage
❌ Pass `undefined` to procedures → ✅ Use `"null"` string
❌ Import types as values → ✅ Use `import type { Hash }` for type-only imports
