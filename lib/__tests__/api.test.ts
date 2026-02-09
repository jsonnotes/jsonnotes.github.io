import { it } from "node:test";
import { createApi } from "../src/api.ts";
import { server } from "../src/cli.ts";
import { function_schema, hashData, NoteData, top } from "@jsonview/core";
import type { Jsonable } from "@jsonview/core";

const assert = (t:boolean, message?: string)=> {if (!t) throw new Error(message || "Assertion failed");}
const assertEq = <T extends Jsonable> (a:T, b:T) =>{ let [x,y] = [a,b].map(x=>JSON.stringify(x)); assert(x == y, `${x} != ${y}`);}
const api = createApi({server})

it("API: get top", async () => {
  const result = await api.getNote(hashData(top));
  assertEq(result, top)
})

it("API: insertNote", async ()=>{
  const note = NoteData("insert test", top, {content: "this is a test"})
  const result = await api.addNote(note.schemaHash, note.data)
  assertEq(result, hashData(note))
})


it("API: getNote", async () => {
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


const testfn2 = NoteData("call test", function_schema, {
  title: "test function",
  args: {},
  code: "return [1,2,3]",
  returnSchema: {type: "array", items: {type: "number"}}
})

it("API: callNote", async () => {

  await api.addNote(testfn.schemaHash, testfn.data)
  const res = await api.callNote(hashData(testfn), {x: "world"})
  assertEq(res, "hello world")
})


it ("API: callnote2", async ()=>{
  await api.addNote(testfn2.schemaHash, testfn2.data)
  const res = await api.callNote(hashData(testfn2), {})
  assertEq(res, [1,2,3])
})


it("API: callNoteLocal", async () => {
  await api.addNote(testfn.schemaHash, testfn.data)
  const res = await api.callNoteLocal(hashData(testfn), {x: "world"})
  assertEq(res, "hello world")
})



it("API: nested call", async ()=>{
  await api.addNote(testfn.schemaHash, testfn.data)

  let caller = NoteData("caller", function_schema, {
    args: {},
    code: `return call('#${hashData(testfn)}', '{"x": "world2"}')`,
    returnSchema: {type: "string"},
  })

  await api.addNote(caller.schemaHash, caller.data)
  let res = await api.callNote(hashData(caller), {})

  assertEq(res, "hello world2")

})
