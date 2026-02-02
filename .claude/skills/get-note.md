# Get Note Skill

Retrieve and display a note from the SpaceTimeDB database.

## Usage

```
/get-note <note-id-or-hash>
```

## Parameters

- `<note-id-or-hash>`: The note ID (number) or hash to retrieve

## Examples

Get a note by ID:
```
/get-note 125
```

Get a note by hash:
```
/get-note eeb46c7888c8ebc73f6f9e5e14a31bf2
```

## Instructions

When this skill is invoked:

1. Parse the note reference (ID or hash) from the argument
2. Fetch the note using the npm script:
   ```
   npm run db get-note <note-ref>
   ```
3. Display the note in a formatted, readable way:
   - Show the schema hash
   - Show the note data formatted nicely
   - If it's a server function or script, display the title and code clearly
   - If applicable, offer to run the note (for server functions)

## Output Format

Present the note information clearly:
- **Schema**: Show what type of note it is (if recognizable)
- **Data**: Format the JSON data nicely
- For code-based notes (scripts, functions), syntax highlight the code if possible

## Follow-up Actions

After displaying the note, suggest relevant actions:
- For server functions: "Run this function with /run-note 125"
- For scripts: Show how to execute it
- Offer to show related notes (via dependencies/links)
