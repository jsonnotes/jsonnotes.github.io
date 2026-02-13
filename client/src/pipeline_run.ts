import { Hash, Jsonable, hashData, tojson, top } from "@jsonview/core";
import { type DagNode, drawDag, type UPPER, validateNote, type VDom } from "@jsonview/lib";
import { addNote, getNote } from "@jsonview/lib/src/dbconn";
import { Graph, object, string } from "@jsonview/lib/src/example/types";

export type GraphTraceStep = ({
  input: string, value: Jsonable
} | {
  logic: string, inputs: Record<string, string>, value: Jsonable
} | {
  llm_call: string, prompt: string, value: Jsonable
} | {
  loop: string, input: string, steps: string[], value: Jsonable
});

export const GraphTraceStepSchema = await addNote({
  schemaHash: hashData(top),
  data:{
    title: "GraphTraceStepSchema",
    $id: "GraphTraceStep",
    oneOf: [
      object({
        input: string,
        value: {}
      }),
      object({
        logic: string,
        inputs: {type: "object", additionalProperties: string},
        value: {}
      }),
      object({
        llm_call: string,
        prompt: string,
        value: {}
      }),
      object({
        loop: string,
        input: string,
        steps: {type: "array", items: string},
        value: {}
      })
    ]
  }
})





export const runPipeline = async (graph: Hash, input: Hash): Promise<Hash> => {

  let pipeline = (await getNote(graph as Hash)).data as Graph;
  let res: GraphTraceStep;

  if (pipeline.$ === "input"){
    res = {input:graph, value: input}
  }else if(pipeline.$ === "logic"){
    let inputvals = []
    for (let k in pipeline.inputs){
      let v = pipeline.inputs[k]
      inputvals.push(await runPipeline((v as any).slice(1) as Hash, input).then(h=>getNote(h)).then(n=>n.data))
    }
    console.log("input vals", inputvals)
    let value = Function(...Object.keys(pipeline.inputs), pipeline.code)(...inputvals) as Jsonable;
    res = {
      logic:graph,
      inputs: {},
      value
    }
  }else{
    console.error("Unsupported node type in pipeline:", pipeline.$);
    throw new Error("can only run input and logic nodes for now")
  }

  let note = {
    schemaHash: GraphTraceStepSchema,
    data: res
  }
  console.log(tojson(note))
  await validateNote(note);
  console.log(note)

  let rhash = await addNote(note.schemaHash, res);
  console.log({rhash})
  return rhash;

}

await runPipeline("0a697f59839b6121c67c28ef1a7bb462" as Hash, "0244a38ce53a7777dd5614eb7cdef9ea" as Hash)


export const runPipelineTraceByRoot = async (graph: Hash, input: Jsonable): Promise<Hash> => {
  console.log("Running pipeline with graph", graph, "and input", input);
  return await runPipeline(graph, input as Hash);
}


export const drawTraceRun = async (trace: Hash): Promise<(upper: UPPER) => VDom> => {
  const nodes: DagNode[] = [];
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  const stepById = new Map<string, GraphTraceStep>();

  const deps = (s: GraphTraceStep): string[] => {
    if ("inputs" in s) return Object.values(s.inputs);
    if ("prompt" in s) return [s.prompt];
    if ("input" in s) return [s.input, ...s.steps];
    return [];
  };

  const label = (s: GraphTraceStep): string => {
    if ("inputs" in s) return "logic";
    if ("prompt" in s) return "llm_call";
    if ("input" in s) return "loop";
    return "input";
  };

  const walk = async (hash: string): Promise<void> => {
    const id = String(hash);
    if (seen.has(id)) return;
    seen.add(id);
    const step = (await getNote(hash as Hash)).data as GraphTraceStep;
    stepById.set(id, step);
    nodes.push({
      id,
      dom: { tag: "span", attrs: {}, style: {}, textContent: label(step), id: "", children: [] },
    });
    for (const d of deps(step)) {
      await walk(d);
      edges.push([String(d), id]);
    }
  };

  await walk(trace);
  const dag = drawDag({ nodes, edges });
  return dag.render;
}
