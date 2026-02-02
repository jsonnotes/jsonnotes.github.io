# Test Note Skill

Test and debug notes by running them and examining their behavior.

## Usage

```
/test-note <note-id-or-hash> [arguments]
```

## Parameters

- `<note-id-or-hash>`: The note ID (number) or hash to test
- `[arguments]`: Optional JSON arguments (default: null for server functions, [] for local functions)

## Instructions

When this skill is invoked:

1. **Get the note details** using `npm run db get-note <id>`
2. **Identify the note type** by checking the schemaHash:
   - server_function (eeb46c7888c8ebc73f6f9e5e14a31bf2): Run with `npm run db remote`
   - function_schema: Run locally (need to implement client-side execution)
   - script: Client-side script
3. **Attempt to run the note** with the provided arguments
4. **Display results** including:
   - Note content (title, code)
   - Execution result or error
   - Execution time
   - Any issues encountered
5. **Debug if errors occur**:
   - Show the full error message and stack trace
   - Analyze the code for common issues
   - Suggest fixes if possible

## Example Workflow

```
/test-note 133
```

This will:
1. Fetch note 133
2. Show its content
3. Attempt to run it
4. Display results or debug errors

## Error Handling

If an error occurs:
- Show the complete error message
- Display the note's code
- Check for common issues (JSON parsing, undefined variables, etc.)
- Suggest potential fixes
