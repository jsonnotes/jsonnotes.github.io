


# %%

import json


def _input(schema): return {"$": "INPUT", "outputSchema": schema}

def llm_call(model, prompt, output_schema): return {"$": "LLMCall", "model": model, "prompt": prompt, "output_schema": output_schema}

def loop(input, condition, body, output_schema): return {"$": "Loop", "input": input, "Condition": condition, "body": body, "outputSchema": output_schema}

def logic(code, output_schema, **inputs): return {"$": "Logic", "input": inputs, "code": code, "outputSchema": output_schema}

def switch (condition, A, B, output_schema): return {"$": "Switch", "Condition": condition, "A": A, "B": B, "outputSchema": output_schema}

ST = {"type": "string"}

RoleSchema = {"type": "object", "properties": {"name": ST, "description": ST}, "required": ["name", "description"]}

resultSchema = {
  "type": "array",
  "items": RoleSchema
}

stateSchema = {"type": "object", "properties": {"done": resultSchema, "law": ST}, "required": ["done", "law"]}

isDone = logic(
  "return state.done.length >= 5",
  {"type": "boolean"},
  state = _input(stateSchema)
)

llmCall = llm_call(
  "gpt-3.5-turbo",
  logic(
    {"state": _input(stateSchema)},
    "return `Extract participants from the following text: ${state.law}\npreviously extracted participants: ${JSON.stringify(state.done)}`",
    ST
  ),
  resultSchema
)

llmLoop = loop(
  logic(
    "return {done: [], law: law}",
    stateSchema,
    law=_input(ST)
  ),
  isDone,
  llmCall,
  stateSchema
)

graph = logic(
  "return state.done",
  resultSchema,
  state= llmLoop
)


print(json.dumps(graph, indent=2))

# %%
