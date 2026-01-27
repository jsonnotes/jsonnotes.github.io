const isRef = (value: string) => /^#([A-Za-z0-9]+)$/.exec(value);

export const expandLinks = async (
  value: any,
  resolve: (ref: string) => Promise<any>,
  seen = new Set<string>()
): Promise<any> => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    if (seen.has(ref)) throw new Error(`cycle: #${ref}`);
    seen.add(ref);
    return expandLinks(await resolve(ref), resolve, seen);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => expandLinks(v, resolve, seen)));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await expandLinks(v, resolve, seen)])));
  }
  return value;
};
