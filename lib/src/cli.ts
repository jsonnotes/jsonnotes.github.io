#!/usr/bin/env node
import { createApi } from "./api";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const usage = () =>
  [
    "Usage:",
    "  npm run sql -- <query>",
    "  npm run get-note -- <hash>",
    "  npm run add-note -- <schemaHash> '<json>'",
    "",
    "Env:",
    "  SPACETIMEDB_HOST (default: http://localhost:3000)",
    "  SPACETIMEDB_NAME (default: jsonview)",
    "  SPACETIMEDB_ACCESS_TOKEN (optional)",
  ].join("\n");

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export const runCli = async (argv: string[], io: CliIo = defaultIo): Promise<number> => {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    io.stderr(usage() + "\n");
    return 1;
  }

  const baseUrl = process.env.SPACETIMEDB_HOST || "http://localhost:3000";
  const dbName = process.env.SPACETIMEDB_NAME || "jsonview";
  const accessToken = process.env.SPACETIMEDB_ACCESS_TOKEN || null;
  const api = createApi({ baseUrl, dbName, accessToken });

  try {
    if (cmd === "sql") {
      const query = args.join(" ").trim();
      if (!query) throw new Error("SQL query is required");
      const res = await api.sql(query);
      io.stdout(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    if (cmd === "get-note") {
      const hash = args[0];
      if (!hash) throw new Error("hash is required");
      const note = await api.getNote(hash);
      io.stdout(JSON.stringify(note, null, 2) + "\n");
      return 0;
    }

    if (cmd === "add-note") {
      const schemaHash = args[0];
      const raw = args[1];
      if (!schemaHash || raw == null) throw new Error("schemaHash and json are required");
      const data = JSON.parse(raw);
      const hash = await api.addNote(schemaHash, data);
      io.stdout(String(hash) + "\n");
      return 0;
    }

    io.stderr(`Unknown command: ${cmd}\n`);
    io.stderr(usage() + "\n");
    return 1;
  } catch (err: any) {
    io.stderr(String(err?.message || err) + "\n");
    return 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv).then((code) => process.exit(code));
}
