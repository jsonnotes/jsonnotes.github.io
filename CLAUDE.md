# Repository Guidelines

## Style Guide
- Don't add any external dependencies apart from SpacetimeDB (core), ajv, vite, monaco-editor (client)
- Keep solutions maximally simple in terms of lines of code (while not sacrificing typing or variable names)
- No bloat, boilerplate, repetitive logic
- Every functionality should be reused whenever possible. There should NOT be the same function recreated in lib and client.
- `core/` changes are rare and must be approved
- **lib and core must be fully tested** — run `npm test` before every deployment

## Project Structure (npm workspaces)

```
jsonview/
├── core/                # @jsonview/core - SpacetimeDB backend + shared types
│   └── src/
│       ├── notes.ts     # Types: Hash, Note, NoteData, Ref, Jsonable, schemas
│       ├── hash.ts      # hash128 function
│       ├── parser.ts    # JS parser + AST validators (tokenizer, parse, validateScopes, validateNoPrototype)
│       ├── codegen.ts   # Security-critical codegen + runtime (renderExpr, runWithFuel, assertSafeIdent)
│       └── index.ts     # SpacetimeDB module (tables, reducers, procedures)
│
├── lib/                 # @jsonview/lib - Tested utilities + minimal reference client
│   ├── src/
│   │   ├── dbconn.ts    # Standalone API exports: getNote, addNote, sql, searchNotes, callNote, callNoteLocal
│   │   ├── index.ts     # noteSearch, validateNote, fetchSchemas
│   │   ├── helpers.ts   # funCache, jsonOverview, newestRows, SchemaEntry
│   │   ├── views.ts     # VDom system: renderDom, HTML helpers, event handling
│   │   ├── openrouter.ts # OpenRouter LLM integration (openrouterCall)
│   │   ├── cli.ts       # runCli for CLI commands (has shebang — don't import from browser code)
│   │   └── example/     # Example pipelines
│   │       ├── types.ts     # Pipeline graph types
│   │       ├── pipeline.ts  # Pipeline definitions + llmcall
│   │       └── main.ts      # Pipeline entry point
│   ├── __tests__/       # Tests (node --test)
│   │   ├── api.test.ts  # API + search tests (requires maincloud)
│   │   ├── cli.test.ts  # CLI unit tests
│   │   ├── parser.test.ts # Parser + executor tests
│   │   └── schema.test.ts  # Schema validation tests
│   └── index.html       # Minimal webapp entry
│
├── client/              # @jsonview/client - Full UI
│   └── src/
│       ├── main.ts      # Router + page composition
│       ├── html.ts      # DOM helpers (div, button, style, input, etc.)
│       ├── helpers.ts   # noteSearch popup, createSchemaPicker, safeInput, notePreview, noteLink
│       ├── edit.ts      # Edit view (monaco editor + schema panel)
│       ├── monaco_editor.ts  # Monaco integration with # autocomplete
│       ├── note_view.ts # Note view + local function execution
│       ├── dashboard.ts # Dashboard + schema filtering
│       ├── sql_view.ts  # SQL query interface
│       ├── deps_view.ts # Dependencies/links SVG view
│       ├── call_note.ts # Note calling interface
│       ├── pipeline_view.ts # Pipeline graph visualization
│       └── openrouter.ts # OpenRouter AI integration (client-side)
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

### @jsonview/core (core/src/parser.ts) — re-exports codegen.ts
```ts
parse(src)                    // Parse JS to AST
validateScopes(program, allowedGlobals?)  // Check for undeclared variables
validateNoPrototype(program)  // Reject .prototype access
assertSafeIdent(name)         // Defense-in-depth: validate identifier for codegen (from codegen.ts)
runWithFuel(src, fuel?, env?) // Execute with fuel limit (sync, from codegen.ts)
runWithFuelAsync(src, fuel?, env?)  // Execute with fuel limit (async, from codegen.ts)
runWithFuelShared(src, fuelRef, env?)  // Shared fuel for nested calls (from codegen.ts)
```

### @jsonview/lib (lib/src/dbconn.ts) — standalone module-level exports
```ts
dbname                         // "jsonview"
type ServerName = "local" | "maincloud"
SERVER                         // { value, get(), set(value) } — persisted to localStorage

// API functions (auto-authenticates on import via top-level await)
sql(query)                     // Run SQL, returns { names, rows }
getNote(hash)                  // Get note by hash (cached via funCache, returns Promise)
addNote(schema, data)          // Add note, returns hash (deduped)
addNote(noteData)              // Overload: pass NoteData directly
callProcedure(name, payload)   // Call any SpacetimeDB procedure
searchNotes(query)             // Search notes by title prefix via search_note procedure
callNote(fn, arg?)             // Call server function (double fromjson for string wrapping)
callNoteLocal(fn, arg, extras?) // Execute function_schema note locally via parser
setCacheNote(hash, noteData)   // Manually populate the getNote cache
```

### @jsonview/lib (lib/src/index.ts) — re-exports + utilities
```ts
// Re-exports
SERVER, Hash                   // from dbconn
jsonOverview, newestRows, funCache, SchemaEntry  // from helpers
renderDom, VDom, HTML          // from views
openrouterCall, DEFAULT_OPENROUTER_MODEL, OpenRouterConfig  // from openrouter

// Utilities
notePreview(hash)              // Short label for a note (title or truncated data)
validateNote(note)             // Validate NoteData against its schema (expands links)
noteSearch(update)             // Returns search function; caches per server in localStorage
fetchSchemas()                 // Get all schema notes with counts
fetchNotes(limit?)             // Get recent notes as SchemaEntry[]
```

### @jsonview/lib (lib/src/helpers.ts)
```ts
funCache(fn)                   // Memoize with Map + localStorage persistence
jsonOverview(json)             // Tree-like string summary of JSON
newestRows(rows, limit)        // Last N rows reversed (newest first)
type SchemaEntry = { hash, title, count? }
```

### @jsonview/lib (lib/src/views.ts)
```ts
type VDom                      // Virtual DOM node
type DomEvent                  // Mouse or keyboard event
renderDom(maker)               // Render VDom tree to HTMLElement
HTML.div, span, p, h1-h6, a, button, input, textarea, pre, popup  // VDom builders
```

### @jsonview/lib (lib/src/cli.ts)
```ts
type CliIo = { stdout, stderr }
runCli(argv, io?)              // Execute CLI command, returns exit code
// ⚠️ Has shebang — do NOT import from browser code
```

## Import Patterns

- **Prefer direct imports** to `@jsonview/lib/src/dbconn` over re-exports through `@jsonview/lib`
- Client files import dbconn functions directly: `import { getNote, sql } from "@jsonview/lib/src/dbconn"`
- Client files import lib utilities from `@jsonview/lib`: `import { renderDom, type VDom } from "@jsonview/lib"`
- Within lib, use relative imports with `.ts` extension (Node ESM): `import { funCache } from "./helpers.ts"`

## Internal Architecture

- **Hashes are identity**: Notes identified by `hash` (content-addressed, 32 hex chars)
- **Schemas are notes**: Schema rows are notes with `schemaHash = "0"` (top)
- **Validation**: JSON validated against schema on backend; links expanded for validation only
- **Link format**: `#` followed by 32 lowercase hex chars (e.g., `#a1b2c3d4...`)
- **add_note is a reducer**: Maincloud only exposes reducers; clients compute the hash locally
- **funCache**: Memoizes functions with both in-memory Map and localStorage persistence; returns cached values synchronously on cache hit (wrap with `Promise.resolve` for async callers)
- **dbconn is a standalone module**: Exports functions directly at module level (no factory). Authenticates via top-level `await getToken()` on import.
- **Note search**: Server-side via `search_note` procedure (title prefix). For `#` autocomplete with hex tokens, call `searchNotes("")` and filter client-side by hash substring.

## Note Types
- `Note`: `{ hash, schemaHash, data }` where `data` is JSON string
- `NoteData`: `{ schemaHash, data }` where `data` is parsed Jsonable

## Executable Notes

### Two Environments

1. **Local Functions** (`function_schema`) - Executed via `callNoteLocal` using fuel-limited parser; builtins: `getNote`, `addNote`, `call`, `hash`, plus custom extras
2. **Server Functions** (`server_function`) - `run_note_async` procedure, fuel-limited, isolated storage per call

### Sandbox Security Model (codegen.ts + parser.ts)

User code runs through five defense layers, each independently auditable:

1. **Restricted grammar** (parser.ts tokenizer + parser) — Only a JS subset is parseable. No `class`, `new`, `function`, `var`, `try/catch`, `throw`, `import`, `this`, template literals, or backticks. Unrecognized syntax is a parse error.

2. **Scope validation** (`validateScopes`) — Every identifier in the AST must be declared locally or passed as an explicit global. Prevents access to `window`, `document`, `eval`, `process`, `globalThis`, etc.

3. **Prototype chain lockdown** (`validateNoPrototype`) — Blocks `.prototype`, `.constructor`, `.__proto__`. Computed property access only allows numeric literals (`a[0]` ok, `a["constructor"]` rejected).

4. **Codegen identifier validation** (`assertSafeIdent` in codegen.ts) — Defense-in-depth: every identifier and pattern emitted into generated JS is re-validated against `/^[A-Za-z_$][A-Za-z0-9_$]*$/` and a forbidden-name blocklist. Also validates the `fuelRefName` parameter. Prevents injection even if a crafted AST bypasses the parser.

5. **Fuel-limited execution** (`runWithFuel*`) — Generated code includes `__burn()` calls at every statement and loop iteration. A shared fuel counter across nested `Function()` calls ensures infinite loops and deep recursion are terminated.

Execution uses `new Function()` with only explicitly-passed globals (no ambient scope leakage). `Object` is replaced with a frozen safe facade (only `.keys`, `.values`, `.entries`). `Function` is replaced with a safe wrapper that re-parses + re-validates the body through the full pipeline.

### Key Details
- `hash128()` returns 32-char hex (not BigInt)
- Args default to `"null"` string (not undefined)
- Server storage isolated: each function gets keyspace `${noteId}:${key}`

## Client Routes

- `/` — Dashboard (note list + schema filter)
- `/edit` — Monaco editor + schema picker
- `/sql` — SQL query interface
- `/deps` `/deps/:hash` — Dependency graph SVG
- `/pipeline` `/pipeline/:hash` — Pipeline graph visualization
- `/view/:hash` — Execute function and render result as VDom
- `/:hash` — Note view (catch-all)

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
- Import from `cli.ts` in browser code -> cli.ts has shebang that breaks Vite
- Use bare `localStorage` in lib code -> Guard with `typeof localStorage !== "undefined"` for Node.js compat
- Expect `t.object(...)` procedure results as objects -> SpacetimeDB returns tuples (arrays), map them manually
- Expect single `fromjson` on `call_note` results -> It's double-encoded (string in string), needs `fromjson(fromjson(raw))`
- Expect `getNote()` to always return a Promise -> `funCache` returns cached values synchronously; wrap with `Promise.resolve()` when needed
- Use relative imports without `.ts` extension in lib -> Node ESM requires explicit `.ts` extensions

## Dev Notes

- Global CLI available via `npm link -w @jsonview/lib` -> `jsonview` command
- Monaco workers require Vite worker imports (see `client/src/monaco_editor.ts`)
- `noteSearch` in `lib/src/index.ts` caches per server (`searchCache:local` / `searchCache:maincloud`); partial hash searches use local cache, full 32-char hash does direct `getNote`
- `searchNotes` in `lib/src/dbconn.ts` calls `search_note` procedure directly (no caching)
