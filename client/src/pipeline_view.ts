import { Hash, Jsonable, tojson, hash128, hashData } from "@jsonview/core"
import { type VDom, type UPPER, drawDag, type DagNode, jsonOverview } from "@jsonview/lib"
import { getNote } from "@jsonview/lib/src/dbconn"
import { Graph } from "@jsonview/lib/src/example/types"
import { graph_schema } from "@jsonview/lib/src/example/pipeline"

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

const graphToDag = (graph: Graph, info: Map<string, NodeInfo>): { nodes: DagNode[], edges: [string, string][] } => {
  const nodes: DagNode[] = []
  const edges: [string, string][] = []
  const visited = new Set<string>()
  const walk = (g: Graph): string => {
    const id = hash128(tojson(g))
    if (visited.has(id)) return id
    visited.add(id)
    const title = (g as any).title || ""
    const ni = info.get(id)
    const original = ni?.original ?? g
    const noteHash = ni?.noteHash ?? hashData({ schemaHash: graphSchemaHash, data: original as Jsonable })
    nodes.push({ id, label: title ? `${g.$}: ${title}` : g.$, data: { noteHash, original } })
    getSrc(g).map(walk).forEach(cid => edges.push([cid, id]))
    return id
  }
  walk(graph)
  return { nodes, edges }
}

export const drawPipeline = async (pipeline: Jsonable): Promise<(upper: UPPER) => VDom> => {
  const info = new Map<string, NodeInfo>()
  const graph = await expandLinks(pipeline, info)
  const { nodes, edges } = graphToDag(graph, info)
  return drawDag({
    nodes, edges,
    overview: n => jsonOverview(n.data.original),
    nodeLink: n => `/${n.data.noteHash}`,
  })
}
