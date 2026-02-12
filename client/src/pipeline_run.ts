import { Hash, Jsonable, type NoteData, hash128, hashData, tojson, top } from "@jsonview/core";
import { addNote, getNote } from "@jsonview/lib/src/dbconn";
import { Graph, GraphInput, GraphLlmCall, GraphLogic, GraphLoop, GraphSchema, object, schema_schema, string } from "@jsonview/lib/src/example/types";

export type GraphTraceStep = ({
  graph: Hash, value: Jsonable
} | {
  graph: Hash, inputs: Record<string, Hash>, value: Jsonable
} | {
  graph: Hash, prompt: Hash, value: Jsonable
} | {
  graph: Hash, input: Hash, steps: Hash[], value: Jsonable
});


export const GraphTraceStepSchema = addNote({
  schemaHash: hashData(top),
  data:{
    title: "GraphTraceStepSchema",
    $id: "GraphTraceStep",
    oneOf: [
      object({
        graph: string,
        value: {}
      }),
      object({
        graph: string,
        inputs: {type: "object", additionalProperties: {$ref: "GraphTraceStep"}},
        value: {}
      }),
      object({
        graph: string,
        prompt: {$ref: "GraphTraceStep"},
        value: {}
      }),
      object({
        graph: string,
        input: {$ref: "GraphTraceStep"},
        steps: {type: "array", items: {$ref: "GraphTraceStep"}},
        value: {}
      })
    ]
  }
})




// const execute = async (graph, arg) => {
//   if (typeof graph == "string") graph = await getNote(graph).then(g=>g.data)
//   if (graph.$ == "logic"){
//     let inputs = graph.inputs;
//     let vals = []
//     for (let ip of Object.values(inputs)){
//       vals.push(await execute(ip, arg))
//     }
//     let res = Function(...Object.keys(inputs), graph.code) (...vals)
//     return res
//   }else if (graph.$ == "input") return arg
//   else if (graph.$ == "loop") {
//     let {input, condition, body} = graph
//     let state = await execute(input, arg)
//     while(await execute(condition, state)){
//       state = await execute(body, state)
//     }
//     return state
//   }
//   return ["not found"]
// }


export const runPipeline = async (graph: Hash, input: Hash): Promise<Hash> => {
  const pipeline = (await getNote(graph)).data as Graph;
  let res: GraphTraceStep;

  if (pipeline.$ === "input"){
    res = {
      graph,
      value: `#${input}`
    }
  }else if (pipeline.$ === "logic"){
    let inputs = pipeline.inputs;
    let vals = []
    for (let ip in Object.values(inputs)){
      vals.push(await runPipeline(ip as Hash, input))
    }
    let res = Function(...Object.keys(inputs), pipeline.code) (...vals) as Jsonable;

    
  }
  
}

