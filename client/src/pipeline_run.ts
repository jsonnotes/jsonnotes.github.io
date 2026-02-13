import { Hash, Jsonable, hashData, tojson, top } from "@jsonview/core";
import { type DagNode, type DagControls, drawDag, jsonOverview, splitRefs, type UPPER, type VDom } from "@jsonview/lib";
import { addNote, getNote } from "@jsonview/lib/src/dbconn";
import { object, string } from "@jsonview/lib/src/example/types";

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

const aslink = (hash: string) => hash.startsWith("#") ? hash : `#${hash}`
const ashash = (link: string): Hash => link.startsWith("#") ? link.slice(1) as Hash : link as Hash
const deref = (dat: Jsonable): Promise<Jsonable> => (typeof dat == "string" && dat.startsWith("#") ? getNote(ashash(dat)).then(n=>deref(n.data)) : Promise.resolve(dat))

type atomicGraph = {
  $: string,
  [key: string]: string
}


export const runPipeline = async (graph: string, input: Hash): Promise<[Hash, string]> => {
  let graphData = (await getNote(ashash(graph))).data as atomicGraph
  let result: Jsonable = {
    value: "NOT FOUND:" + graphData.$
  }

  if (graphData.$ == "input") {
    result = {
      input: aslink(graph),
      value: aslink(input)
    }
  }else if (graphData.$ == "logic") {
    const inputEntries = Object.entries(graphData.inputs)
    const childRuns = await Promise.all(inputEntries.map(async ([name, childGraphHash]) => {
      const [stepHash, valueRef] = await runPipeline(childGraphHash, input)
      return { name, stepHash, value: await deref(valueRef) }
    }))
    const dat = await Function(...childRuns.map(r => r.name), graphData.code)(...childRuns.map(r => r.value))
    result = {
      logic: aslink(graph),
      inputs: Object.fromEntries(childRuns.map(r => [r.name, aslink(r.stepHash)])),
      value: aslink(await addNote({schemaHash: hashData(top), data: dat}))
    }
  }else if (graphData.$ == "llm_call"){
    throw new Error("LLM CALLS NOT IMPLEMENTED")
  }else if (graphData.$ == "loop"){
   throw new Error("LOOPS NOT IMPLEMENTED") 
  }

  console.log("RESULT", tojson(result))

  return [await addNote(hashData(top), result), result.value as string]
}


export const runPipelineTraceByRoot = async (graph: Hash, input: Jsonable): Promise<Hash> => {
  let [hash, _] = await runPipeline(graph, input as Hash);
  return hash;
}


const stripHash = (s: string) => s.startsWith("#") ? s.slice(1) : s

const traceDeps = (s: GraphTraceStep): string[] => {
  if ("inputs" in s) return Object.values(s.inputs).map(stripHash);
  if ("prompt" in s) return [stripHash(s.prompt)];
  if ("loop" in s) return [stripHash(s.input), ...s.steps.map(stripHash)];
  return [];
};

const traceLabel = (s: GraphTraceStep): string => {
  if ("inputs" in s) return "logic";
  if ("prompt" in s) return "llm_call";
  if ("loop" in s) return "loop";
  return "input";
};

export const drawTraceRun = async (trace: Hash): Promise<(upper: UPPER) => VDom> => {
  const nodes: DagNode[] = [];
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  const stepData = new Map<string, GraphTraceStep>();

  const walk = async (hash: string): Promise<void> => {
    const id = stripHash(hash);
    if (seen.has(id)) return;
    seen.add(id);
    const step = (await getNote(id as Hash)).data as GraphTraceStep;
    stepData.set(id, step);
    const lbl = traceLabel(step);
    nodes.push({
      id,
      dom: { tag: "span", attrs: {}, style: {}, textContent: lbl, id: "", children: [] },
    });
    for (const d of traceDeps(step)) {
      await walk(d);
      edges.push([d, id]);
    }
  };

  await walk(trace);

  return (upper: UPPER) => {
    let selectedId: string | null = null;
    let dagControls: DagControls | null = null;

    const panel: VDom = {
      tag: "div", attrs: {}, textContent: "", id: "", children: [],
      style: {
        width: "min(28rem, 42%)", "max-height": "100%", "overflow-y": "auto",
        "background-color": "var(--background-color)", "border-left": "1px solid var(--color)",
        "padding-left": "1em", "padding-right": "0.5em", "padding-top": "0.25em",
      },
    };

    const dag = drawDag({
      nodes, edges,
      onHighlightBox: (id) => {
        selectedId = id;
        rebuildPanel();
        upper.update(panel);
      },
    });
    dagControls = dag.controls;
    const dagView = dag.render(upper);

    const root: VDom = {
      tag: "div", attrs: {}, textContent: "", id: "",
      style: { width: "100%", display: "flex", gap: "0.75em", position: "relative" },
      children: [
        { tag: "div", attrs: {}, style: { width: "100%" }, textContent: "", id: "", children: [dagView] },
        panel,
      ],
    };

    const rebuildPanel = () => {
      const step = selectedId ? stepData.get(selectedId) : null;
      if (!step) {
        panel.style.display = "none";
        panel.children = [];
        return;
      }
      panel.style.display = "block";
      const headerBtn: VDom = {
        tag: "button", attrs: {}, id: "", children: [],
        style: { cursor: "pointer", "margin-bottom": "0.5em", border: "1px solid var(--color)", "border-radius": "0.25em", padding: "0.05em 0.35em", "background-color": "var(--background-color)", color: "var(--color)" },
        textContent: `#${selectedId!.slice(0, 8)}`,
        onEvent: (e) => {
          if (e.type === "click") {
            history.pushState({}, "", `/${selectedId}`);
            dispatchEvent(new PopStateEvent("popstate"));
          }
        },
      };

      const overview = jsonOverview(step);
      const linked = splitRefs(overview).map((tok): VDom => {
        if (tok.type === "text") return { tag: "span", attrs: {}, style: {}, textContent: tok.value, id: "", children: [] };
        const refHash = tok.value;
        const refId = stripHash(refHash);
        const inDag = seen.has(refId);
        return {
          tag: "button", attrs: {}, id: "", children: [],
          style: {
            cursor: "pointer", border: "1px solid var(--color)", "border-radius": "0.25em",
            padding: "0.05em 0.35em", display: "inline-block", margin: "0.1em 0.15em",
            "font-size": "0.95em", "line-height": "1.3", "font-family": "inherit",
            "background-color": inDag && selectedId === refId ? "rgba(255, 153, 0, 0.16)" : "var(--background-color)",
            color: "var(--color)",
          },
          textContent: `#${refId.slice(0, 8)}`,
          onEvent: (e) => {
            if (e.type === "mousemove") { dagControls?.setHighlight(inDag ? refId : null); return; }
            if (e.type === "mouseup") { dagControls?.setHighlight(null); return; }
            if (e.type !== "click") return;
            if (inDag && dagControls) { dagControls.setSelected(refId, false, true); return; }
            history.pushState({}, "", `/${refId}`);
            dispatchEvent(new PopStateEvent("popstate"));
          },
        };
      });

      panel.children = [
        headerBtn,
        {
          tag: "pre", attrs: {}, textContent: "", id: "", children: linked,
          style: { "white-space": "pre-wrap", "font-size": "0.85em", margin: "0", padding: "0.5em", "overflow-y": "auto", "max-height": "100%" },
          onEvent: (e) => { if (e.type === "mousemove" && e.target.tag !== "button") dagControls?.setHighlight(null); },
        },
      ];
    };

    rebuildPanel();
    return root;
  };
}
