import { Hash, Jsonable, hashData, tojson, top } from "@jsonview/core";
import { type DagNode, type DagControls, drawDag, jsonOverview, splitRefs, type UPPER, type VDom } from "@jsonview/lib";
import { addNote, getNote } from "@jsonview/lib/src/dbconn";
import { object, string } from "@jsonview/lib/src/example/types";

export type GraphTraceStep = ({
  pipelineNode?: string, input: string, value: Jsonable
} | {
  pipelineNode?: string, logic: string, inputs: Record<string, string>, value: Jsonable
} | {
  pipelineNode?: string, llm_call: string, prompt: string, value: Jsonable
} | {
  pipelineNode?: string, loop: string, input: string, steps: string[], value: Jsonable
});

export const GraphTraceStepSchema = await addNote({
  schemaHash: hashData(top),
  data:{
    title: "GraphTraceStepSchema",
    $id: "GraphTraceStep",
    oneOf: [
      object({
        pipelineNode: string,
        input: string,
        value: {}
      }),
      object({
        pipelineNode: string,
        logic: string,
        inputs: {type: "object", additionalProperties: string},
        value: {}
      }),
      object({
        pipelineNode: string,
        llm_call: string,
        prompt: string,
        value: {}
      }),
      object({
        pipelineNode: string,
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

const MAX_LOOP_STEPS = 64


export const runPipeline = async (graph: string, input: Hash): Promise<[Hash, string]> => {
  let graphData = (await getNote(ashash(graph))).data as atomicGraph
  let result: Jsonable = {
    value: "NOT FOUND:" + graphData.$
  }

  if (graphData.$ == "input") {
    result = {
      pipelineNode: aslink(graph),
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
      pipelineNode: aslink(graph),
      logic: aslink(graph),
      inputs: Object.fromEntries(childRuns.map(r => [r.name, aslink(r.stepHash)])),
      value: aslink(await addNote({schemaHash: hashData(top), data: dat}))
    }
  }else if (graphData.$ == "llm_call"){
    throw new Error("LLM CALLS NOT IMPLEMENTED")
  }else if (graphData.$ == "loop"){
    const [inputStepHash, initialValueRef] = await runPipeline(graphData.input, input)
    let currentValueRef = String(initialValueRef)
    if (!currentValueRef.startsWith("#")) {
      const wrapped = await addNote({ schemaHash: hashData(top), data: initialValueRef as Jsonable })
      currentValueRef = aslink(wrapped)
    }

    const stepRefs: string[] = []
    let guard = 0
    while (guard < MAX_LOOP_STEPS) {
      guard += 1
      const [conditionStepHash, conditionValueRef] = await runPipeline(graphData.condition, ashash(currentValueRef))
      stepRefs.push(aslink(conditionStepHash))
      const conditionValue = await deref(conditionValueRef)
      if (!conditionValue) break

      const [bodyStepHash, bodyValueRef] = await runPipeline(graphData.body, ashash(currentValueRef))
      stepRefs.push(aslink(bodyStepHash))
      currentValueRef = String(bodyValueRef)
      if (!currentValueRef.startsWith("#")) {
        const wrapped = await addNote({ schemaHash: hashData(top), data: bodyValueRef as Jsonable })
        currentValueRef = aslink(wrapped)
      }
    }
    if (guard >= MAX_LOOP_STEPS) throw new Error(`loop exceeded max steps (${MAX_LOOP_STEPS})`)
    result = {
      pipelineNode: aslink(graph),
      loop: aslink(graph),
      input: aslink(inputStepHash),
      steps: stepRefs,
      value: currentValueRef
    }
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

const tracePipelineNode = (s: GraphTraceStep): string | null => {
  if (typeof s.pipelineNode === "string" && s.pipelineNode.startsWith("#")) return stripHash(s.pipelineNode);
  if ("logic" in s) return stripHash(s.logic);
  if ("llm_call" in s) return stripHash(s.llm_call);
  if ("loop" in s) return stripHash(s.loop);
  if ("input" in s) return stripHash(s.input);
  return null;
};

type PipelineNode = { $: string, title?: string, inputs?: Record<string, string>, prompt?: string, input?: string, condition?: string, body?: string }

const pipelineDeps = (node: PipelineNode): string[] => {
  if (node.$ === "logic") return Object.values(node.inputs || {}).map(stripHash);
  if (node.$ === "llm_call") return node.prompt ? [stripHash(node.prompt)] : [];
  if (node.$ === "loop") return [node.input, node.condition, node.body].filter((x): x is string => !!x).map(stripHash);
  return [];
};

const valueLabel = (v: Jsonable): string => {
  if (typeof v === "string") return v.startsWith("#") ? `ref ${v.slice(1, 9)}` : v.slice(0, 16);
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === "object") return `object(${Object.keys(v).length})`;
  return String(v);
};

const shortRef = (s: string | null | undefined): string => s ? `#${stripHash(s).slice(0, 8)}` : "";

const typeBadgeColor = (kind: string): string => {
  if (kind === "logic") return "#2f80ed";
  if (kind === "input") return "#27ae60";
  if (kind === "llm_call") return "#d35400";
  if (kind === "loop") return "#8e44ad";
  return "var(--color)";
};

export const drawTraceRun = async (trace: Hash): Promise<(upper: UPPER) => VDom> => {
  const nodes: DagNode[] = [];
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  const stepData = new Map<string, GraphTraceStep>();
  const expandedValue = new Map<string, Jsonable>();
  const pipelineNodes = new Map<string, PipelineNode>();
  const pipelineEdges: [string, string][] = [];
  const pipelineSeen = new Set<string>();

  const walk = async (hash: string): Promise<void> => {
    const id = stripHash(hash);
    if (seen.has(id)) return;
    seen.add(id);
    const step = (await getNote(id as Hash)).data as GraphTraceStep;
    stepData.set(id, step);
    const lbl = traceLabel(step);
    const pv = tracePipelineNode(step);
    const pl = pv ? shortRef(pv) : "n/a";
    nodes.push({
      id,
      dom: { tag: "span", attrs: {}, style: {}, textContent: `${lbl} | ${valueLabel(step.value)} | ${pl}`, id: "", children: [] },
    });
    for (const d of traceDeps(step)) {
      await walk(d);
      edges.push([d, id]);
    }
  };

  await walk(trace);

  const noteDataCache = new Map<string, Promise<Jsonable>>();
  const resolve = (hash: Hash): Promise<Jsonable> => {
    const key = String(hash);
    if (!noteDataCache.has(key)) noteDataCache.set(key, getNote(hash).then((n) => n.data));
    return noteDataCache.get(key)!;
  };
  const expandValueRefs = async (value: Jsonable, visiting = new Set<string>()): Promise<Jsonable> => {
    if (typeof value === "string" && value.startsWith("#")) {
      const ref = stripHash(value);
      if (!ref) return value;
      if (visiting.has(ref)) return value;
      visiting.add(ref);
      try {
        const resolved = await resolve(ref as Hash);
        return await expandValueRefs(resolved, visiting);
      } catch {
        return value;
      } finally {
        visiting.delete(ref);
      }
    }
    if (Array.isArray(value)) return Promise.all(value.map((v) => expandValueRefs(v, visiting)));
    if (value && typeof value === "object") {
      const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await expandValueRefs(v, visiting)] as [string, Jsonable]));
      return Object.fromEntries(entries);
    }
    return value;
  };
  await Promise.all([...stepData.entries()].map(async ([id, step]) => {
    try {
      expandedValue.set(id, await expandValueRefs(step.value));
    } catch {
      expandedValue.set(id, step.value);
    }
  }));

  const walkPipeline = async (hash: string): Promise<void> => {
    const id = stripHash(hash);
    if (pipelineSeen.has(id)) return;
    pipelineSeen.add(id);
    const data = (await getNote(id as Hash)).data as PipelineNode;
    if (!data || typeof data !== "object" || !("$" in data)) return;
    pipelineNodes.set(id, data);
    for (const dep of pipelineDeps(data)) {
      await walkPipeline(dep);
      pipelineEdges.push([dep, id]);
    }
  };

  const pipelineRoots = [...new Set([...stepData.values()].map(tracePipelineNode).filter((x): x is string => !!x))];
  await Promise.all(pipelineRoots.map((h) => walkPipeline(h)));

  const pipelineDagNodes: DagNode[] = [...pipelineNodes.entries()].map(([id, node]) => ({
    id,
    dom: { tag: "span", attrs: {}, style: {}, textContent: node.title ? `${node.$}: ${node.title}` : node.$, id: "", children: [] },
  }));

  return (upper: UPPER) => {
    let selectedId: string | null = null;
    let dagControls: DagControls | null = null;
    let selectedPipelineId: string | null = null;
    let pipelineControls: DagControls | null = null;

    const panel: VDom = {
      tag: "div", attrs: {}, textContent: "", id: "", children: [],
      style: {
        width: "min(28rem, 42%)", "max-height": "100%", "overflow-y": "auto",
        "background-color": "var(--background-color)", "border-left": "1px solid var(--color)",
        "padding-left": "1em", "padding-right": "0.5em", "padding-top": "0.25em",
      },
    };

    const traceDag = drawDag({
      nodes, edges,
      boxW: 50, boxH: 12,
      onHighlightBox: (id) => {
        selectedId = id;
        const step = id ? stepData.get(id) : null;
        const pipelineId = step ? tracePipelineNode(step) : null;
        selectedPipelineId = pipelineId;
        if (pipelineControls) pipelineControls.setSelected(pipelineId, false, false);
        rebuildPanel();
        upper.update(panel);
      },
    });
    dagControls = traceDag.controls;
    const traceDagView = traceDag.render(upper);

    const pipelineDag = drawDag({
      nodes: pipelineDagNodes,
      edges: pipelineEdges,
      boxW: 50, boxH: 12,
      onHighlightBox: (id) => {
        selectedPipelineId = id;
        upper.update(panel);
      },
    });
    pipelineControls = pipelineDag.controls;
    const pipelineDagView = pipelineDag.render(upper);

    const root: VDom = {
      tag: "div", attrs: {}, textContent: "", id: "",
      style: { width: "100%", display: "flex", gap: "0.75em", position: "relative" },
      children: [
        { tag: "div", attrs: {}, style: { width: "100%", display: "flex", gap: "0.75em" }, textContent: "", id: "", children: [
          { tag: "div", attrs: {}, style: { width: "50%", display: "flex", "flex-direction": "column", gap: "0.4em" }, textContent: "", id: "", children: [
            { tag: "div", attrs: {}, style: { "font-weight": "600", "font-size": "0.9em" }, textContent: "Execution Trace", id: "", children: [] },
            traceDagView
          ]},
          { tag: "div", attrs: {}, style: { width: "50%", display: "flex", "flex-direction": "column", gap: "0.4em" }, textContent: "", id: "", children: [
            { tag: "div", attrs: {}, style: { "font-weight": "600", "font-size": "0.9em" }, textContent: "Pipeline Graph", id: "", children: [] },
            pipelineDagView
          ]}
        ]},
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
      const kind = traceLabel(step);
      const pipelineId = tracePipelineNode(step);
      const preview = expandedValue.get(selectedId!) ?? step.value;
      const valueText = typeof preview === "string"
        ? preview
        : JSON.stringify(preview, null, 2);
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
      const pipelineBtn: VDom = {
        tag: "button", attrs: {}, id: "", children: [],
        style: {
          cursor: pipelineId ? "pointer" : "default",
          "margin-left": "0.35em",
          border: "1px solid var(--color)",
          "border-radius": "0.25em",
          padding: "0.05em 0.35em",
          "background-color": pipelineId && selectedPipelineId === pipelineId ? "rgba(255, 153, 0, 0.16)" : "var(--background-color)",
          color: "var(--color)"
        },
        textContent: pipelineId ? `pipeline ${shortRef(pipelineId)}` : "pipeline n/a",
        onEvent: (e) => {
          if (e.type !== "click" || !pipelineId) return;
          selectedPipelineId = pipelineId;
          pipelineControls?.setSelected(pipelineId, false, false);
          upper.update(panel);
        },
      };
      const typeBadge: VDom = {
        tag: "span", attrs: {}, id: "", children: [],
        style: {
          display: "inline-block",
          "font-size": "0.78em",
          "font-weight": "600",
          color: "white",
          "background-color": typeBadgeColor(kind),
          "border-radius": "0.9em",
          padding: "0.12em 0.45em",
          "margin-right": "0.35em"
        },
        textContent: kind
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
        { tag: "div", attrs: {}, id: "", textContent: "", style: { display: "flex", "align-items": "center", "margin-bottom": "0.5em" }, children: [typeBadge, headerBtn, pipelineBtn] },
        {
          tag: "pre", attrs: {}, textContent: valueText, id: "", children: [],
          style: { "white-space": "pre-wrap", "font-size": "0.82em", margin: "0 0 0.55em 0", padding: "0.45em", border: "1px solid #ccc", "border-radius": "0.25em", "max-height": "8em", "overflow-y": "auto" },
        },
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
