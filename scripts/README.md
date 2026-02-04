# Database CLI Scripts

CLI tools to interact with the SpaceTimeDB database.

## Configuration

Set environment variables:
- `SPACETIMEDB_HOST` - Database host (default: `http://localhost:3000`)
- `SPACETIMEDB_NAME` - Database name (default: `jsonview`)

## Commands

Notes are now identified by their 32-character hash. IDs are no longer used.

### Add Note
```bash
npm run db add-note <schemaHash> '<dataJson>'
```

Example:
```bash
npm run db add-note "0123456789abcdef0123456789abcdef" '{"title": "My Note", "content": "Hello"}'
```

### Get Note
```bash
npm run db get-note <hash>
```

Examples:
```bash
npm run db get-note 0123456789abcdef0123456789abcdef
```

### Call Remote Function
```bash
npm run db remote <hash> '[argJson]'
```

Examples:
```bash
npm run db remote 0123456789abcdef0123456789abcdef 'null'
```

### SQL Query
```bash
npm run db sql <query>
```

Examples:
```bash
npm run db sql "select * from note limit 10"
npm run db sql "select hash, data from note where schemaHash = '<schemaHash>'"
```

### Run Local Function
```bash
npm run db run-local <hash> '[argJson]'
```

Examples:
```bash
npm run db run-local 0123456789abcdef0123456789abcdef '{"a": 5, "b": 3}'
```

This runs function_schema notes locally with access to builtins: `getNote`, `addNote`, `call`, `remote`, `openrouter`, `hash`

## Shortcuts

You can also use the shortcut commands:
```bash
npm run db:add-note <schemaHash> '<dataJson>'
npm run db:get-note <hash>
npm run db:remote <hash> '[argJson]'
npm run db:sql <query>
npm run db:run-local <hash> '[argJson]'
```
