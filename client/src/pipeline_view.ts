import { Hash, Jsonable, tojson, hash128, hashData } from "@jsonview/core"
import { type VDom, type UPPER, drawDag, type DagNode, type DagControls, jsonOverview, splitRefs } from "@jsonview/lib"
import { addNote, getNote } from "@jsonview/lib/src/dbconn"
import { Graph } from "@jsonview/lib/src/example/types"
import { graph_schema } from "@jsonview/lib/src/example/pipeline"
import { noteSearch } from "./helpers"
import { runPipelineTraceByRoot } from "./pipeline_run"

const getSrc = (graph: Graph) => {
  if (graph.$ === "logic") return Object.values(graph.inputs)
  if (graph.$ === "llm_call") return [graph.prompt]
  if (graph.$ === "loop") return [graph.input, graph.condition, graph.body]
  return []
}

const childCount = (graph: Graph) => {
  if (graph.$ === "logic") return Object.values(graph.inputs).length
  if (graph.$ === "llm_call") return 1
  if (graph.$ === "loop") return 3
  return 0
}

const setSrc = (graph: Graph, srcs: Graph[]) => {
  if (srcs.length !== childCount(graph)) throw new Error("wrong number of sources")
  if (graph.$ === "logic") return {...graph, inputs: Object.fromEntries(srcs.map((s, i) => [Object.keys(graph.inputs)[i], s]))}
  if (graph.$ === "llm_call") return {...graph, prompt: srcs[0]}
  if (graph.$ === "loop") return {...graph, input: srcs[0], condition: srcs[1], body: srcs[2]}
  return graph
}

const mapGraph = (graph: Graph, f: (g: Graph)=>Promise<Graph>): Promise<Graph> =>  Promise.all(getSrc(graph).map(f)).then(srcs => setSrc(graph,srcs))

// Tracks original (unexpanded) note data and note hashes per content-hash
type NodeInfo = { noteHash?: string, original: Jsonable }

async function expandLinks(data: Jsonable, info: Map<string, NodeInfo>): Promise<Graph> {
  if (typeof data == "string") {
    const noteHash = data.slice(1) as Hash
    const note = await getNote(noteHash)
    const expanded = await expandLinks(note.data, info)
    const id = hash128(tojson(expanded))
    if (!info.has(id)) info.set(id, { noteHash, original: note.data })
    return expanded
  }
  if (!(typeof data == "object" && "$" in data)) throw new Error("not a graph")
  const expanded = await mapGraph(data as Graph, g => expandLinks(g as Jsonable, info))
  const id = hash128(tojson(expanded))
  if (!info.has(id)) info.set(id, { original: data })
  return expanded
}

const graphSchemaHash = hashData(graph_schema)

type DagMeta = { noteHash: Hash, original: Jsonable }

const isGraph = (data: Jsonable): data is Graph =>
  !!data && typeof data === "object" && "$" in data

const atomizeGraph = async (
  data: Jsonable,
  memo = new Map<string, Hash>(),
  byRef = new Map<Hash, Hash>(),
  resolving = new Map<Hash, Promise<Hash>>(),
  stack = new Set<Hash>()
): Promise<Hash> => {
  if (typeof data === "string") {
    if (!data.startsWith("#")) throw new Error("graph refs must start with #")
    const refHash = data.slice(1) as Hash
    const cached = byRef.get(refHash)
    if (cached) return cached
    const pending = resolving.get(refHash)
    if (pending) return await pending
    if (stack.has(refHash)) throw new Error(`cyclic graph reference: #${refHash}`)
    const nextStack = new Set(stack)
    nextStack.add(refHash)
    const task = (async () => {
      const note = await getNote(refHash)
      const atomized = await atomizeGraph(note.data, memo, byRef, resolving, nextStack)
      byRef.set(refHash, atomized)
      return atomized
    })()
    resolving.set(refHash, task)
    try {
      return await task
    } finally {
      resolving.delete(refHash)
    }
  }
  if (!isGraph(data)) throw new Error("not a graph")
  const childHashes = await Promise.all(getSrc(data).map((g) => atomizeGraph(g as Jsonable, memo, byRef, resolving, stack)))
  const atom = setSrc(data, childHashes.map((h) => `#${h}` as unknown as Graph))
  const atomKey = tojson(atom)
  const cached = memo.get(atomKey)
  if (cached) return cached
  const atomHash = await addNote(graphSchemaHash, atom as unknown as Jsonable)
  memo.set(atomKey, atomHash)
  return atomHash
}

const graphToDag = (graph: Graph, info: Map<string, NodeInfo>): { nodes: DagNode[], edges: [string, string][], meta: Map<string, DagMeta> } => {
  const nodes: DagNode[] = []
  const edges: [string, string][] = []
  const meta = new Map<string, DagMeta>()
  const visited = new Set<string>()
  const walk = (g: Graph): string => {
    const id = hash128(tojson(g))
    if (visited.has(id)) return id
    visited.add(id)
    const title = (g as any).title || ""
    const ni = info.get(id)
    const original = ni?.original ?? g
    const noteHash = (ni?.noteHash ?? hashData({ schemaHash: graphSchemaHash, data: original as Jsonable })) as Hash
    nodes.push({ id, dom: { tag: "span", attrs: {}, style: {}, textContent: title ? `${g.$}: ${title}` : g.$, id: "", children: [] } })
    meta.set(id, { noteHash, original })
    getSrc(g).map(walk).forEach(cid => edges.push([cid, id]))
    return id
  }
  walk(graph)
  return { nodes, edges, meta }
}

export const drawPipeline = async (pipeline: Jsonable): Promise<(upper: UPPER) => VDom> => {
  const rootHash = await atomizeGraph(pipeline)
  const info = new Map<string, NodeInfo>()
  const graph = await expandLinks(`#${rootHash}` as Jsonable, info)
  const { nodes, edges, meta } = graphToDag(graph, info)
  const hashToId = new Map<string, string>()
  meta.forEach((m, id) => {
    const h = String(m.noteHash).toLowerCase()
    if (!hashToId.has(h)) hashToId.set(h, id)
  })

  return (upper: UPPER) => {
    let selectedId: string | null = null
    let dagControls: DagControls | null = null

    const panel: VDom = {
      tag: "div",
      attrs: {},
      style: {
        width: "min(28rem, 42%)",
        "max-height": "100%",
        "overflow-y": "auto",
        "background-color": "var(--background-color)",
        "border-left": "1px solid var(--color)",
        "padding-left": "1em",
        "padding-right": "0.5em",
        "padding-top": "0.25em",
      },
      textContent: "",
      id: "",
      children: [],
    }

    const dag = drawDag({
      nodes,
      edges,
      onHighlightBox: (id) => {
        selectedId = id
        rebuildPanel()
        upper.update(panel)
      },
    })
    dagControls = dag.controls
    const dagView = dag.render(upper)

    const runBtn: VDom = {
      tag: "button",
      attrs: {},
      style: {
        cursor: "pointer",
        border: "1px solid var(--color)",
        "border-radius": "0.25em",
        padding: "0.2em 0.55em",
        "background-color": "var(--background-color)",
        color: "var(--color)",
      },
      textContent: "run pipeline",
      id: "",
      children: [],
      onEvent: (e) => {
        if (e.type !== "click") return
        noteSearch(async (s) => {
          const runHash = await runPipelineTraceByRoot(rootHash, s.hash as Hash)
          history.pushState({}, "", `/trace/${runHash}`)
          dispatchEvent(new PopStateEvent("popstate"))
        })
      },
    }

    const root: VDom = {
      tag: "div",
      attrs: {},
      style: { width: "100%", display: "flex", gap: "0.75em", position: "relative", "flex-direction": "column" },
      textContent: "",
      id: "",
      children: [
        { tag: "div", attrs: {}, style: { display: "flex", gap: "0.6em", "align-items": "center" }, textContent: "", id: "", children: [runBtn] },
        { tag: "div", attrs: {}, style: { width: "100%", display: "flex", gap: "0.75em", position: "relative" }, textContent: "", id: "", children: [
          { tag: "div", attrs: {}, style: { width: "100%" }, textContent: "", id: "", children: [dagView] },
          panel,
        ] },
      ],
    }

    const rebuildPanel = () => {
      const selected = selectedId ? meta.get(selectedId) : null
      if (!selected) {
        panel.style.display = "none"
        panel.children = []
        return
      }
      panel.style.display = "block"
      const headerBtn: VDom = {
        tag: "button",
        attrs: {},
        style: { cursor: "pointer", "margin-bottom": "0.5em", border: "1px solid var(--color)", "border-radius": "0.25em", padding: "0.05em 0.35em", "background-color": "var(--background-color)", color: "var(--color)" },
        textContent: `#${String(selected.noteHash).slice(0, 8)}`,
        id: "",
        children: [],
        onEvent: (e) => {
          if (e.type === "mousemove") {
            if (selectedId) dagControls?.setHighlight(selectedId)
            return
          }
          if (e.type === "click") {
            if (selectedId) dagControls?.setSelected(selectedId, false, true)
            return
          }
          if (e.type === "mouseup") {
            dagControls?.setHighlight(null)
            return
          }
        },
      }
      const linked = splitRefs(jsonOverview(selected.original)).map((tok) => {
        if (tok.type === "text") return { tag: "span", attrs: {}, style: {}, textContent: tok.value, id: "", children: [] } as VDom
        const refHash = tok.value
        const refId = hashToId.get(refHash.toLowerCase()) || null
        return {
          tag: "button",
          attrs: {},
          style: {
            cursor: "pointer",
            border: "1px solid var(--color)",
            "border-radius": "0.25em",
            padding: "0.05em 0.35em",
            display: "inline-block",
            margin: "0.1em 0.15em",
            "font-size": "0.95em",
            "line-height": "1.3",
            "font-family": "inherit",
            "background-color": refId && selectedId === refId ? "rgba(255, 153, 0, 0.16)" : "var(--background-color)",
            color: "var(--color)",
          },
          textContent: `#${refHash.slice(0, 8)}`,
          id: "",
          children: [],
          onEvent: (e) => {
            if (e.type === "mousemove") {
              dagControls?.setHighlight(refId)
              return
            }
            if (e.type === "mouseup") {
              dagControls?.setHighlight(null)
              return
            }
            if (e.type !== "click") return
            if (refId && dagControls) {
              dagControls.setSelected(refId, false, true)
              return
            }
            history.pushState({}, "", `/${refHash}`)
            dispatchEvent(new PopStateEvent("popstate"))
          },
        } as VDom
      })

      panel.children = [
        headerBtn,
        {
          tag: "pre",
          attrs: {},
          style: {
            "white-space": "pre-wrap",
            "font-size": "0.85em",
            margin: "0",
            padding: "0.5em",
            "overflow-y": "auto",
            "max-height": "100%",
          },
          textContent: "",
          id: "",
          children: linked,
          onEvent: (e) => {
            if (e.type === "mousemove" && e.target.tag !== "button") dagControls?.setHighlight(null)
          },
        },
      ]
    }

    rebuildPanel()
    return root
  }
}
