from dataclasses import dataclass
import requests
import asyncio
import json

OPENROUTER_API_KEY = json.load(open("./.env.json"))["api_key"]

db_url = "https://maincloud.spacetimedb.com"
dbname = "lexxtract"
token : str = None

async def db_request(path: str, method: str, body: str = None):
  global token
  if not token: token = requests.post(f"{db_url}/v1/identity", json={}).json()["token"] 
  headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
  response = requests.request(method, f"{db_url}{path}", headers=headers, data=body)
  return response

@dataclass
class Table:
  names: list[str]
  rows: list[list[any]]
  def __repr__(self):
    cols = len(self.names)
    colw = 10
    res = f'TABLE[{cols}x{len(self.rows)}]\n' + '-' * ((colw + 1) * cols + 1) + '\n'
    for row in [self.names] + self.rows[:10]:
      res += '|' + '|'.join(map(lambda x: str(x).replace('\n', '')[:colw].ljust(colw), row)) + '|\n'
    return res

def query_data(sql: str):
  data = asyncio.run(db_request(f"/v1/database/{dbname}/sql", "POST", body = sql.encode("utf-8"))).json()
  names = list(map(lambda x: x['name']['some'], data[0]['schema']['elements']))
  rows = data[0]['rows']
  return Table(names, rows)

def insert_data(prompt: str, schema: str, response: str, provider: str, model:str):
  body = json.dumps({
    "prompt": prompt,
    "schema": schema,
    "response": response,
    "provider": provider,
    "model": model
  }).encode("utf-8")
  ret = asyncio.run(db_request(f"/v1/database/{dbname}/call/add_call", "POST", body = body))
  if ret.status_code != 200:
    print("ERROR:", ret.text)
    return
  else:
    return

def model_query(prompt: str, schema: str, model: str, parameters: dict = None):
  response = requests.post(
    url = "https://openrouter.ai/api/v1/chat/completions",
    headers = {
      "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    },
    data = json.dumps({
      "model": model,
      "messages": [{"role" : "user","content" : prompt }],
      "response_format": {"type": "json_schema", "json_schema": {"name": "response", "schema": schema}},
      **(parameters or {})
    })
  ).json()
  resp = response
  return resp['choices'][0]['message']['content']


def query(prompt: str, schema: dict, model = "python", provider = "python"):
  cached = query_data(f"select * from llm_result where prompt = '{prompt}' and schema = '{json.dumps(schema)}' and model = '{model}' and provider = '{provider}'")
  if cached.rows:
    return cached.rows[0][3]
  else:
    response = model_query(prompt, schema, model, provider)
    insert_data(prompt, json.dumps(schema), response, provider, model)
    return response

mini_schema = {
  "type": "object",
  "properties": {
    "contentr": { "type": "string" }
  },
  "required": ["content"],
  "additionalProperties": False
}

def main():

  res = query("give example data for alice and bob", mini_schema, "openai/gpt-4o", "openai")
  print(res)


if __name__ == "__main__":
  main()


