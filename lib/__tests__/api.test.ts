

import { createApi } from "../src/api.ts";
import { server } from "../src/cli.ts";
import { function_schema, hashData, Jsonable, NoteData, top } from "@jsonview/core";



const assert = (t:boolean, message?: string)=> {if (!t) throw new Error(message || "Assertion failed");}

const assertEq = <T extends Jsonable> (a:T, b:T) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`)

const api = createApi({server})


const test = async (name: string, fn: () => void | Promise<void>) =>{

  try{
    await fn ()
  }catch (e) {
    console.error(`Test "${name}" failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

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

test("API: callNote", async () => {
  const note = NoteData("call test", function_schema, {
    title: "test function",
    args: {x: {type: "string"}},
    code: "return \"hello \" + x",
    returnSchema: {type: "string"}
  })

  await api.addNote(note.schemaHash, note.data)
  const res = await api.callNote(hashData(note), {x: "world"})
  assertEq(res, "hello world")
})
