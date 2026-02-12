import { type VDom, type UPPER } from "./views.ts"

export type DagNode = { id: string, dom: VDom }

export type DagControls = {
  setHighlight: (id: string | null) => void
  setSelected: (id: string | null, toggle?: boolean, emitClick?: boolean) => void
}

export type DagConfig = {
  nodes: DagNode[]
  edges: [string, string][]
  onClickBox?: (id: string, node: DagNode, selected: boolean) => void
  onHighlightBox?: (id: string | null, node: DagNode | null) => void
  boxW?: number
  boxH?: number
}

type BoxData = { x: number, y: number }
type LayoutNode = { id: string, children: string[], parents: string[], dummy?: boolean }

const svgEl = (tag: string, attrs: Record<string, string>, ...children: VDom[]): VDom =>
  ({ tag, attrs, style: {}, textContent: "", id: "", children })

const svgTextEl = (content: string, attrs: Record<string, string>): VDom =>
  ({ tag: "text", attrs, style: {}, textContent: content, id: "", children: [] })

const layout = (config: DagConfig) => {
  const { nodes: inputNodes, edges, boxW = 36, boxH = 10 } = config

  const nodes = new Map<string, LayoutNode>()
  for (const n of inputNodes) nodes.set(n.id, { id: n.id, children: [], parents: [] })
  for (const [src, tgt] of edges) {
    nodes.get(tgt)?.children.push(src)
    nodes.get(src)?.parents.push(tgt)
  }

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

  let dummyIdx = 0
  for (const node of [...nodes.values()]) {
    const nd = depths.get(node.id)!
    node.children = node.children.flatMap(cid => {
      const cd = depths.get(cid)!
      if (nd - cd <= 1) return [cid]
      let prev = cid
      for (let d = cd + 1; d < nd; d++) {
        const did = `__dummy_${dummyIdx++}`
        nodes.set(did, { id: did, children: [prev], parents: [], dummy: true })
        nodes.get(prev)!.parents = nodes.get(prev)!.parents.filter(p => p !== node.id)
        nodes.get(prev)!.parents.push(did)
        depths.set(did, d)
        prev = did
      }
      nodes.get(prev)!.parents.push(node.id)
      return [prev]
    })
  }

  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  nodes.forEach((_, id) => layers[depths.get(id)!].push(id))

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

  const gapX = boxW + 5, gapY = boxH + 10
  const maxW = Math.max(...layers.map(g => g.length))
  const W = maxW * gapX + 20
  const H = (maxDepth + 1) * gapY + 20
  const positions = new Map<string, BoxData>()
  for (const [depth, group] of layers.entries()) {
    const layerW = group.length * gapX
    const startX = (W - layerW) / 2 + gapX / 2
    for (const [i, id] of group.entries()) {
      positions.set(id, { x: startX + i * gapX, y: 10 + depth * gapY + boxH / 2 })
    }
  }

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

  const nodeEdges = new Map<string, number[]>()
  chains.forEach((chain, i) => {
    for (const id of [chain.sourceId, chain.targetId]) {
      if (!nodeEdges.has(id)) nodeEdges.set(id, [])
      nodeEdges.get(id)!.push(i)
    }
  })

  const boxes = [...positions.entries()].filter(([id]) => !nodes.get(id)?.dummy)
  return { boxes, chains, nodeEdges, viewBox: `0 0 ${W} ${H}`, boxW, boxH }
}

const htmlEl = (tag: string, style: Record<string, string>, ...children: VDom[]): VDom =>
  ({ tag, attrs: {}, style, textContent: "", id: "", children })

const VP_W = 200, VP_H = 110
const MIN_VP_W = 70
const MAX_VP_SCALE = 1.8

type DagRender = { render: (upper: UPPER) => VDom, controls: DagControls }

export const drawDag = (config: DagConfig): DagRender => {
  const { onClickBox, onHighlightBox } = config
  const { boxes, chains, nodeEdges, viewBox: fullViewBox, boxW, boxH } = layout(config)
  const [, , fullW, fullH] = fullViewBox.split(" ").map(Number)
  const nodeDataMap = new Map<string, DagNode>()
  for (const n of config.nodes) nodeDataMap.set(n.id, n)

  const aspect = VP_W / VP_H
  const maxVpW = Math.max(VP_W, fullW * MAX_VP_SCALE)
  let vpW = VP_W
  let vpH = VP_H
  let panX = (fullW - vpW) / 2, panY = (fullH - vpH) / 2
  let dragging = false, dragMoved = false
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0
  let selected: string | null = null
  let externalHighlight: string | null = null
  let upperRef: UPPER | null = null
  let rootRef: VDom | null = null
  let rebuildRef: (() => void) | null = null

  const clampAxis = (pan: number, full: number, vp: number, pad: number) => {
    const center = (full - vp) / 2
    const min = Math.min(center - pad, -pad)
    const max = Math.max(center + pad, full - vp + pad)
    return Math.max(min, Math.min(pan, max))
  }
  const clamp = () => {
    const panPadX = vpW * 0.45
    const panPadY = vpH * 0.25
    panX = clampAxis(panX, fullW, vpW, panPadX)
    panY = clampAxis(panY, fullH, vpH, panPadY)
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

  const nodeLabel = (node: DagNode): string => {
    const txt = (node.dom?.textContent || "").trim()
    return txt || node.id
  }

  const mkBox = (id: string, box: BoxData, highlight: boolean, onEvent?: VDom["onEvent"]): VDom => {
    const node = nodeDataMap.get(id)
    const g = svgEl("g", {},
      svgEl("rect", {
        x: `${box.x - boxW / 2}`, y: `${box.y - boxH / 2}`,
        width: `${boxW}`, height: `${boxH}`,
        fill: "var(--background-color)",
        stroke: highlight ? "#f90" : "var(--color)",
        "stroke-width": highlight ? "0.6" : "0.3",
      }),
      svgTextEl(node ? nodeLabel(node) : id, {
        x: `${box.x}`, y: `${box.y}`,
        "text-anchor": "middle", "dominant-baseline": "central",
        fill: "var(--color)", "font-size": "2.6",
      })
    )
    if (onEvent) g.onEvent = onEvent
    g.style.cursor = "pointer"
    return g
  }

  const notifyHighlight = () => {
    if (!onHighlightBox) return
    const node = selected ? (nodeDataMap.get(selected) || null) : null
    onHighlightBox(selected, node)
  }

  const emitBoxClick = (id: string | null) => {
    if (!id) return
    const node = nodeDataMap.get(id)
    if (!node) return
    if (onClickBox) onClickBox(id, node, true)
    if (node.dom.onEvent) node.dom.onEvent({ type: "click", target: node.dom })
  }

  const refresh = () => {
    if (!upperRef || !rootRef || !rebuildRef) return
    rebuildRef()
    upperRef.update(rootRef)
  }

  const controls: DagControls = {
    setSelected: (id: string | null, toggle = true, emitClick = false) => {
      const next = toggle ? (selected === id ? null : id) : id
      if (next === selected) return
      selected = next
      notifyHighlight()
      refresh()
      if (emitClick) emitBoxClick(selected)
    },
    setHighlight: (id: string | null) => {
      if (externalHighlight === id) return
      externalHighlight = id
      refresh()
    },
  }

  const render = (upper: UPPER) => {
    upperRef = upper

    const svg: VDom = {
      tag: "svg", textContent: "", id: "",
      style: { cursor: "grab" },
      attrs: { viewBox: `${panX} ${panY} ${vpW} ${vpH}`, width: "100%", xmlns: "http://www.w3.org/2000/svg" },
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
          panX = panStartX - dx * (vpW / rect.width)
          panY = panStartY - dy * (vpH / rect.height)
          clamp()
          refresh()
        } else if (e.type === "mouseup") {
          const wasDragging = dragging && dragMoved
          dragging = false
          if (wasDragging) refresh()
        } else if (e.type === "wheel") {
          e.preventDefault?.()
          const rect = (e.currentTarget as Element)?.getBoundingClientRect?.()
          if (!rect) return
          const zoom = (e.deltaY || 0) > 0 ? 1.1 : 0.9
          const oldVpW = vpW, oldVpH = vpH
          const newVpW = Math.max(MIN_VP_W, Math.min(maxVpW, oldVpW * zoom))
          const newVpH = newVpW / aspect
          const px = e.clientX != null ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5
          const py = e.clientY != null ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0.5
          const worldX = panX + px * oldVpW
          const worldY = panY + py * oldVpH
          vpW = newVpW
          vpH = newVpH
          panX = worldX - px * vpW
          panY = worldY - py * vpH
          clamp()
          refresh()
        }
      },
    }

    const root = htmlEl("div", { width: "100%" }, svg)
    rootRef = root

    const rebuild = () => {
      svg.attrs.viewBox = `${panX} ${panY} ${vpW} ${vpH}`
      svg.style.cursor = dragging ? "grabbing" : "grab"
      const activeIds = new Set<string>([selected, externalHighlight].filter((x): x is string => !!x))
      const lit = new Set<number>()
      activeIds.forEach((id) => (nodeEdges.get(id) || []).forEach((i) => lit.add(i)))
      svg.children = [
        ...chains.map((c, i) => mkArrow(c.points, lit.has(i))),
        ...boxes.map(([id, box]) => mkBox(id, box, activeIds.has(id), (e) => {
          if (e.type !== "click" || dragMoved) return
          controls.setSelected(id, true, true)
        })),
      ]
    }
    rebuildRef = rebuild

    rebuild()
    return root
  }
  return { render, controls }
}
