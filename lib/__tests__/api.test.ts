
import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { createApi } from "../src/api.ts";
import { server } from "../src/cli.ts";


describe("createApi", () => {
  it("creates an api instance with required methods", () => {
    const api = createApi({ server });
    assert.strictEqual(typeof api.req, "function");
    assert.strictEqual(typeof api.callProcedure, "function");
    assert.strictEqual(typeof api.sql, "function");
    assert.strictEqual(typeof api.getNote, "function");
    assert.strictEqual(typeof api.addNote, "function");
    assert.strictEqual(typeof api.setAccessToken, "function");
  });

  const mockSqlResponse = JSON.stringify([{ schema: { elements: [{ name: { some: "col1" } }] }, rows: [[1]] }]);

  it("builds correct URL for requests", async () => {
    let capturedUrl = "";
    const mockFetch = mock.fn(async (url: string) => {
      capturedUrl = url;
      return { ok: true, text: async () => mockSqlResponse } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const api = createApi({server });
    await api.sql("select 1");

    assert.strictEqual(capturedUrl, "http://localhost:3000/v1/database/jsonview/sql");
  });

  it("includes auth header when token is set", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = mock.fn(async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      return { ok: true, text: async () => mockSqlResponse } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const api = createApi({ server, accessToken: "tok123" });
    await api.sql("select 1");

    assert.strictEqual(capturedHeaders["Authorization"], "Bearer tok123");
  });

  it("omits auth header when no token", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = mock.fn(async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      return { ok: true, text: async () => mockSqlResponse } as Response;
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const api = createApi({ server });
    await api.sql("select 1");

    assert.strictEqual(capturedHeaders["Authorization"], undefined);
  });
});
