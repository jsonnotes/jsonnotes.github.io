import { type VDom, type UPPER } from "./views.ts"

export type DagNode = { id: string, label: string, data?: any }

export type DagConfig = {
  nodes: DagNode[]
  edges: [string, string][]  // [source, target]
  onClick?: (node: DagNode) => void
  overview?: (node: DagNode) => string
  nodeLink?: (node: DagNode) => string | undefined
  boxW?: number
  boxH?: number
}

type BoxData = { x: number, y: number, text: string }
type LayoutNode = { id: string, children: string[], parents: string[], label: string, dummy?: boolean }

const svgEl = (tag: string, attrs: Record<string, string>, ...children: VDom[]): VDom =>
  ({ tag, attrs, style: {}, textContent: "", id: "", children })

const svgTextEl = (content: string, attrs: Record<string, string>): VDom =>
  ({ tag: "text", attrs, style: {}, textContent: content, id: "", children: [] })

const layout = (config: DagConfig) => {
  const { nodes: inputNodes, edges, boxW = 30, boxH = 8 } = config

  // Build adjacency (children = inputs/sources, parents = consumers)
  const nodes = new Map<string, LayoutNode>()
  for (const n of inputNodes) nodes.set(n.id, { id: n.id, children: [], parents: [], label: n.label })
  for (const [src, tgt] of edges) {
    nodes.get(tgt)?.children.push(src)
    nodes.get(src)?.parents.push(tgt)
  }

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

  // Insert dummy nodes for edges spanning >1 layer
  let dummyIdx = 0
  for (const node of [...nodes.values()]) {
    const nd = depths.get(node.id)!
    node.children = node.children.flatMap(cid => {
      const cd = depths.get(cid)!
      if (nd - cd <= 1) return [cid]
      let prev = cid
      for (let d = cd + 1; d < nd; d++) {
        const did = `__dummy_${dummyIdx++}`
        nodes.set(did, { id: did, children: [prev], parents: [], label: "", dummy: true })
        nodes.get(prev)!.parents = nodes.get(prev)!.parents.filter(p => p !== node.id)
        nodes.get(prev)!.parents.push(did)
        depths.set(did, d)
        prev = did
      }
      nodes.get(prev)!.parents.push(node.id)
      return [prev]
    })
  }

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
  const gapX = boxW + 5, gapY = boxH + 10
  const maxW = Math.max(...layers.map(g => g.length))
  const W = maxW * gapX + 20
  const H = (maxDepth + 1) * gapY + 20
  const positions = new Map<string, BoxData>()
  for (const [depth, group] of layers.entries()) {
    const layerW = group.length * gapX
    const startX = (W - layerW) / 2 + gapX / 2
    for (const [i, id] of group.entries()) {
      positions.set(id, { x: startX + i * gapX, y: 10 + depth * gapY + boxH / 2, text: nodes.get(id)!.label })
    }
  }

  // Collect edge chains through dummy nodes
  type Chain = { points: BoxData[], sourceId: string, targetId: string }
  const chains: Chain[] = []
  nodes.forEach(node => {
    if (node.dummy) return
    node.children.forEach(cid => {
      const chain = [positions.get(node.id)!]
      let cur = cid
      while (nodes.get(cur)?.dummy) {
        chain.push(positions.get(cur)!)
        cur = nodes.get(cur)!.children[0]
      }
      chain.push(positions.get(cur)!)
      chain.reverse()
      chains.push({ points: chain, sourceId: cur, targetId: node.id })
    })
  })

  // Node → connected edge indices
  const nodeEdges = new Map<string, number[]>()
  chains.forEach((chain, i) => {
    for (const id of [chain.sourceId, chain.targetId]) {
      if (!nodeEdges.has(id)) nodeEdges.set(id, [])
      nodeEdges.get(id)!.push(i)
    }
  })

  const boxes = [...positions.entries()].filter(([id]) => !nodes.get(id)?.dummy)
  return { positions, boxes, chains, nodeEdges, viewBox: `0 0 ${W} ${H}`, boxW, boxH }
}


const htmlEl = (tag: string, style: Record<string, string>, ...children: VDom[]): VDom =>
  ({ tag, attrs: {}, style, textContent: "", id: "", children })

const VP_W = 200, VP_H = 110

export const drawDag = (config: DagConfig): (upper: UPPER) => VDom => {
  const { onClick, overview, nodeLink } = config
  const { boxes, chains, nodeEdges, viewBox: fullViewBox, boxW, boxH } = layout(config)
  const [, , fullW, fullH] = fullViewBox.split(" ").map(Number)

  const nodeDataMap = new Map<string, DagNode>()
  for (const n of config.nodes) nodeDataMap.set(n.id, n)

  // Pan state — center initially
  let panX = (fullW - VP_W) / 2, panY = (fullH - VP_H) / 2
  let dragging = false, dragMoved = false
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0

  const clamp = () => {
    if (fullW <= VP_W) panX = (fullW - VP_W) / 2
    else panX = Math.max(0, Math.min(panX, fullW - VP_W))
    if (fullH <= VP_H) panY = (fullH - VP_H) / 2
    else panY = Math.max(0, Math.min(panY, fullH - VP_H))
  }
  clamp()

  const mkArrow = (points: BoxData[], highlight: boolean): VDom => {
    const first = points[0], last = points[points.length - 1]
    const x1 = first.x, y1 = first.y + boxH / 2
    const x2 = last.x, y2 = last.y - boxH / 2
    let d: string
    if (points.length === 2) {
      const cy = Math.abs(y2 - y1) * 0.4
      d = `M${x1} ${y1} C${x1} ${y1 + cy} ${x2} ${y2 - cy} ${x2} ${y2}`
    } else {
      d = `M${x1} ${y1}`
      const wp = [{ x: x1, y: y1 }, ...points.slice(1, -1).map(p => ({ x: p.x, y: p.y })), { x: x2, y: y2 }]
      for (let i = 0; i < wp.length - 1; i++) {
        const a = wp[i], b = wp[i + 1]
        const cy = Math.abs(b.y - a.y) * 0.4
        d += ` C${a.x} ${a.y + cy} ${b.x} ${b.y - cy} ${b.x} ${b.y}`
      }
    }
    const hs = 2
    d += ` M${x2 - hs / 2} ${y2 - hs} L${x2} ${y2} L${x2 + hs / 2} ${y2 - hs}`
    return svgEl("path", {
      d, fill: "none",
      stroke: highlight ? "#f90" : "var(--color)",
      "stroke-width": highlight ? "0.8" : "0.5",
      opacity: highlight ? "1" : "0.6",
    })
  }

  const mkBox = (id: string, box: BoxData, highlight: boolean, onEvent?: VDom["onEvent"]): VDom => {
    const g = svgEl("g", {},
      svgEl("rect", {
        x: `${box.x - boxW / 2}`, y: `${box.y - boxH / 2}`,
        width: `${boxW}`, height: `${boxH}`,
        fill: "var(--background-color)",
        stroke: highlight ? "#f90" : "var(--color)",
        "stroke-width": highlight ? "0.6" : "0.3",
      }),
      svgTextEl(box.text, {
        x: `${box.x}`, y: `${box.y}`,
        "text-anchor": "middle", "dominant-baseline": "central",
        fill: "var(--color)", "font-size": "3",
      })
    )
    if (onEvent) g.onEvent = onEvent
    g.style.cursor = "pointer"
    return g
  }

  return (upper: UPPER) => {
    let selected: string | null = null

    const svg: VDom = {
      tag: "svg", textContent: "", id: "",
      style: { cursor: "grab" },
      attrs: { viewBox: `${panX} ${panY} ${VP_W} ${VP_H}`, width: "100%", xmlns: "http://www.w3.org/2000/svg" },
      children: [],
      onEvent: (e) => {
        if (e.type === "mousedown" && e.clientX != null) {
          dragging = true
          dragMoved = false
          dragStartX = e.clientX
          dragStartY = e.clientY!
          panStartX = panX
          panStartY = panY
        } else if (e.type === "mousemove" && dragging && e.clientX != null) {
          const rect = (e.currentTarget as Element)?.getBoundingClientRect?.()
          if (!rect) return
          const dx = e.clientX - dragStartX, dy = e.clientY! - dragStartY
          if (!dragMoved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
          dragMoved = true
          panX = panStartX - dx * (VP_W / rect.width)
          panY = panStartY - dy * (VP_H / rect.height)
          clamp()
          rebuild()
          upper.update(root)
        } else if (e.type === "mouseup") {
          const wasDragging = dragging && dragMoved
          dragging = false
          if (wasDragging) { rebuild(); upper.update(root) }
        }
      },
    }

    const overviewEl: VDom = {
      tag: "pre", textContent: "", id: "", style: {
        "white-space": "pre-wrap", "font-size": "0.85em", "margin": "0",
        "padding": "0.5em", "overflow-y": "auto", "max-height": "100%",
      },
      attrs: {}, children: [],
    }

    const root = htmlEl("div", { display: "flex", gap: "1em", width: "100%", "align-items": "start" },
      htmlEl("div", { flex: "1", "min-width": "0" }, svg),
    )

    const rebuild = () => {
      svg.attrs.viewBox = `${panX} ${panY} ${VP_W} ${VP_H}`
      svg.style.cursor = dragging ? "grabbing" : "grab"
      const lit = new Set(selected ? nodeEdges.get(selected) || [] : [])
      svg.children = [
        ...chains.map((c, i) => mkArrow(c.points, lit.has(i))),
        ...boxes.map(([id, box]) => mkBox(id, box, id === selected, (e) => {
          if (e.type !== "click" || dragMoved) return
          const newSelected = selected === id ? null : id
          if (newSelected) {
            panX = box.x - VP_W / 2
            panY = box.y - VP_H / 2
            clamp()
          }
          selected = newSelected
          rebuild()
          upper.update(root)
          if (onClick && selected) {
            const node = nodeDataMap.get(selected)
            if (node) onClick(node)
          }
        })),
      ]
      const selNode = selected ? nodeDataMap.get(selected) : null
      if (selNode && overview) {
        overviewEl.textContent = overview(selNode)
        const panelChildren: VDom[] = []
        const href = nodeLink?.(selNode)
        if (href) {
          const btn: VDom = {
            tag: "button", textContent: href, id: "", style: { cursor: "pointer", "margin-bottom": "0.5em" },
            attrs: {}, children: [],
            onEvent: (e) => {
              if (e.type !== "click") return
              history.pushState({}, "", href)
              dispatchEvent(new PopStateEvent("popstate"))
            },
          }
          panelChildren.push(btn)
        }
        panelChildren.push(overviewEl)
        root.children = [
          htmlEl("div", { flex: "1", "min-width": "0" }, svg),
          htmlEl("div", { flex: "1", "min-width": "0", "border-left": "1px solid var(--color)", "padding-left": "1em" }, ...panelChildren),
        ]
      } else {
        root.children = [htmlEl("div", { flex: "1", "min-width": "0" }, svg)]
      }
    }

    rebuild()
    return root
  }
}
