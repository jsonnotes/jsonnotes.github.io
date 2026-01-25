const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let nextId = 1;

const requestLLM = (prompt: string) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    self.postMessage({ type: "llm_request", id, prompt });
  });

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === "llm_response") {
    const entry = pending.get(Number(msg.id));
    if (!entry) return;
    pending.delete(Number(msg.id));
    msg.error ? entry.reject(msg.error) : entry.resolve(msg.result);
    return;
  }
  if (msg.type !== "run") return;
  const { code, input } = msg;
  try {
    const fn = new Function("input", "llmrequest", String(code));
    const result = await fn(input, requestLLM);
    self.postMessage({ type: "run_result", ok: true, result });
  } catch (err) {
    self.postMessage({ type: "run_result", ok: false, error: String(err) });
  }
};
