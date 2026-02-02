#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// Mock browser globals for dbconn.ts
global.window = {
  location: { search: "" }
};
global.localStorage = {
  getItem: (key) => {
    if (key === "db_preset") return process.env.SPACETIMEDB_PRESET || "local";
    if (key === "access_token") return process.env.SPACETIMEDB_TOKEN || null;
    return null;
  },
  setItem: () => {}
};
class MockElement {
  appendChild() {}
  setAttribute() {}
  addEventListener() {}
}

global.HTMLElement = MockElement;
global.document = {
  body: new MockElement(),
  createElement: () => new MockElement(),
  createTextNode: () => new MockElement()
};

// Enable .ts file loading
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      sourceMap: false,
      inlineSourceMap: false,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

// Import dbconn functions
const dbconnPath = path.join(__dirname, "..", "src", "dbconn.ts");
const { callProcedure, query_data, getNote, getId, addNote } = require(dbconnPath);

// Import for local function execution
const notesPath = path.join(__dirname, "..", "spacetimedb", "src", "notes.ts");
const { hashData, function_schema, isRef } = require(notesPath);

const openrouterPath = path.join(__dirname, "..", "spacetimedb", "src", "openrouter.ts");
const { openrouter } = require(openrouterPath);

const hashPath = path.join(__dirname, "..", "spacetimedb", "src", "hash.ts");
const { hash128 } = require(hashPath);

const [,, command, ...args] = process.argv;

// Simulate callNote with builtins for local execution
async function callNote(fn, ...args) {
  const note = await getNote(fn);
  if (note.schemaHash != hashData(function_schema)) {
    throw new Error("can only call Function schema notes");
  }
  const data = note.data;

  const localBuiltins = {
    getNote,
    addNote,
    call: callNote,
    remote: async (ref, arg) => {
      const idOrHash = String(ref).replace(/^#/, "");
      const id = /^\d+$/.test(idOrHash) ? Number(idOrHash) : await getId(idOrHash);
      const argStr = arg !== undefined ? JSON.stringify(arg) : "null";
      const raw = await callProcedure("run_note_async", { id, arg: argStr });
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    openrouter: async (prompt, schema) => {
      if (isRef(schema)) {
        schema = (await getNote(schema)).data;
      }
      return openrouter(prompt, schema);
    },
    hash: hash128
  };

  const F = new Function(
    "args",
    ...Object.keys(localBuiltins),
    `return (async () => {${data.code}})()`
  );
  return F(args.length === 1 ? args[0] : args, ...Object.values(localBuiltins));
}

async function main() {
  try {
    switch (command) {
      case "add-note": {
        const [schemaHash, dataJson] = args;
        if (!schemaHash || !dataJson) {
          console.error("Usage: npm run db add-note <schemaHash> <dataJson>");
          process.exit(1);
        }
        const result = await callProcedure("add_note", { schemaHash, data: dataJson });
        try {
          const id = result ? JSON.parse(result) : "unknown";
          console.log(`Note added with ID: ${id}`);
        } catch {
          console.log(`Note added. Response: ${result}`);
        }
        break;
      }

      case "get-note": {
        const [ref] = args;
        if (!ref) {
          console.error("Usage: npm run db get-note <id|hash>");
          process.exit(1);
        }
        const note = await getNote(/^\d+$/.test(ref) ? Number(ref) : ref);
        console.log(JSON.stringify(note, null, 2));
        break;
      }

      case "remote": {
        const [ref, argJson] = args;
        if (!ref) {
          console.error("Usage: npm run db remote <id|hash> [argJson]");
          process.exit(1);
        }
        const isId = /^\d+$/.test(ref);
        const id = isId ? Number(ref) : await getId(ref);
        const arg = argJson || "null";
        const result = await callProcedure("run_note_async", { id, arg });
        const parsed = JSON.parse(result);
        console.log(JSON.stringify(parsed, null, 2));
        break;
      }

      case "sql": {
        const query = args.join(" ");
        if (!query) {
          console.error("Usage: npm run db sql <query>");
          process.exit(1);
        }
        const result = await query_data(query);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "run-local": {
        const [ref, argJson] = args;
        if (!ref) {
          console.error("Usage: npm run db run-local <id|hash> [argJson]");
          process.exit(1);
        }
        const noteRef = /^\d+$/.test(ref) ? Number(ref) : ref;
        const argsData = argJson ? JSON.parse(argJson) : {};
        const result = await callNote(noteRef, argsData);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Available commands: add-note, get-note, remote, sql, run-local");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message || error);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
