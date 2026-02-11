#!/usr/bin/env python3

json = __import__("json")
urllib_request = __import__("urllib.request", fromlist=["request"])
urllib_error = __import__("urllib.error", fromlist=["error"])
sys = __import__("sys")
pathlib = __import__("pathlib")
importlib_util = __import__("importlib.util", fromlist=["util"])


SERVER = "https://maincloud.spacetimedb.com"
DBNAME = "jsonview"
TOKEN = None
GRAPH_SCHEMA_HASH = None

SCHEMA_STRING = {"type": "string"}
SCHEMA_NUMBER = {"type": "number"}

def schemaArray(items):
  return {"type": "array", "items": items}

def schemaObject(properties, required=None):
  req = required if required is not None else list(properties.keys())
  return {"type": "object", "properties": properties, "required": req}

def _http_request(url, method="GET", body=None, token=None):
  data = body.encode("utf-8") if isinstance(body, str) else None
  headers = {"Content-Type": "application/json"}
  if token:
    headers["Authorization"] = "Bearer " + token

  req = urllib_request.Request(url=url, data=data, headers=headers, method=method)
  try:
    with urllib_request.urlopen(req) as res:
      return res.getcode(), res.read().decode("utf-8")
  except urllib_error.HTTPError as e:
    return e.code, e.read().decode("utf-8")


def fetchIdentityToken():
  code, text = _http_request(SERVER.rstrip("/") + "/v1/identity", method="POST", body="")
  if code < 200 or code >= 300:
    raise RuntimeError("identity request failed (" + str(code) + "): " + text)
  payload = json.loads(text)
  token = payload.get("token")
  if not token:
    raise RuntimeError("identity response missing token: " + text)
  return token


def setToken(token):
  global TOKEN
  TOKEN = token
  return TOKEN

def setGraphSchemaHash(schemaHash):
  global GRAPH_SCHEMA_HASH
  GRAPH_SCHEMA_HASH = schemaHash
  return GRAPH_SCHEMA_HASH


def addNote(schemaHash, data):
  global TOKEN

  parsed = data
  if isinstance(data, str):
    try:
      parsed = json.loads(data)
    except Exception:
      parsed = data
  try:
    json.dumps(parsed)
  except Exception as e:
    raise RuntimeError("data is not JSON-serializable: " + str(e))

  if not TOKEN:
    TOKEN = fetchIdentityToken()

  payload = json.dumps({
    "schemaHash": schemaHash,
    "data": json.dumps(parsed),
  })

  url = SERVER.rstrip("/") + "/v1/database/" + DBNAME + "/call/add_note"
  code, text = _http_request(url, method="POST", body=payload, token=TOKEN)
  if code < 200 or code >= 300:
      raise RuntimeError("add_note failed (" + str(code) + "): " + text)
  return text

def pipelineInput(outputSchema):
  return {
    "$": "input",
    "outputSchema": outputSchema,
  }

def pipelineLogic(inputs, code, outputSchema):
  return {
    "$": "logic",
    "inputs": inputs,
    "code": code,
    "outputSchema": outputSchema,
  }

def pipelineLlmCall(prompt, outputSchema):
  return {
    "$": "llm_call",
    "prompt": prompt,
    "outputSchema": outputSchema,
  }

def pipelineLoop(inputGraph, condition, body, outputSchema):
  return {
    "$": "loop",
    "input": inputGraph,
    "condition": condition,
    "body": body,
    "outputSchema": outputSchema,
  }

def addPipeline(graph, schemaHash=None):
  useSchemaHash = schemaHash if schemaHash is not None else GRAPH_SCHEMA_HASH
  if not useSchemaHash:
    raise RuntimeError("graph schema hash missing: set GRAPH_SCHEMA_HASH or pass schemaHash to addPipeline")
  return addNote(useSchemaHash, graph)

def importClassifier(lexxtractSrcPath):
  src = pathlib.Path(lexxtractSrcPath).expanduser().resolve()
  if not src.exists():
    raise RuntimeError("lexxtract src path not found: " + str(src))

  candidateFiles = [
    src / "classifier.py",
    src / "classification.py",
    src / "classify.py",
  ]
  modulePath = None
  for f in candidateFiles:
    if f.exists():
      modulePath = f
      break

  if modulePath is None:
    raise RuntimeError("no classifier module found in " + str(src) + " (looked for classifier.py/classification.py/classify.py)")

  spec = importlib_util.spec_from_file_location("lexxtract_classifier", str(modulePath))
  if spec is None or spec.loader is None:
    raise RuntimeError("failed to build import spec for " + str(modulePath))
  module = importlib_util.module_from_spec(spec)
  sys.modules["lexxtract_classifier"] = module
  spec.loader.exec_module(module)
  return module

def printClassifierInfo(lexxtractSrcPath):
  mod = importClassifier(lexxtractSrcPath)
  publicNames = [n for n in dir(mod) if not n.startswith("_")]
  print("classifier module:", getattr(mod, "__file__", "<unknown>"))
  print("public symbols:", len(publicNames))
  print("sample:", ", ".join(publicNames[:10]))
  if hasattr(mod, "Classifier"):
    print("Classifier type:", str(type(getattr(mod, "Classifier"))))
  return mod
