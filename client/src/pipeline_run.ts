import { Hash, Jsonable, hashData, top } from "@jsonview/core";
import { addNote, getNote } from "@jsonview/lib/src/dbconn";
import { object, string } from "@jsonview/lib/src/example/types";





export type GraphTraceStep = ({
  graph: Hash, value: Jsonable
} | {
  graph: Hash, inputs: Record<string, Hash>, value: Jsonable
} | {
  graph: Hash, prompt: Hash, value: Jsonable
} | {
  graph: Hash, input: Hash, steps: Hash[], value: Jsonable
});

type AtomGraphInput = {
  $: "input"
  outputSchema: Jsonable
}

type AtomGraphLogic = {
  $: "logic"
  inputs: Record<string, string>
  code: string
  outputSchema: Jsonable
}

type AtomGraphLlmCall = {
  $: "llm_call"
  prompt: string
  outputSchema: Jsonable
}

type AtomGraphLoop = {
  $: "loop"
  input: string
  condition: string
  body: string
  outputSchema: Jsonable
}

type AtomGraph = AtomGraphInput | AtomGraphLogic | AtomGraphLlmCall | AtomGraphLoop


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



export const runPipeline = async (graph: Hash, input: Hash): Promise<Hash> => {
  const traceSchema = await GraphTraceStepSchema;

  const asHashRef = (value: unknown, label = "ref"): Hash => {
    if (typeof value !== "string") throw new Error("pipeline child is not a hash ref");
    const raw = value.startsWith("#") ? value.slice(1) : value;
    if (!/^[a-f0-9]{32}$/i.test(raw)) throw new Error(`invalid ${label}: ${value}`);
    return raw as Hash;
  };

  const readStep = async (stepHash: Hash): Promise<GraphTraceStep> =>
    (await getNote(stepHash)).data as GraphTraceStep;

  const readAtomGraph = async (graphHash: Hash): Promise<AtomGraph> => {
    const data = (await getNote(graphHash)).data as Record<string, unknown>;
    if (!data || typeof data !== "object" || typeof data.$ !== "string") {
      throw new Error(`invalid graph node #${graphHash}`);
    }
    if (data.$ === "input") {
      return { $: "input", outputSchema: data.outputSchema as Jsonable };
    }
    if (data.$ === "logic") {
      const rawInputs = data.inputs as Record<string, unknown>;
      const inputs = Object.fromEntries(Object.entries(rawInputs || {}).map(([k, v]) => [k, `#${asHashRef(v, "logic input")}`]));
      return {
        $: "logic",
        inputs,
        code: String(data.code || ""),
        outputSchema: data.outputSchema as Jsonable,
      };
    }
    if (data.$ === "llm_call") {
      return {
        $: "llm_call",
        prompt: `#${asHashRef(data.prompt, "llm_call prompt")}`,
        outputSchema: data.outputSchema as Jsonable,
      };
    }
    if (data.$ === "loop") {
      return {
        $: "loop",
        input: `#${asHashRef(data.input, "loop input")}`,
        condition: `#${asHashRef(data.condition, "loop condition")}`,
        body: `#${asHashRef(data.body, "loop body")}`,
        outputSchema: data.outputSchema as Jsonable,
      };
    }
    throw new Error(`unsupported graph node ${(data as any).$}`);
  };

  const pipeline = await readAtomGraph(graph);
  let step: GraphTraceStep;

  if (pipeline.$ === "input") {
    step = { graph, value: `#${input}` };
  } else if (pipeline.$ === "logic") {
    const inputStepHashes: Record<string, Hash> = {};
    const argValues: Jsonable[] = [];

    for (const [name, child] of Object.entries(pipeline.inputs)) {
      const childGraphHash = asHashRef(child, "logic input");
      const childStepHash = await runPipeline(childGraphHash, input);
      inputStepHashes[name] = childStepHash;
      argValues.push((await readStep(childStepHash)).value);
    }

    const out = Function(...Object.keys(inputStepHashes), pipeline.code)(...argValues) as Jsonable;
    step = { graph, inputs: inputStepHashes, value: out };
  } else if (pipeline.$ === "llm_call") {
    const promptGraphHash = asHashRef(pipeline.prompt, "llm_call prompt");
    const promptStepHash = await runPipeline(promptGraphHash, input);
    const promptStep = await readStep(promptStepHash);
    // Keep this path auditable/minimal for now: no external LLM call.
    step = { graph, prompt: promptStepHash, value: promptStep.value };
  } else if (pipeline.$ === "loop") {
    const inputGraphHash = asHashRef(pipeline.input, "loop input");
    const condGraphHash = asHashRef(pipeline.condition, "loop condition");
    const bodyGraphHash = asHashRef(pipeline.body, "loop body");

    const inputStepHash = await runPipeline(inputGraphHash, input);
    const inputStep = await readStep(inputStepHash);
    let state: Jsonable = inputStep.value;
    const iterSteps: Hash[] = [];

    for (let i = 0; i < 100; i++) {
      const stateNote = await addNote(hashData(top), state);
      const condStepHash = await runPipeline(condGraphHash, stateNote);
      const condStep = await readStep(condStepHash);
      iterSteps.push(condStepHash);
      if (!condStep.value) break;

      const bodyStepHash = await runPipeline(bodyGraphHash, stateNote);
      const bodyStep = await readStep(bodyStepHash);
      iterSteps.push(bodyStepHash);
      state = bodyStep.value;
    }

    step = { graph, input: inputStepHash, steps: iterSteps, value: state };
  } else {
    throw new Error(`unsupported pipeline node ${(pipeline as any).$}`);
  }

  return await addNote(traceSchema, step as Jsonable);
}
