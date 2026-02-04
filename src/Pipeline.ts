

export type Json =  string | number | boolean | null | Json[] | { [key: string]: Json };

export type Schema = ({type: "object", properties: Record<string, Schema>, required? : string[] } | {type: "array", items: Schema} | {type: "string" | "boolean"})

const String: Schema = {type: "string"}


type Graph = ({
  $ : "INPUT" // T -> T
} | {
  $ : "LLMCall" // T -> string
  model: string,
  prompt: Graph,
} | {
  $ : "Switch" // I -> O
  Condition: Graph,
  A: Graph, B: Graph
} | {
  $ : "Loop" // I -> O
  input: Graph
  Condition: Graph,
  body: Graph, // !
} | { 
  $ : "Logic" // I -> O
  input: {[key: string]: Graph},
  code: string, // output schema enforced at runtime
}) & {outputSchema: Schema}


const RoleSchema : Schema = {type: "object", properties: { name: String, description: String }, required: ["name", "description"]}

const resultSchema : Schema = {
  type: "array",
  items: RoleSchema
}

const stateSchema: Schema = {type: "object", properties: { done: resultSchema , law: String}, required: ["done", "law"]}

const isDone : Graph= { // state -> bool
  $ : "Logic",
  input: {state: { $: "INPUT", outputSchema: stateSchema }},
  code: "return state.done.length >= 5",
  outputSchema: {type : "boolean"}
}


const llmCall : Graph = { // state -> result
  $: "LLMCall",
  model: "gpt-3.5-turbo",
  prompt: { // state -> string
    $ : "Logic",
    input: { state: { $: "INPUT", outputSchema: stateSchema }}, // string
    code: "return `Extract participants from the following text: ${state.law}\npreviously extracted participants: ${JSON.stringify(state.done)}``",
    outputSchema: String
  },
  outputSchema: resultSchema
}


const llmLoop : Graph = { // string -> state
  $: "Loop",
  input: {
    $: "Logic",
    input: {law: { $: "INPUT", outputSchema: String }},
    code: "return {done: [], law: law}",
    outputSchema: stateSchema,
  },
  Condition: isDone,
  body: llmCall,
  outputSchema: stateSchema
}

const graph : Graph = { // string -> result
  $: "Logic",
  input: {state: llmLoop},
  code: "return state.done",
  outputSchema: resultSchema
}




const Record = (properties: {[key: string]: any}) => {
  return {
    type: "object",
    properties: properties,
    required: Object.keys(properties)
  }
}


const Const = (value: any, type = "string") => ({
  type: type,
  const: value
});

{

  const graphRef = {$ref: "graphSchema"}

  const GraphSchema = {
    title: "graphSchema",
    $id: "graphSchema",
    oneOf: [
      {$: Const("Input")},
      {$: Const("Logic"), inputs: {}, code: String},
      {$: Const("LLMCall"), prompt: graphRef, model: String},
      {$: Const("Loop"), input: graphRef, condition: graphRef, body: graphRef},
    ].map(it=>Record({...it, outputSchema: {}}))
  }

  console.log(JSON.stringify(GraphSchema, null, 2))

}










