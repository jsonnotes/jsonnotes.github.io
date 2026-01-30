import { div, h3, popup, pre, style } from "./html";
import { getId, noteOverview, notePreview, query_data } from "./dbconn";
import { Ref } from "../spacetimedb/src/notes";
import { noteSearch } from "./helpers";

type QueryResult = { names: string[]; rows: any[][] };
type DepsDeps = { query: (sql: string) => Promise<QueryResult>, navigate: (ref:string) => void};

export type DepsData = { currentId: number; inputs: number[]; outputs: number[] };
export type DepsRefs = { current: Ref[]; inputs: Ref[]; outputs: Ref[] };
const appendSvg = (svg: SVGSVGElement, html: string) => {
  svg.insertAdjacentHTML("beforeend", html);
  return svg.lastElementChild as SVGElement | null;
};
export const toSvgPoint = (svg: SVGSVGElement, p: { x: number; y: number }) => {
  if (p.x > 1 || p.y > 1) return p;
  const { width, height } = svg.getBoundingClientRect();
  return { x: p.x * width, y: p.y * height };
};
export const bezierPath = (
  svg: SVGSVGElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  o: { stroke?: string; strokeWidth?: number; curvature?: number } = {}
) => {
  const { stroke = "currentColor", strokeWidth = 2, curvature = 0.4 } = o;
  const a = toSvgPoint(svg, from);
  const b = toSvgPoint(svg, to);
  const dx = Math.max(10, Math.abs(b.x - a.x) * curvature);
  appendSvg(
    svg,
    `<path d="M ${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"></path>`
  );
  const len = 10;
  const x1 = b.x - len;
  const y1 = b.y - len * 0.5;
  const x2 = b.x - len;
  const y2 = b.y + len * 0.5;
  return appendSvg(
    svg,
    `<path d="M ${b.x} ${b.y} L ${x1} ${y1} M ${b.x} ${b.y} L ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"></path>`
  );
};
export const svgText = (svg: SVGSVGElement, pos: { x: number; y: number }, text: string) => {
  const width = 140;
  const p = toSvgPoint(svg, pos);
  const g = appendSvg(
    svg,
    `<g><text x="${p.x}" y="${p.y}" dominant-baseline="middle" text-anchor="middle" fill="var(--color)" font-size="14" cursor="pointer" font-family="sans-serif">${text}</text></g>`
  ) as SVGGElement;
  const t = g?.querySelector("text") as SVGTextElement;
  const pad = 5;
  const box = t.getBBox();
  const height = box.height + pad * 2;
  const left = p.x - width / 2;
  const top = p.y - height / 2;
  g.insertAdjacentHTML(
    "afterbegin",
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="2" ry="2" fill="var(--background-color)" cursor="pointer" stroke="var(--color)" stroke-width="2"></rect>`
  );
  return { node: g, rect: { x: left, y: top, width, height } };
};
export const depsDataFromRows = (rows: any[][], currentId: number, limit = 10): DepsData => {
  const inputs: number[] = [];
  const outputs: number[] = [];
  rows.forEach((row) => {
    const to = Number(row[0]);
    const from: number[] = row[1] || [];
    if (from.some((id) => Number(id) === Number(currentId))) inputs.push(to);
    if (to === Number(currentId)) outputs.push(...from);
  });
  const uniq = (arr: number[]) => [...new Set(arr)];
  return {
    currentId,
    inputs: uniq(inputs).slice(0, limit),
    outputs: uniq(outputs).slice(0, limit),
  };
};


export const createDepsView = ({ query, navigate}: DepsDeps) => {
  const root = div(style({ display: "flex", flexDirection: "column", gap: "0.75em" }));
  const panel = div(style({ width: "100%", minHeight: "320px" }));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const prev = pre()
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "320");
  panel.append(svg, prev);
  const fetchSchemas = () =>
    Promise.all([
      query_data("select id, data, hash from note where schemaId = 0"),
      query_data("select schemaId from note")
    ]).then(([schemasRes, countsRes]) => {
      const counts = new Map<string, number>();
      countsRes.rows.forEach((row) => {
        const id = String(row[0]);
        counts.set(id, (counts.get(id) || 0) + 1);
      });
      return schemasRes.rows.map((row) => {
        let title = "";
        try {
          const parsed = JSON.parse(String(row[1] ?? ""));
          title = parsed?.title ? String(parsed.title) : "";
        } catch {}
        const id = String(row[0]);
        return { id, title, hash:String(row[2] ?? ""), count: counts.get(id) || 0 };
      });
    });
  root.append(h3("Dependencies"), panel);
  const render = async (ref?: Ref) => {
    svg.innerHTML = "";
    if (!ref) {
      fetchSchemas().then((schemas) =>
        noteSearch((s) => {
          window.history.pushState({}, "", `/deps/${s.id}`);
          render(s.id as Ref);
        }, schemas)
      );
      return;
    }
    const currentId = await getId(ref);
    const links = await query("select to, from from links");
    const data = depsDataFromRows(links.rows, currentId);

    const cols = [
      { ids: data.inputs, x: 0.2 },
      { ids: [data.currentId], x: 0.5 },
      { ids: data.outputs, x: 0.8 },
    ];
    const labels = new Map<number, string>();
    await Promise.all(
      cols.flatMap((c) =>
        c.ids.map(async (id) => {
          const label = await notePreview(id).then((p) => p.slice(0, 15)).catch(() => `#${id}`);
          labels.set(id, label);
        })
      )
    );

    const boxes = new Map<number, { x: number; y: number; width: number; height: number }>();
    cols.forEach(({ ids, x }) => {
      const n = Math.max(ids.length, 1);
      ids.forEach((id, row) => {
        const y = n === 1 ? 0.5 : 0.2 + (0.6 * (row + 0.5)) / n;
        const tag = svgText(svg, { x, y }, labels.get(id) || `#${id}`);
        tag.node.onclick = () => (id === data.currentId ? navigate(`/${id}`) : render(`#${id}`));
        boxes.set(id, tag.rect);
      });
    });

    const edge = (r: { x: number; y: number; width: number; height: number }, side: "left" | "right") => ({
      x: side === "left" ? r.x : r.x + r.width,
      y: r.y + r.height / 2,
    });

    const cur = boxes.get(data.currentId);
    if (cur) {
      data.inputs.forEach((id) => {
        const r = boxes.get(id);
        if (r) bezierPath(svg, edge(r, "right"), edge(cur, "left"));
      });
      data.outputs.forEach((id) => {
        const r = boxes.get(id);
        if (r) bezierPath(svg, edge(cur, "right"), edge(r, "left"));
      });
    }
    

    noteOverview(data.currentId).then(p=>{
      prev.innerHTML = p
    })


  };

  return { root, render };
};
