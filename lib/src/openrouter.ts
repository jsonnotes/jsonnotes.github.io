import { validate } from "@jsonview/core";

export type OpenRouterConfig = {
  apiKey: string;
  prompt: string;
  schema: unknown;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

type OpenRouterMessage = { role: "user"; content: string };

type OpenRouterRequestBody = {
  model: string;
  messages: OpenRouterMessage[];
  response_format: {
    type: "json_schema";
    json_schema: {
      name: "response";
      schema: unknown;
    };
  };
};

const defaultEndpoint = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export const openrouterCall = async ({
  apiKey,
  prompt,
  schema,
  model = DEFAULT_OPENROUTER_MODEL,
  endpoint = defaultEndpoint,
  fetchImpl = fetch,
}: OpenRouterConfig): Promise<unknown> => {
  if (!apiKey) throw new Error("openrouter apiKey is required");

  const body: OpenRouterRequestBody = {
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "response", schema },
    },
  };

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`openrouter request failed: ${response.status} ${response.statusText} ${errBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return data;

  try {
    const parsed = JSON.parse(content);
    validate(parsed, schema as any);
    return parsed;
  } catch {
    return data;
  }
};
