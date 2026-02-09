# Repository Guidelines

## Style Guide
- Don't add any external dependencies apart from SpacetimeDB (core), ajv, vite, monaco-editor (client)
- Keep solutions maximally simple in terms of lines of code (while not sacrificing typing or variable names)
- No bloat, boilerplate, repetitive logic
- All new utilities go in `lib/` with tests
- **lib and core must be fully tested** — run `npm test` before every deployment

## Project Structure (npm workspaces)

```
jsonview/
├── core/                # @jsonview/core - SpacetimeDB backend + shared types
│   └── src/
│       ├── notes.ts     # Types: Hash, Note, NoteData, Ref, Jsonable, schemas
│       ├── hash.ts      # hash128 function
│       ├── parser.ts    # JS parser + executor (fuel-limited, scope-validated)
│       └── index.ts     # SpacetimeDB module (tables, reducers, procedures)
│
├── lib/                 # @jsonview/lib - Tested utilities + minimal reference client
│   ├── src/
│   │   ├── dbconn.ts    # createApi: getNote, addNote, sql, callProcedure, callNote, callNoteLocal
│   │   ├── index.ts     # Re-exports + noteSearch
│   │   ├── helpers.ts   # funCache, jsonOverview, dbname, server constants
│   │   ├── views.ts     # VDom system: renderDom, HTML helpers, event handling
│   │   ├── cli.ts       # runCli for CLI commands (has shebang — don't import from browser code)
│   │   └── example_client.ts  # Minimal webapp
│   ├── __tests__/       # Tests (node --test)
│   │   ├── api.test.ts  # API + search tests (requires maincloud)
│   │   ├── cli.test.ts  # CLI unit tests
│   │   └── parser.test.ts # Parser + executor tests
│   └── index.html       # Minimal webapp entry
│
├── client/              # @jsonview/client - Full UI
│   └── src/
│       ├── main.ts      # Router + page composition
│       ├── html.ts      # Legacy DOM helpers (prefer lib/views.ts)
│       ├── dbconn.ts    # API client wrapper (imports from @jsonview/lib)
│       ├── edit.ts      # Edit view (plain/nice/monaco modes)
│       ├── monaco_editor.ts  # Monaco integration with # autocomplete
│       ├── note_view.ts # Note view + local function execution
│       ├── dashboard.ts # Dashboard + schema filtering
│       ├── sql_view.ts  # SQL query interface
│       ├── deps_view.ts # Dependencies/links view
│       ├── call_note.ts # Note calling interface
│       └── openrouter.ts # OpenRouter AI integration
│
└── docs/                # Build output for GitHub Pages
```

## Commands

```bash
# Development
npm run dev                    # Start client dev server (port 5173+)
npm run dev -w @jsonview/lib   # Start minimal webapp (port 5180)

# Testing — run before every deployment
npm test                       # Run all lib tests

# Type checking
npm run check                  # Check all packages
npm run check -w @jsonview/lib # Check lib only

# Building
npm run build                  # Build client to /docs for GitHub Pages
npm run build -w @jsonview/core # Run spacetime build

# Deploying server
spacetime publish jsonview -s maincloud  # After npm test passes

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
hashCall(fn, data)            // Hash a function call
NoteData(title, schema, data) // Helper to create NoteData
tojson(x) / fromjson(s)       // JSON helpers
validate(data, schema)        // Ajv validation
isRef(value)                  // Check if "#hash" format, returns match or null
expandLinks(value, resolve)   // Async link expansion
expandLinksSync(value, resolve)

// Schemas (NoteData objects)
top, script_schema, function_schema, server_function, page_schema, script_result_schema
```

### @jsonview/core (core/src/parser.ts)
```ts
parse(src)                    // Parse JS to AST
validateScopes(program, allowedGlobals?)  // Check for undeclared variables
validateNoPrototype(program)  // Reject .prototype access
runWithFuel(src, fuel?, env?) // Execute with fuel limit (sync)
runWithFuelAsync(src, fuel?, env?)  // Execute with fuel limit (async)
runWithFuelShared(src, fuelRef, env?)  // Shared fuel for nested calls
```

### @jsonview/lib (lib/src/index.ts)
```ts
// Re-exports
createApi, Api, ApiConfig, Hash, server, dbname, jsonOverview

// Search
type SearchRes = { title: string, hash: Hash, count: number }
noteSearch(api, update)       // Returns search function; caches per server in localStorage
```

### @jsonview/lib (lib/src/dbconn.ts)
```ts
type ApiConfig = { server: "local" | "maincloud", accessToken?: string | null }

createApi(config: ApiConfig) => {
  server, baseUrl,
  sql(query)                   // Run SQL, returns {names, rows}
  getNote(hash)                // Get note by hash (cached via funCache)
  addNote(schema, data)        // Add note, returns hash (deduped)
  addNote(noteData)            // Overload: pass NoteData directly
  callProcedure(name, payload) // Call any procedure
  callNote(fn, arg?)           // Call server function (double fromjson for string wrapping)
  callNoteLocal(fn, arg, extras?) // Execute function_schema note locally via parser
  setAccessToken(token)        // Update auth
}
```

### @jsonview/lib (lib/src/helpers.ts)
```ts
dbname                         // "jsonview"
server                         // "maincloud"
funCache(fn)                   // Memoize with Map + localStorage persistence
jsonOverview(json)             // Tree-like string summary of JSON
```

### @jsonview/lib (lib/src/views.ts)
```ts
type VDom                      // Virtual DOM node
type DomEvent                  // Mouse or keyboard event
type UPPER = { add, del, update }  // DOM manipulation callbacks
renderDom(maker)               // Render VDom tree to HTMLElement
HTML.div, span, p, h1-h6, a, button, input, textarea, pre, popup  // VDom builders
```

### @jsonview/lib (lib/src/cli.ts)
```ts
type CliIo = { stdout, stderr }
runCli(argv, io?)              // Execute CLI command, returns exit code
// ⚠️ Has shebang — do NOT import from browser code (use helpers.ts for shared constants)
```

## Internal Architecture

- **Hashes are identity**: Notes identified by `hash` (content-addressed, 32 hex chars)
- **Schemas are notes**: Schema rows are notes with `schemaHash = "0"` (top)
- **Validation**: JSON validated against schema on backend; links expanded for validation only
- **Link format**: `#` followed by 32 lowercase hex chars (e.g., `#a1b2c3d4...`)
- **add_note is a reducer**: Maincloud only exposes reducers; clients compute the hash locally
- **funCache**: Memoizes functions with both in-memory Map and localStorage persistence; safe in Node.js (gracefully handles missing localStorage)

## Note Types
- `Note`: `{ hash, schemaHash, data }` where `data` is JSON string
- `NoteData`: `{ schemaHash, data }` where `data` is parsed Jsonable

## Executable Notes

### Two Environments

1. **Local Functions** (`function_schema`) - Executed via `callNoteLocal` using fuel-limited parser; builtins: `getNote`, `addNote`, `call`, `hash`, plus custom extras
2. **Server Functions** (`server_function`) - `run_note_async` procedure, fuel-limited, isolated storage per call

### Key Details
- `hash128()` returns 32-char hex (not BigInt)
- Args default to `"null"` string (not undefined)
- Server storage isolated: each function gets keyspace `${noteId}:${key}`
- Parser validates scopes (no undeclared variables) and rejects prototype access

## UI Features (client)

**Edit Modes** (cycle with button):
- Nice: schema-based forms
- Plain: raw JSON textarea
- Monaco: full editor with # autocomplete

**Link Autocomplete**: Type `#` to search notes by hash/title

## Database Procedures

- `add_note({schemaHash, data})` - reducer; no return value (clients compute hash)
- `search_note({query})` - searches notes by title prefix; returns `[title, count, hash][]` tuples
- `call_note({fn, arg})` - executes server function; returns double-encoded JSON string
- `run_note_async({hash, arg})` - executes server function outside transaction
- `setup` reducer - initializes schema notes

## Common Pitfalls

- Use `BigInt` in procedure returns -> Use `Number` or `String`
- Assume shared storage in nested server calls -> Each call has isolated storage
- Pass `undefined` to procedures -> Use `"null"` string
- Import types as values -> Use `import type { Hash }` for type-only imports
- Import from `cli.ts` in browser code -> Import shared constants from `helpers.ts` (cli.ts has shebang that breaks Vite)
- Use bare `localStorage` in lib code -> Guard with `typeof localStorage !== "undefined"` for Node.js compat
- Expect `t.object(...)` procedure results as objects -> SpacetimeDB returns tuples (arrays), map them manually
- Expect single `fromjson` on `call_note` results -> It's double-encoded (string in string), needs `fromjson(fromjson(raw))`

## CLI + Dev Notes

- Global CLI available via `npm link -w @jsonview/lib` -> `jsonview` command
- Monaco workers require Vite worker imports (see `client/src/monaco_editor.ts`)
- `noteSearch` caches per server (`searchCache:local` / `searchCache:maincloud`)
- Partial hash search uses local cache only (no server call); full 32-char hash does direct `getNote`
