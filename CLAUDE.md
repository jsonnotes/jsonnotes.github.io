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
- `spacetimedb/src/notes.ts`: canonical schema definitions.
## Internal Architecture Notes
- **Current schema**: All data lives in the `note` table (`id`, `schemaId`, `data`, `hash`), but this is not a hard requirement.
- **Hashes are identity**: Notes are identified by `hash` (content-based). IDs exist only for temporal ordering and simple navigation.
- **Schemas are notes**: Schema rows are just notes with `schemaId = 0`. References should use hashes wherever possible.
- **Validation rule**: JSON is validated against the schema on the backend; links are expanded **for validation only** and stored data stays raw.
- **Reuse over duplication**: Prefer shared helpers (e.g., schema picker, link parsing) to avoid parallel logic in different views.
- **Link format**: Links are lowercase hex only (e.g., `#a1b2...`).

## Note Types
- `Note` (client raw): `{ id, hash, schemaId, data }` where `data` is the parsed JSON object.
- `NoteData` (payload): `{ schemaHash, data }` where `data` is raw JSON string for storage/validation.

## Build, Test, and Development Commands
- `npm run dev` — start the Vite dev server for the dashboard.
- `npm run build` — build for GitHub Pages (`BUILD_TARGET=gh-pages`).

## Executable Notes System

### Three Execution Environments

1. **Scripts** (`script_schema`)
   - Client-side execution in Web Worker
   - Fields: `title`, `code`
   - Builtins accessed via worker message passing

2. **Local Functions** (`function_schema`)
   - Client-side execution with `new Function()`
   - Async wrapper: `(async () => {${code}})()`
   - Receives `args` parameter (check `code.includes('args')` before prompting)
   - **Builtins**: `getNote`, `addNote`, `call`, `remote`, `openrouter`, `hash`
   - Can call other local functions recursively
   - Can call server functions via `remote()`

3. **Server Functions** (`server_function`)
   - Server-side execution via `run_note_async` procedure
   - Runs **outside transactions** to allow fetch/async operations
   - **Fuel-based limits**: shared across nested calls
   - **Storage isolation**: each function has keyspace `${noteId}:${key}`
   - **Builtins**: `storage.getItem/setItem`, `call`, `hash`
   - Nested calls get their own storage (not shared with parent)

### Key Implementation Details

**Hash Function**:
- `hash128()` returns 32-char hex string (NOT BigInt)
- Uses FNV-1a algorithm internally
- Used for note identity and references

**Function Calls**:
- Always handle undefined args: default to `"null"` string (not `undefined`)
- Use `Number` not `BigInt` for IDs in procedure calls (BigInt breaks JSON serialization)
- Local→Server: `remote(ref, arg)` calls `run_note_async` procedure
- Local→Local: `call(ref, args)` recursive with same builtins
- Server→Server: `call(ref, arg)` creates new storage keyspace per call

**Storage Model**:
- Server functions only
- Keys prefixed with function's note ID
- Each nested call uses its own ID for storage
- Not shared between parent/child calls

### UI Features

**Link Autocomplete**:
- Plain editor: Type `#` shows note suggestions
- Nice editor (safeInput): Type `#` in string fields shows suggestions
- Both filter by ID, title, or hash

**View Modes**:
- Edit: Plain (raw JSON) ↔ Nice (schema-based forms)
- Note: JSON (with clickable links) ↔ Overview (formatted tree)
- Drafts preserved when switching via `getDraft()`

**Run Buttons**:
- Scripts: "run" button (client-side)
- Local Functions: "run local" (only prompts if code uses `args`)
- Server Functions: "run async" (prompts for args)

**Note Overview**:
- Tree structure with indentation
- Strings >60 chars or multiline: wrapped in backticks with indentation
- Small strings/numbers: inline after property name

### CLI Tools (scripts/db-cli.js)

All database operations available via npm scripts:
```bash
npm run db get-note <id|hash>
npm run db add-note <schemaHash> '<json>'
npm run db remote <id> [args]        # Run server function
npm run db run-local <id> [args]     # Run local function
npm run db sql <query>
```

### Claude Skills

Located in `.claude/skills/`:
- `/add-note` - Create notes (shortcuts for common schemas)
- `/run-note` - Execute server functions
- `/get-note` - View note details
- `/test-note` - Debug execution issues

### Recent Architecture Changes

**Storage Isolation** (Critical):
- Each server function gets isolated storage keyspace
- Previous: all nested calls shared parent's storage
- Current: `call()` creates storage with `${targetId}:${key}`

**Async Local Functions**:
- Added full builtin access to local functions
- Wrapped in async IIFE for await support
- Recursive calls supported

**Smart Args Handling**:
- Check if code contains "args" string
- Skip prompt if function doesn't use args
- Default to `null` (not undefined) when missing

### Common Pitfalls

❌ **Don't**: Use `BigInt` in procedure return values
✅ **Do**: Use `Number` or `String` for IDs

❌ **Don't**: Assume storage is shared between nested server functions
✅ **Do**: Each function has isolated storage by its note ID

❌ **Don't**: Pass `undefined` as arg to procedures
✅ **Do**: Convert to `"null"` string: `arg !== undefined ? JSON.stringify(arg) : "null"`

❌ **Don't**: Run transactions around async operations
✅ **Do**: `run_note_async` executes outside transactions, only wraps DB ops

### Database Procedures

**add_note** (procedure, not reducer):
- Returns note ID as string
- Was reducer, changed to procedure to return value
- Checks for duplicate hash, returns existing ID if found

**run_note_async** (procedure):
- Executes server functions outside transactions
- Storage operations wrapped in `ctx.withTx`
- Fuel shared across all nested calls
- Returns `tojson()` wrapped result

**setup** (reducer):
- Initializes schema notes
- Inlines note creation (doesn't call add_note procedure)
- Runs once on database initialization
