

const example_schema = {
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "body": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title"],
  "additionalProperties": false
};


export const schemas = [
  {},
  example_schema
]