import type { Jsonable } from "@jsonview/core"

export type Schema = Jsonable

export const string = {type : "string"}
export const number = {type : "number"}

export const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})

export const arrayT = (items: Schema) => ({
  type: "array",
  items
})

export const schema_schema: Schema = {
  $id: "schema",
  oneOf: [
    { type: "object", not: { required: ["type"] } },
    { const: {type: "string"} },
    { const: {type: "number"} },
    {
      type: "object",
      properties: {
        type: { const: "array" },
        items: { $ref: "schema" },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      properties: {
        type: { const: "object" },
        properties: { type: "object", additionalProperties: { $ref: "schema" } },
        required: { type: "array", items: { type: "string" } },
        additionalProperties: { $ref: "schema" },
      },
      required: ["type"],
    }
  ]
}

export const GraphSchema = {
  $id: "graph",
  oneOf: [
    {
      $: {const: "input"},
      outputSchema: {}
    },
    {
      $: {const: "logic"},
      inputs: {
        type: "object",
        additionalProperties: { $ref: "graph" }
      },
      code: string,
      outputSchema: {}
    },
    {
      $: {const: "llm_call"},
      prompt: { $ref: "graph" },
      outputSchema: {}
    },
    {
      $: {const: "loop"},
      input: { $ref: "graph" },
      condition: { $ref: "graph" },
      body: { $ref: "graph" },
      outputSchema: {}
    }
  ].map(object)
}
