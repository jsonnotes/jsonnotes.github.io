# Database CLI Scripts

CLI tools to interact with the SpaceTimeDB database.

## Configuration

Set environment variables:
- `SPACETIMEDB_HOST` - Database host (default: `http://localhost:3000`)
- `SPACETIMEDB_NAME` - Database name (default: `jsonview`)

## Commands

### Add Note
```bash
npm run db add-note <schemaHash> '<dataJson>'
```

Example:
```bash
npm run db add-note "abc123" '{"title": "My Note", "content": "Hello"}'
```

### Get Note
```bash
npm run db get-note <id|hash>
```

Examples:
```bash
npm run db get-note 123
npm run db get-note abc123def456
```

### Call Remote Function
```bash
npm run db remote <id|hash> '[argJson]'
```

Examples:
```bash
npm run db remote 123 '{"input": "data"}'
npm run db remote abc123 'null'
```

### SQL Query
```bash
npm run db sql <query>
```

Examples:
```bash
npm run db sql "select * from note limit 10"
npm run db sql "select id, data from note where schemaId = 0"
```

### Run Local Function
```bash
npm run db run-local <id|hash> '[argJson]'
```

Examples:
```bash
npm run db run-local 146
npm run db run-local 133 '{"a": 5, "b": 3}'
```

This runs function_schema notes locally with access to builtins: `getNote`, `addNote`, `call`, `remote`, `openrouter`, `hash`

## Shortcuts

You can also use the shortcut commands:
```bash
npm run db:add-note <schemaHash> '<dataJson>'
npm run db:get-note <id|hash>
npm run db:remote <id|hash> '[argJson]'
npm run db:sql <query>
npm run db:run-local <id|hash> '[argJson]'
```
