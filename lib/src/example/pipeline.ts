

import { function_schema, hashData, Jsonable, NoteData, tojson, top, validate } from "@jsonview/core";
import { HTML } from "../views";
import { jsonOverview } from "../helpers";



const string = {type : "string"}
const number = {type : "number"}

export type Schema = Jsonable
const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})

const arrayT = (items : Schema) => ({
  type:"array",
  items
})

const GraphSchema = {
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
    }
  ].map(object)
}

export const graph_schema = NoteData("graph_schema", GraphSchema)

type Graph = Jsonable


const Inp1 = NoteData("", graph_schema, {
  $: "input",
  outputSchema: string
})


const mkLogic = (inputs: Record<string, any>, outputSchema: Jsonable, code: string) => NoteData("", graph_schema, { $:"logic", code, inputs, outputSchema,})
const mkLLMCall = (prompt: Graph, outputSchema: Schema) => NoteData("", graph_schema, {$:"llm_call",prompt,outputSchema})

const prompter = mkLogic({data: Inp1.data}, string, "return `extract a list of important names from this text: ${data}`")
const llmcall = mkLLMCall(prompter.data, arrayT(string))


export const view = HTML.div(


  HTML.pre(
    jsonOverview(llmcall)
  )
)



validate(Inp1.data, GraphSchema)

validate(llmcall.data, GraphSchema)