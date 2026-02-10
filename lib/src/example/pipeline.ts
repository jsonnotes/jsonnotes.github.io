import type { Jsonable } from "@jsonview/core"
import { NoteData, validate } from "@jsonview/core"
import { string, arrayT, GraphSchema } from "./types"

export const graph_schema = NoteData("graph_schema", GraphSchema)

type Graph = Jsonable

const Inp1 = NoteData("", graph_schema, {
  $: "input",
  outputSchema: string
})

const mkLogic = (inputs: Record<string, any>, outputSchema: Jsonable, code: string) =>
  NoteData("", graph_schema, { $: "logic", code, inputs, outputSchema })
const mkLLMCall = (prompt: Graph, outputSchema: Jsonable) =>
  NoteData("", graph_schema, { $: "llm_call", prompt, outputSchema })

const prompter = mkLogic({data: Inp1.data}, string, "return `extract a list of important names from this text: ${data}`")
export const llmcall = mkLLMCall(prompter.data, arrayT(string))

validate(Inp1.data, GraphSchema)
validate(llmcall.data, GraphSchema)
