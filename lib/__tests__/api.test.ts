

import { it } from "node:test";
import { createApi } from "../src/api.ts";
import { server } from "../src/cli.ts";
import { function_schema, hashData, NoteData, top } from "@jsonview/core";
import type { Jsonable } from "@jsonview/core";

const assert = (t:boolean, message?: string)=> {if (!t) throw new Error(message || "Assertion failed");}

const assertEq = <T extends Jsonable> (a:T, b:T) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`)

const api = createApi({server})

const test = it

test("API: get top", async () => {
  const result = await api.getNote(hashData(top));
  assertEq(result, top)
})

test("API: insertNote", async ()=>{
  const note = NoteData("insert test", top, {content: "this is a test"})
  const result = await api.addNote(note.schemaHash, note.data)
  assertEq(result, hashData(note))
})


test("API: getNote", async () => {
  const note = NoteData("get test", top, {content: "this is a test"});
  const result = await api.addNote(note.schemaHash, note.data);
  const getResult = await api.getNote(result);
  assertEq(getResult, note);
})

const testfn = NoteData("call test", function_schema, {
  title: "test function",
  args: {x: {type: "string"}},
  code: "return \"hello \" + x",
  returnSchema: {type: "string"}
})

test("API: callNote", async () => {

  await api.addNote(testfn.schemaHash, testfn.data)
  const res = await api.callNote(hashData(testfn), {x: "world"})
  assertEq(res, "hello world")
})


test("API: nested call", async ()=>{
  await api.addNote(testfn.schemaHash, testfn.data)

  let caller = NoteData("caller", function_schema, {
    args: {},
    code: `return call(${hashData(testfn)}, '{x: "world2"}')`,
    returnSchema: {type: "string"},
  })

  await api.addNote(caller.schemaHash, caller.data)
  let res = await api.callNote(hashData(caller), {})

  assertEq(res, "hello world2")

})
