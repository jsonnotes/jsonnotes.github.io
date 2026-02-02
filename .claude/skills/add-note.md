# Add Note Skill

Create a new note in the SpaceTimeDB database.

## Usage

```
/add-note [--schema <schema-name-or-hash>] [--title <title>] [--code <code>]
```

## Parameters

- `--schema`: Schema name (server-function, script) or hash (default: server-function)
- `--title`: Title for the note (required for server-function and script schemas)
- `--code`: Code content for the note (required for server-function and script schemas)

## Examples

Create a server function:
```
/add-note --title "hello" --code "return 'Hello, World!'"
```

Create a server function with explicit schema:
```
/add-note --schema server-function --title "greet" --code "return 'Hi ' + args.name"
```

Create a script:
```
/add-note --schema script --title "test script" --code "console.log('test')"
```

## Instructions

When this skill is invoked:

1. Parse the arguments to extract schema, title, and code
2. If schema is a name (like "server-function" or "script"), look up the schema hash:
   - server-function: eeb46c7888c8ebc73f6f9e5e14a31bf2
   - script: 8c5fd77a89900144c48d5ec1a5dbe0b9
3. Validate that required fields (title, code) are provided
4. Call the add_note procedure using the npm script:
   ```
   npm run db add-note <schemaHash> '{"title":"<title>","code":"<code>"}'
   ```
5. Display the returned note ID to the user
6. Optionally offer to run the note if it's a server function

## Schema Reference

Common schemas:
- **server-function** (eeb46c7888c8ebc73f6f9e5e14a31bf2): Server-side functions that run in SpaceTimeDB
  - Required fields: title, code
- **script** (8c5fd77a89900144c48d5ec1a5dbe0b9): Client-side scripts
  - Required fields: title, code
