

const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let nextId = 1;

const funcall = (name: string) => (...args: any) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  self.postMessage({ type: "call", id, name, args:JSON.stringify(args) });
})

export const buildins = ["openrouter", "getNote", "addNote"]


self.onmessage = async (e) => {
  const msg = e.data || {};

  if (msg.type === "response") {
    const entry = pending.get(Number(msg.id));
    if (!entry) return;
    pending.delete(Number(msg.id));
    msg.error ? entry.reject(msg.error) : entry.resolve(msg.result);
    return;
  }
  if (msg.type !== "run") return;
  const { code, input } = msg;
  try {
    const fn = new Function("input", ...buildins, `return (async () => {${code}})()`);
    const result = await fn(input, ...buildins.map(funcall));
    self.postMessage({ type: "run_result", ok: true, result });
  } catch (err) {
    self.postMessage({ type: "run_result", ok: false, error: String(err) });
  }
};
