#!/usr/bin/env node

const DBNAME = "jsonview";
const LOCAL_URL = "http://localhost:3000";
const PROD_URL = "https://maincloud.spacetimedb.com";

const req = (baseUrl, path, method, body = null) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });

const sql = async (baseUrl, query) => {
  const res = await req(baseUrl, `/v1/database/${DBNAME}/sql`, "POST", query);
  const text = await res.text();
  const data = JSON.parse(text);
  const { schema, rows } = data[0];
  const names = schema.elements.map((e) => e.name.some);
  return rows.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])));
};

const addNote = async (baseUrl, schemaHash, data) => {
  const res = await req(baseUrl, `/v1/database/${DBNAME}/call/add_note`, "POST", JSON.stringify({ schemaHash, data }));
  if (!res.ok) throw new Error(await res.text());
  return res.text();
};

async function main() {
  console.log("Fetching all notes from local DB...");
  const notes = await sql(LOCAL_URL, "SELECT * FROM note");
  notes.sort((a, b) => a.id - b.id);
  console.log(`Found ${notes.length} notes`);

  // Build id -> hash map for schema lookup
  const idToHash = new Map();
  for (const note of notes) {
    idToHash.set(note.id, note.hash);
  }

  console.log("\nMigrating to prod...");
  let success = 0, skipped = 0, failed = 0;

  for (const note of notes) {
    // schemaId 0 means this is a schema note, use "0" as schemaHash
    const schemaHash = note.schemaId === 0 ? "0" : idToHash.get(note.schemaId);
    if (!schemaHash && note.schemaId !== 0) {
      console.error(`  #${note.id}: schema ${note.schemaId} not found, skipping`);
      skipped++;
      continue;
    }

    try {
      await addNote(PROD_URL, schemaHash, note.data);
      console.log(`  #${note.id} (${note.hash.slice(0, 8)}...): OK`);
      success++;
    } catch (e) {
      // Likely duplicate hash - that's fine
      if (e.message.includes("already exists") || e.message.includes("duplicate")) {
        console.log(`  #${note.id}: already exists`);
        skipped++;
      } else {
        console.error(`  #${note.id}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\nDone: ${success} added, ${skipped} skipped, ${failed} failed`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
