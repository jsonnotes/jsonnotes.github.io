import { Hash, Jsonable, tojson, hash128 } from "@jsonview/core"
import { HTML, type VDom } from "@jsonview/lib"
import { getNote } from "@jsonview/lib/src/dbconn"
import { Graph } from "@jsonview/lib/src/example/types"

type BoxData = { x: number, y: number, text: string }


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

const mapGraphSync = (graph: Graph, f: (g: Graph)=>Graph): Graph => setSrc(graph,getSrc(graph).map(f))
const mapGraph = (graph: Graph, f: (g: Graph)=>Promise<Graph>): Promise<Graph> =>  Promise.all(getSrc(graph).map(f)).then(srcs => setSrc(graph,srcs))


async function expandLinks(data:Jsonable): Promise<Graph> {
  console.log("expand", tojson(data))
  if (typeof data == "string") return getNote(data.slice(1) as Hash).then(n => expandLinks(n.data))
  if (!(typeof data == "object" && "$" in data)) throw new Error("not a graph")
  return mapGraph(
    data as Graph,
    async (g: Graph) => expandLinks(g)
  )
}



const BOX_W = 30
const BOX_H = 8

const svgEl = (tag: string, attrs: Record<string, string>, ...children: VDom[]): VDom =>
  ({ tag, attrs, style: {}, textContent: "", id: "", children })

const svgTextEl = (content: string, attrs: Record<string, string>): VDom =>
  ({ tag: "text", attrs, style: {}, textContent: content, id: "", children: [] })

const textbox = (box: BoxData): VDom =>
  svgEl("g", {},
    svgEl("rect", {
      x: `${box.x - BOX_W / 2}`, y: `${box.y - BOX_H / 2}`,
      width: `${BOX_W}`, height: `${BOX_H}`,
      fill: "none", stroke: "var(--color)", "stroke-width": "0.3",
    }),
    svgTextEl(box.text, {
      x: `${box.x}`, y: `${box.y}`,
      "text-anchor": "middle", "dominant-baseline": "central",
      fill: "var(--color)", "font-size": "5",
    })
  )

const arrow = (from: BoxData, to: BoxData): VDom => {
  const x1 = from.x, y1 = from.y + BOX_H / 2
  const x2 = to.x, y2 = to.y - BOX_H / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  const hs = 2
  const d = `M${x1} ${y1} L${x2} ${y2} M${x2 - ux * hs + px * hs / 2} ${y2 - uy * hs + py * hs / 2} L${x2} ${y2} L${x2 - ux * hs - px * hs / 2} ${y2 - uy * hs - py * hs / 2}`
  return svgEl("path", { d, stroke: "var(--color)", "stroke-width": "0.5", fill: "none" })
}

// --- DAG builder: deduplicate nodes by content hash ---

type DagNode = { id: string, graph: Graph, children: string[], parents: string[], label: string }

const buildDag = (graph: Graph) => {
  const nodes = new Map<string, DagNode>()
  const walk = (g: Graph): string => {
    const id = hash128(tojson(g))
    if (nodes.has(id)) return id
    const node: DagNode = { id, graph: g, children: [], parents: [], label: g.$ }
    nodes.set(id, node)
    node.children = getSrc(g).map(walk)
    node.children.forEach(cid => nodes.get(cid)!.parents.push(id))
    return id
  }
  return { nodes, root: walk(graph) }
}

// --- Layered DAG layout (simplified Sugiyama) ---

const layoutDag = (nodes: Map<string, DagNode>, root: string) => {
  // Layer assignment: leaves=0, root=max
  const depths = new Map<string, number>()
  const depthOf = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!
    const n = nodes.get(id)!
    const d = n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 0
    depths.set(id, d)
    return d
  }
  nodes.forEach((_, id) => depthOf(id))
  const maxDepth = Math.max(0, ...depths.values())

  // Group by layer
  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  nodes.forEach((_, id) => layers[depths.get(id)!].push(id))

  // Barycenter ordering (2 passes)
  const pos = new Map<string, number>()
  layers.forEach(g => g.forEach((id, i) => pos.set(id, i)))
  const bary = (id: string, dir: "children" | "parents") => {
    const nb = nodes.get(id)![dir]
    return nb.length ? nb.reduce((s, n) => s + pos.get(n)!, 0) / nb.length : pos.get(id)!
  }
  for (let d = maxDepth - 1; d >= 0; d--) {
    layers[d].sort((a, b) => bary(a, "children") - bary(b, "children"))
    layers[d].forEach((id, i) => pos.set(id, i))
  }
  for (let d = 1; d <= maxDepth; d++) {
    layers[d].sort((a, b) => bary(a, "parents") - bary(b, "parents"))
    layers[d].forEach((id, i) => pos.set(id, i))
  }

  // Position assignment
  const gapX = BOX_W + 5, gapY = BOX_H + 10
  const maxW = Math.max(...layers.map(g => g.length))
  const W = maxW * gapX + 20
  const H = (maxDepth + 1) * gapY + 20
  const positions = new Map<string, BoxData>()
  for (const [depth, group] of layers.entries()) {
    const layerW = group.length * gapX
    const startX = (W - layerW) / 2 + gapX / 2
    for (const [i, id] of group.entries()) {
      positions.set(id, { x: startX + i * gapX, y: 10 + depth * gapY + BOX_H / 2, text: nodes.get(id)!.label })
    }
  }
  return { positions, viewBox: `0 0 ${W} ${H}` }
}

export const drawPipeline = async (pipeline: Jsonable): Promise<VDom> => {
  const graph = await expandLinks(pipeline)
  const { nodes, root } = buildDag(graph)
  const { positions, viewBox } = layoutDag(nodes, root)

  const boxes = [...positions.values()]
  const connections: BoxData[][] = []
  nodes.forEach(node => {
    const to = positions.get(node.id)!
    node.children.forEach(cid => connections.push([positions.get(cid)!, to]))
  })

  return HTML.svgPath([], { viewBox, width: "70%", height: "70%" },
    ...connections.map(([from, to]) => arrow(from, to)),
    ...boxes.map(textbox),
  )
}
