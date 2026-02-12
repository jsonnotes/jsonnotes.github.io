import { it } from "node:test";
import { drawDag } from "../src/dag.ts";
import type { UPPER, VDom } from "../src/views.ts";

const assert = (ok: boolean, message?: string) => {
  if (!ok) throw new Error(message || "Assertion failed");
};

const assertEq = (a: unknown, b: unknown, message?: string) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  assert(sa === sb, message || `${sa} != ${sb}`);
};

const mkUpper = () => {
  const updates: VDom[] = [];
  const upper: UPPER = {
    add: () => {},
    del: () => {},
    update: (el) => updates.push(el),
  };
  return { upper, updates };
};

const getSvg = (root: VDom) => {
  if (root.tag === "svg") return root;
  for (const c of root.children) {
    const found = getSvg(c);
    if (found) return found;
  }
  return undefined;
};
const getPaths = (root: VDom) => getSvg(root)!.children.filter((c) => c.tag === "path");
const getBoxes = (root: VDom) => getSvg(root)!.children.filter((c) => c.tag === "g");

const getBoxLabel = (box: VDom) => {
  const text = box.children.find((c) => c.tag === "text");
  return text?.textContent || "";
};

const findBox = (root: VDom, label: string) =>
  getBoxes(root).find((b) => getBoxLabel(b) === label);

const getBoxRect = (box: VDom) => {
  const rect = box.children.find((c) => c.tag === "rect");
  assert(!!rect, "box rect missing");
  return rect!;
};

const click = (box: VDom) => {
  assert(!!box.onEvent, "box should be clickable");
  box.onEvent!({ type: "click", target: box });
};

it("renders svg vdom with one box per node and one path per edge", () => {
  const { upper } = mkUpper();
  const root = drawDag({
    nodes: [
      { id: "a", dom: { tag: "span", attrs: {}, style: {}, textContent: "A", id: "", children: [] } },
      { id: "b", dom: { tag: "span", attrs: {}, style: {}, textContent: "B", id: "", children: [] } },
      { id: "c", dom: { tag: "span", attrs: {}, style: {}, textContent: "C", id: "", children: [] } },
    ],
    edges: [
      ["a", "b"],
      ["b", "c"],
    ],
  }).render(upper);

  assertEq(root.tag, "div");
  const svg = getSvg(root)!;
  assert(!!svg, "should contain an svg");
  assertEq(svg.attrs.width, "100%");
  assert(svg.attrs.viewBox.split(" ").length === 4, "svg viewBox should have 4 values");

  const paths = getPaths(root);
  const boxes = getBoxes(root);
  assertEq(paths.length, 2);
  assertEq(boxes.length, 3);
  assertEq(boxes.map(getBoxLabel).sort(), ["A", "B", "C"]);
});

it("highlights selected node and connected edges on click", () => {
  const clicked: string[] = [];
  const { upper, updates } = mkUpper();
  const root = drawDag({
    nodes: [
      { id: "a", dom: { tag: "span", attrs: {}, style: {}, textContent: "A", id: "", children: [] } },
      { id: "b", dom: { tag: "span", attrs: {}, style: {}, textContent: "B", id: "", children: [] } },
      { id: "c", dom: { tag: "span", attrs: {}, style: {}, textContent: "C", id: "", children: [] } },
    ],
    edges: [
      ["a", "b"],
      ["b", "c"],
    ],
    onClickBox: (_id, node) => clicked.push(node.id),
  }).render(upper);

  const boxB = findBox(root, "B");
  assert(!!boxB, "B box missing");
  click(boxB!);

  assertEq(updates.length, 1, "click should trigger one update");
  assertEq(clicked, ["b"]);

  const boxBRect = getBoxRect(findBox(root, "B")!);
  assertEq(boxBRect.attrs.stroke, "#f90");
  assertEq(boxBRect.attrs["stroke-width"], "0.6");

  getPaths(root).forEach((path) => {
    assertEq(path.attrs.stroke, "#f90");
    assertEq(path.attrs["stroke-width"], "0.8");
  });
});

it("second click deselects node and removes highlights", () => {
  const clicked: string[] = [];
  const { upper, updates } = mkUpper();
  const root = drawDag({
    nodes: [
      { id: "a", dom: { tag: "span", attrs: {}, style: {}, textContent: "A", id: "", children: [] } },
      { id: "b", dom: { tag: "span", attrs: {}, style: {}, textContent: "B", id: "", children: [] } },
      { id: "c", dom: { tag: "span", attrs: {}, style: {}, textContent: "C", id: "", children: [] } },
    ],
    edges: [
      ["a", "b"],
      ["b", "c"],
    ],
    onClickBox: (_id, node) => clicked.push(node.id),
  }).render(upper);

  const boxB = findBox(root, "B");
  assert(!!boxB, "B box missing");

  click(boxB!);
  click(boxB!);

  assertEq(updates.length, 2);
  assertEq(clicked, ["b"], "onClick should only fire on selection");

  const boxBRect = getBoxRect(findBox(root, "B")!);
  assertEq(boxBRect.attrs.stroke, "var(--color)");
  assertEq(boxBRect.attrs["stroke-width"], "0.3");

  getPaths(root).forEach((path) => {
    assertEq(path.attrs.stroke, "var(--color)");
    assertEq(path.attrs["stroke-width"], "0.5");
  });
});

it("routes long edges with intermediate control segments but no extra boxes", () => {
  const { upper } = mkUpper();
  const root = drawDag({
    nodes: [
      { id: "a", dom: { tag: "span", attrs: {}, style: {}, textContent: "A", id: "", children: [] } },
      { id: "b", dom: { tag: "span", attrs: {}, style: {}, textContent: "B", id: "", children: [] } },
      { id: "c", dom: { tag: "span", attrs: {}, style: {}, textContent: "C", id: "", children: [] } },
    ],
    edges: [
      ["a", "b"],
      ["b", "c"],
      ["a", "c"],
    ],
  }).render(upper);

  const boxes = getBoxes(root);
  const paths = getPaths(root);
  assertEq(boxes.length, 3, "dummy routing nodes should not render as boxes");
  assertEq(paths.length, 3, "each edge should render as one arrow path");

  const controlCount = paths.map((p) => (p.attrs.d.match(/ C/g) || []).length);
  assert(controlCount.some((n) => n >= 2), "expected a multi-segment path for long edge");
});

it("emits highlight callback when selection toggles", () => {
  const highlights: Array<string | null> = [];
  const { upper } = mkUpper();
  const root = drawDag({
    nodes: [
      { id: "a", dom: { tag: "span", attrs: {}, style: {}, textContent: "A", id: "", children: [] } },
      { id: "b", dom: { tag: "span", attrs: {}, style: {}, textContent: "B", id: "", children: [] } },
    ],
    edges: [["a", "b"]],
    onHighlightBox: (id) => highlights.push(id),
  }).render(upper);

  click(findBox(root, "A")!);
  click(findBox(root, "A")!);
  assertEq(highlights, ["a", null]);
});
