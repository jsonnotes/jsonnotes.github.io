self.onmessage = async (e) => {
  const { code, input } = e.data || {};
  try {
    const fn = new Function("input", String(code));
    const result = await fn(input);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
