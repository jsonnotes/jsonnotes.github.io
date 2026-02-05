import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.ts";

const makeIo = () => {
  let out = "";
  let err = "";
  return {
    io: {
      stdout: (text: string) => { out += text; },
      stderr: (text: string) => { err += text; },
    },
    getOut: () => out,
    getErr: () => err,
  };
};

test("cli shows usage when no command", async () => {
  const { io, getErr } = makeIo();
  const code = await runCli(["node", "cli"], io);
  assert.equal(code, 1);
  assert.match(getErr(), /Usage:/);
});

test("cli errors on unknown command", async () => {
  const { io, getErr } = makeIo();
  const code = await runCli(["node", "cli", "nope"], io);
  assert.equal(code, 1);
  assert.match(getErr(), /Unknown command/);
});

test("cli requires add-note args", async () => {
  const { io, getErr } = makeIo();
  const code = await runCli(["node", "cli", "add-note", "abcd"], io);
  assert.equal(code, 1);
  assert.match(getErr(), /schemaHash and json are required/);
});
