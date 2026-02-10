import { Jsonable } from "@jsonview/core"
import { HTML, type VDom } from "@jsonview/lib"

type BoxData = { x: number, y: number, text: string }

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

const drawBoxes = (boxes: BoxData[], connections: BoxData[][]): VDom =>
  HTML.svgPath([], { viewBox: "0 0 100 80", width: "70%", height: "70%" },
    ...connections.map(([from, to]) => arrow(from, to)),
    ...boxes.map(textbox),
  )

export const drawPipeline = (pipeline: Jsonable): VDom => {
  const boxes: BoxData[] = []
  const connections: BoxData[][] = []
  const n = pipeline as any

  const depth = (n: any): number =>
    n.$ === "logic" ? 1 + Math.max(0, ...Object.values(n.inputs as Record<string, any>).map((v: any) => depth(v)))
    : n.$ === "llm_call" ? 1 + depth(n.prompt)
    : 0

  const leaves = (n: any): number =>
    n.$ === "logic" ? Object.values(n.inputs as Record<string, any>).reduce((s: number, v: any) => s + leaves(v), 0) || 1
    : n.$ === "llm_call" ? leaves(n.prompt)
    : 1

  const maxD = depth(n), numL = leaves(n)
  const colW = 80 / Math.max(1, numL)
  const rowH = maxD > 0 ? 60 / maxD : 20
  const baseY = 10 + maxD * rowH
  let leafIdx = 0

  const place = (n: any, level: number): BoxData => {
    const y = baseY - level * rowH
    if (n.$ === "input") {
      const box: BoxData = { x: 10 + (++leafIdx - 0.5) * colW, y, text: "input" }
      boxes.push(box)
      return box
    }
    const children =
      n.$ === "logic" ? Object.values(n.inputs as Record<string, any>).map((v: any) => place(v, level + 1))
      : n.$ === "llm_call" ? [place(n.prompt, level + 1)]
      : []
    const x = children.length ? children.reduce((s, b) => s + b.x, 0) / children.length : 50
    const box: BoxData = { x, y, text: n.$ }
    boxes.push(box)
    children.forEach(c => connections.push([c, box]))
    return box
  }

  place(n, 0)
  return drawBoxes(boxes, connections)
}
