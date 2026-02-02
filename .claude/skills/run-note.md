# Run Note Skill

Execute a server function remotely in SpaceTimeDB.

## Usage

```
/run-note <note-id-or-hash> [arguments]
```

## Parameters

- `<note-id-or-hash>`: The note ID (number) or hash to execute
- `[arguments]`: Optional JSON arguments to pass to the function (default: null)

## Examples

Run a function without arguments:
```
/run-note 125
```

Run a function with arguments:
```
/run-note 125 '{"name": "Alice", "count": 42}'
```

Run a function by hash:
```
/run-note abc123def456 '{"input": "data"}'
```

## Instructions

When this skill is invoked:

1. Parse the note reference (ID or hash) from the first argument
2. Parse any additional arguments as JSON (default to "null" if not provided)
3. Execute the note using the npm script:
   ```
   npm run db remote <note-ref> '<arguments>'
   ```
4. Display the result to the user in a formatted way
5. If the result is an error, show it clearly
6. If the result is JSON, format it nicely

## Notes

- Server functions run asynchronously and can make fetch requests
- The function has access to storage, call (for nested functions), and hash utilities
- Each function has its own isolated storage keyspace
