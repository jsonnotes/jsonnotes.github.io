const isRef = (value: string) => /^#([a-f0-9]+)$/.exec(value);

export const expandLinksSync = (
  value: any,
  resolve: (ref: string) => any,
  seen = new Set<string>()
): any => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    if (seen.has(ref)) throw new Error(`cycle: #${ref}`);
    seen.add(ref);
    return expandLinksSync(resolve(ref), resolve, seen);
  }
  if (Array.isArray(value)) return value.map((v) => expandLinksSync(v, resolve, seen));
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = expandLinksSync(v, resolve, seen);
    return out;
  }
  return value;
};
