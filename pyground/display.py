from __future__ import annotations
import json
from typing import Union, Any


Schema = dict[str, Any]
String = {"type": "string"}
Number = {"type": "number"}
Boolean = {"type": "boolean"}
def Object(required = [],  **properties):
  return {"type": "object", "properties": properties, "required": required}

Graph = dict[str, Any]

class Graph:
  def __init__(self, inputSchema: Schema | None, outputSchema: Schema):
    self.inputSchema = inputSchema
    self.outputSchema = outputSchema

  def __repr__(self): return pretty(self)

  def parents(self): return []

class Input(Graph):
  def __init__(self, schema: Schema = String):
    super().__init__(schema, schema)


class Logic(Graph):
  def __init__(self, code: str, output: Schema, **args: Graph):
    inputSchemas = [a.inputSchema for a in args.values() if a.inputSchema is not None]
    for ips in inputSchemas:
      assert ips == inputSchemas[0], f"Not all input schemas are the same: {ips} != {ips[0]}"
    super().__init__(
      inputSchemas[0] if inputSchemas else None,
      output
    )
    self.code = code
    self.args = args
  
  def parents(self): return [self.code, self.args]


class LLMCall(Graph):
  def __init__(self, prompt: Graph, output: Schema, model: str):
    assert prompt.outputSchema == String, f"LLMCall prompt must be string: {prompt.outputSchema}"
    super().__init__(prompt.inputSchema, output)
    self.prompt = prompt
    self.model = model

  
  def parents(self): return [self.model, self.prompt]

class Loop(Graph):
  def __init__(self, input:Graph, condition: Graph, body: Graph):
    assert input.outputSchema == condition.inputSchema == body.inputSchema == body.outputSchema, f"Loop input, condition and body dont match."
    assert condition.outputSchema == Boolean, f"Loop condition must be boolean: {condition.outputSchema}"
    super().__init__(body.inputSchema, body.outputSchema)
    self.input = input
    self.condition = condition
    self.body = body
  
  def parents(self): return [{"input": self.input,"condiiton": self.condition, "body": self.body}]


def pretty(graph: Graph, ws = None):
  ws = "\n  " if ws is None else ws + '  '
  ret = f"{graph.__class__.__name__}"
  for p in  graph.parents():

    if (isinstance(p, Graph)):
      ret += ws + pretty(p,ws)
    elif isinstance(p, dict):
      for [k,v] in p.items():
        ret += ws + f"{k}: {pretty(v, ws)}"
    else: ret += ws + json.dumps(p)

  return ret
    
  

inp = Input(String)
b = Logic("print('hello')", String, x=inp)


ST = String

RoleSchema = {"type": "object", "properties": {"name": String, "description": String}, "required": ["name", "description"]}

resultSchema = {
  "type": "array",
  "items": RoleSchema
}

stateSchema = {"type": "object", "properties": {"done": resultSchema, "law": ST}, "required": ["done", "law"]}

isDone = Logic(
  "return state.done.length >= 5",
  {"type": "boolean"},
  state = Input(stateSchema)
)


llmCall = LLMCall(
  Logic(
    "return `Extract participants from the following text: ${state.law}\npreviously extracted participants: ${JSON.stringify(state.done)}`",
    ST,
    state = Input(stateSchema)
  ),
  resultSchema,
  "gpt-3.5-turbo",
)



loop = Loop(
  input = Input(stateSchema),
  condition = isDone,
  body = Logic(
    'return {"done": llmresult, "law": previous["law"]}',
    stateSchema,
    llmresult = llmCall,
    previous = Input(stateSchema)
  )
)

graph = Logic("return state.done", resultSchema, state = loop)
print(graph)
