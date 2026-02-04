#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// Mock browser globals
global.window = { location: { search: "" } };
global.localStorage = {
  getItem: (k) => k === "db_preset" ? (process.env.SPACETIMEDB_PRESET || "local") : null,
  setItem: () => {}
};
global.HTMLElement = class {};
global.document = { body: {}, createElement: () => ({}), createTextNode: () => ({}) };

require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const { callProcedure, query_data, getNote, getId, addNote } = require("../src/dbconn.ts");
const { callNote } = require("../src/call_note.ts");

const [,, cmd, ...args] = process.argv;

const { execSync, spawn } = require("child_process");

const commands = {
  "add-note": async ([schemaHash, data]) => {
    const result = await callProcedure("add_note", { schemaHash, data });
    console.log(`Note added with ID: ${JSON.parse(result)}`);
  },
  "new": async ([schemaRef]) => {
    if (!schemaRef) return console.error("Usage: npm run db new <schemaId|schemaHash>");
    let schemaHash = schemaRef;
    if (/^\d+$/.test(schemaRef)) {
      const res = await query_data(`select hash from note where id = ${schemaRef}`);
      schemaHash = res.rows[0]?.[0];
      if (!schemaHash) return console.error(`Schema ${schemaRef} not found`);
    }
    const dir = path.join(process.cwd(), "notes-backup");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = path.join(dir, `_new_${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ schemaHash, data: {} }, null, 2));
    const codeBin = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
    spawn(codeBin, ["--wait", tmpFile], { stdio: "inherit" }).on("close", async () => {
      try {
        const content = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
        const dataStr = typeof content.data === "string" ? content.data : JSON.stringify(content.data);
        const result = await callProcedure("add_note", { schemaHash: content.schemaHash, data: dataStr });
        console.log(`Note added with ID: ${JSON.parse(result)}`);
        fs.unlinkSync(tmpFile);
      } catch (e) {
        console.error("Error:", e.message);
      }
      process.exit(0);
    });
  },
  "get-note": async ([ref]) => {
    console.log(JSON.stringify(await getNote(/^\d+$/.test(ref) ? Number(ref) : ref), null, 2));
  },
  "remote": async ([ref, arg = "null"]) => {
    const id = /^\d+$/.test(ref) ? Number(ref) : await getId(ref);
    const result = await callProcedure("run_note_async", { id, arg });
    console.log(JSON.stringify(JSON.parse(result), null, 2));
  },
  "sql": async (args) => {
    console.log(JSON.stringify(await query_data(args.join(" ")), null, 2));
  },
  "run-local": async ([ref, argJson]) => {
    const noteRef = /^\d+$/.test(ref) ? Number(ref) : ref;
    const result = await callNote(noteRef, argJson ? JSON.parse(argJson) : {});
    console.log(JSON.stringify(result, null, 2));
  },
  "pull": async ([folder = "notes-backup"]) => {
    const dir = path.join(process.cwd(), folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { rows } = await query_data("select count from note_count");
    const count = rows[0]?.[0] || 0;
    const notes = await query_data(`select id, hash, schemaId, data from note where id < ${count + 1}`);
    notes.rows.forEach(([id, hash, schemaId, data]) =>
      fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ id, hash, schemaId, data }, null, 2))
    );
    console.log(`Pulled ${notes.rows.length} notes to ${folder}/`);
  },
  "push": async ([folder = "notes-backup"]) => {
    const dir = path.join(process.cwd(), folder);
    if (!fs.existsSync(dir)) return console.error(`Folder not found: ${folder}`);
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    let pushed = 0, skipped = 0;
    for (const file of files) {
      const note = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const schemaRes = await query_data(`select hash from note where id = ${note.schemaId}`);
      const schemaHash = schemaRes.rows[0]?.[0];
      if (!schemaHash) { console.log(`Skip ${file}: schema not found`); skipped++; continue; }
      try {
        await callProcedure("add_note", { schemaHash, data: typeof note.data === "string" ? note.data : JSON.stringify(note.data) });
        pushed++;
      } catch (e) { console.log(`Skip ${file}: ${e.message}`); skipped++; }
    }
    console.log(`Pushed ${pushed}, skipped ${skipped}`);
  }
};

(async () => {
  if (!commands[cmd]) {
    console.error(`Commands: ${Object.keys(commands).join(", ")}`);
    process.exit(1);
  }
  if (cmd === "new") return commands[cmd](args);
  try {
    await commands[cmd](args);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message || e);
    process.exit(1);
  }
})();
