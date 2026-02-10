import { div, h3, popup, pre, style } from "./html";
import { getNote, jsonOverview, sql } from "@jsonview/lib";
import { notePreview } from "./helpers";
import { Hash, hashData, top } from "@jsonview/core";
import { noteSearch } from "./helpers";

type QueryResult = { names: string[]; rows: any[][] };
type DepsDeps = { query: (sql: string) => Promise<QueryResult>, navigate: (ref:string) => void};

export type DepsData = { currentHash: string; inputs: string[]; outputs: string[] };
export type DepsRefs = { current: Hash[]; inputs: Hash[]; outputs: Hash[] };
const appendSvg = (svg: SVGSVGElement, html: string) => {
  svg.insertAdjacentHTML("beforeend", html);
  return svg.lastElementChild as SVGElement | null;
};
export const toSvgPoint = (svg: SVGSVGElement, p: { x: number; y: number }) => {
  if (p.x > 1 || p.y > 1) return p;
  const { width, height } = svg.getBoundingClientRect();
  return { x: p.x * width, y: p.y * height };
};
export const arrow = (
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

export const arrowDown = (
  svg: SVGSVGElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  o: { stroke?: string; strokeWidth?: number } = {}
) => {
  const { stroke = "currentColor", strokeWidth = 2 } = o;
  const a = toSvgPoint(svg, from);
  const b = toSvgPoint(svg, to);
  appendSvg(
    svg,
    `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"></path>`
  );
  const len = 10;
  const x1 = b.x - len * 0.5;
  const y1 = b.y - len;
  const x2 = b.x + len * 0.5;
  const y2 = b.y - len;
  return appendSvg(
    svg,
    `<path d="M ${b.x} ${b.y} L ${x1} ${y1} M ${b.x} ${b.y} L ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"></path>`
  );
};

export const svgText = (svg: SVGSVGElement, pos: { x: number; y: number }, text: string) => {
  const width = 220;
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

export const depsDataFromRows = (rows: any[][], currentHash: string, limit = 10): DepsData => {
  const inputs: string[] = [];
  const outputs: string[] = [];
  rows.forEach((row) => {
    const to = String(row[0] ?? "");
    const from: string[] = row[1] || [];
    if (from.some((hash) => hash === currentHash)) inputs.push(to);
    if (to === currentHash) outputs.push(...from);
  });
  const uniq = (arr: string[]) => [...new Set(arr)];
  return {
    currentHash,
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
  const topHash = hashData(top);
  const fetchSchemas = () =>
    Promise.all([
      sql(`select hash, data from note where schemaHash = '${topHash}'`),
      sql("select schemaHash from note")
    ]).then(([schemasRes, countsRes]) => {
      const counts = new Map<string, number>();
      countsRes.rows.forEach((row) => {
        const hash = String(row[0]);
        counts.set(hash, (counts.get(hash) || 0) + 1);
      });
      return schemasRes.rows.map((row) => {
        let title = "";
        try {
          const parsed = JSON.parse(String(row[1] ?? ""));
          title = parsed?.title ? String(parsed.title) : "";
        } catch {}
        const hash = String(row[0] ?? "");
        return { hash, title, count: counts.get(hash) || 0 };
      });
    });
  root.append(h3("Dependencies"), panel);
  const render = async (hash?: Hash) => {
    svg.innerHTML = "";
    if (!hash) {
      fetchSchemas().then((schemas) =>
        noteSearch((s) => {
          window.history.pushState({}, "", `/deps/${s.hash}`);
          render(s.hash as Hash);
        }, schemas)
      );
      return;
    }
    const currentHash = hash
    const schemaHash = (await getNote(hash)).schemaHash;
    const links = await query("select to, from from links");
    const data = depsDataFromRows(links.rows, currentHash);

    data.inputs = data.inputs.filter((h)=>h!==schemaHash)

    const cols = [
      { ids: data.inputs, x: 0.2 },
      { ids: [data.currentHash], x: 0.5 },
      { ids: data.outputs, x: 0.8 },
    ];
    const labels = new Map<string, string>();
    await Promise.all(
      cols.flatMap((c) =>
        c.ids.map(async (hash) => {
          const label = await notePreview(hash as Hash).then((p) => p.slice(0, 30)).catch(() => `#${hash}`);
          labels.set(hash, label);
        })
      )
    );
    const schemaLabel = await notePreview(schemaHash).then((p) => p.slice(0, 15)).catch(() => `#${schemaHash}`);
    labels.set(schemaHash, schemaLabel);

    const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
    cols.forEach(({ ids, x }) => {
      const n = Math.max(ids.length, 1);
      ids.forEach((hash, row) => {
        const y = n === 1 ? 0.5 : 0.2 + (0.6 * (row + 0.5)) / n;
        const tag = svgText(svg, { x, y }, labels.get(hash) || `#${hash}`);
        tag.node.onclick = () => {
          if (hash === data.currentHash) {
            window.history.pushState({}, "", `/${hash}`);
            navigate(`/${hash}`);
          } else {
            window.history.pushState({}, "", `/deps/${hash}`);
            render(hash as Hash);
          }
        };
        boxes.set(hash, tag.rect);
      });
    });
    const schemaTag = svgText(svg, { x: 0.5, y: 0.1 }, labels.get(schemaHash) || `#${schemaHash}`);
    schemaTag.node.onclick = () => {
      window.history.pushState({}, "", `/deps/${schemaHash}`);
      render(schemaHash as Hash);
    };
    const schemaRect = schemaTag.rect;

    const edge = (r: { x: number; y: number; width: number; height: number }, side: "left" | "right") => ({
      x: side === "left" ? r.x : r.x + r.width,
      y: r.y + r.height / 2,
    });
    const edgeV = (r: { x: number; y: number; width: number; height: number }, side: "top" | "bottom") => ({
      x: r.x + r.width / 2,
      y: side === "top" ? r.y : r.y + r.height,
    });


    const cur = boxes.get(data.currentHash);
    if (cur) {
      data.inputs.forEach((hash) => {
        const r = boxes.get(hash);
        if (r) arrow(svg, edge(r, "right"), edge(cur, "left"));
      });
      data.outputs.forEach((hash) => {
        const r = boxes.get(hash);
        if (r) arrow(svg, edge(cur, "right"), edge(r, "left"));
      });
      if (schemaRect) arrowDown(svg, edgeV(schemaRect, "bottom"), edgeV(cur, "top"));
    }


    getNote(data.currentHash as Hash).then(n => prev.innerHTML = jsonOverview(n.data))


  };

  return { root, render };
};
