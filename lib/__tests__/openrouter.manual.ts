import { it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openrouterCall } from "../src/openrouter.ts";

type EnvJson = {
  openrouter?: {
    apiKey?: string;
  };
  OPENROUTER_API_KEY?: string;
};

const loadEnvJson = (): EnvJson => {
  const cwd = process.cwd();
  const paths = [
    join(cwd, ".env.json"),
    join(cwd, "lib", ".env.json"),
    join(cwd, "..", ".env.json"),
    join(cwd, "..", "lib", ".env.json"),
  ];
  const found = paths.find((p) => existsSync(p));
  if (!found) return {};
  try {
    return JSON.parse(readFileSync(found, "utf8")) as EnvJson;
  } catch {
    return {};
  }
};

const assert = (t: boolean, message?: string) => { if (!t) throw new Error(message || "Assertion failed"); };

const envJson = loadEnvJson();
const apiKey =
  process.env.OPENROUTER_API_KEY ||
  envJson.openrouter?.apiKey ||
  envJson.OPENROUTER_API_KEY ||
  "";

it(
  "OpenRouter: json schema",
  async () => {
    assert(Boolean(apiKey), "Missing OpenRouter key. Set OPENROUTER_API_KEY or .env.json openrouter.apiKey");

    const schema = {
      type: "object",
      properties: {
        value: { type: "number" },
      },
      required: ["value"],
      additionalProperties: false,
    };

    const result = await openrouterCall({
      apiKey,
      prompt: "Return a JSON object with value equal to 7.",
      schema,
    }) as { value: number };

    assert(typeof result === "object" && result !== null, "result should be object");
    assert(result.value === 7, `expected value 7, got ${JSON.stringify(result)}`);
  }
);
