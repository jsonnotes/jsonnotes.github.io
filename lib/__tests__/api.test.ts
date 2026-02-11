import { it } from "node:test";
import { addNote, callNote, callNoteLocal, getNote, searchNotes } from "../src/dbconn.ts";
import { noteSearch } from "../src/index.ts";
import { function_schema, hashData, NoteData, top } from "@jsonview/core";
import { graph_schema } from "../src/example/pipeline.ts";
import type { Jsonable } from "@jsonview/core";

const assert = (t:boolean, message?: string)=> {if (!t) throw new Error(message || "Assertion failed");}
const assertEq = <T extends Jsonable> (a:T, b:T) =>{ let [x,y] = [a,b].map(x=>JSON.stringify(x)); assert(x == y, `${x} != ${y}`);}


it("API: get top", async () => {
  const result = await getNote(hashData(top));
  assertEq(result, top)
})

it("API: insertNote", async ()=>{
  const note = NoteData("insert test", top, {content: "this is a test"})
  const result = await addNote(note.schemaHash, note.data)
  assertEq(result, hashData(note))
})


it("API: getNote", async () => {
  const note = NoteData("get test", top, {content: "this is a test"});
  const result = await addNote(note.schemaHash, note.data);
  const getResult = await getNote(result);
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

  await addNote(testfn.schemaHash, testfn.data)
  const res = await callNote(hashData(testfn), {x: "world"})
  assertEq(res, "hello world")
})


it ("API: callnote2", async ()=>{
  await addNote(testfn2.schemaHash, testfn2.data)
  const res = await callNote(hashData(testfn2), {})
  assertEq(res, [1,2,3])
})


it("API: callNoteLocal", async () => {
  await addNote(testfn.schemaHash, testfn.data)
  const res = await callNoteLocal(hashData(testfn), {x: "world"})
  assertEq(res, "hello world")
})



it("API: nested call", async ()=>{
  await addNote(testfn.schemaHash, testfn.data)

  let caller = NoteData("caller", function_schema, {
    args: {},
    code: `return call('#${hashData(testfn)}', '{"x": "world2"}')`,
    returnSchema: {type: "string"},
  })

  await addNote(caller.schemaHash, caller.data)
  let res = await callNote(hashData(caller), {})

  assertEq(res, "hello world2")
})

it("API: search", async () => {
  let calls = 0
  const results = await new Promise<any[]>(resolve => {
    const search = noteSearch((res) => { if (++calls === 2) resolve(res) })
    search("test")
  })
  assert(Array.isArray(results), "search should return array")
  assert(results.length > 0, "search should find results")
  assert(results[0].title.startsWith("test"), "result title should match query")
  assert(typeof results[0].hash === "string", "result should have hash")

  await addNote(hashData(top), {type: "string"})
  

})

it("API: search by hash", async () => {
  const hash = hashData(testfn)
  let calls = 0
  const results = await new Promise<any[]>(resolve => {
    const search = noteSearch((res) => { if (++calls === 2) resolve(res) })
    search(hash)
  })
  assert(results.length === 1, "hash search should find exactly one result")
  assertEq(results[0].hash, hash)
})

it("API: search by #hash", async () => {
  const hash = hashData(testfn)
  let calls = 0
  const results = await new Promise<any[]>(resolve => {
    const search = noteSearch((res) => { if (++calls === 2) resolve(res) })
    search("#" + hash)
  })
  assert(results.length === 1, "#hash search should find exactly one result")
  assertEq(results[0].hash, hash)
})

it("API: searchNotes empty query", async () => {
  const results = await searchNotes("")
  assert(Array.isArray(results), "should return array")
  assert(results.length > 0, "empty query should return results")
  results.forEach(r => {
    assert(typeof r.title === "string", "result should have title")
    assert(typeof r.hash === "string" && r.hash.length === 32, "result should have 32-char hash")
    assert(typeof r.count === "number", "result should have count")
  })
})

it("API: searchNotes by title prefix", async () => {
  const results = await searchNotes("test")
  assert(results.length > 0, "should find notes with title prefix 'test'")
  results.forEach(r => assert(r.title.startsWith("test"), `title '${r.title}' should start with 'test'`))
})

it("API: searchNotes returns title and hash for preview", async () => {
  const hash = hashData(testfn)
  const results = await searchNotes("test function")
  const match = results.find(r => r.hash === hash)
  assert(!!match, "should find the test function note")
  assertEq(match!.title, "test function")
})

it("API: insert graph note with referenced input", async () => {
  // Ensure graph schema note exists before inserting notes that use it.
  await addNote(graph_schema);
  const graphSchemaHash = hashData(graph_schema);

  const inputNode = {
    $: "input",
    outputSchema: { type: "string" },
  };

  const inputHash = await addNote(graphSchemaHash, inputNode);

  

  const graphNote = {
    $: "llm_call",
    prompt: {
      $: "logic",
      code: "return `extract a list of important names from this text: ${data}`",
      inputs: {
        data: `#${inputHash}`,
      },
      outputSchema: {
        type: "string",
      },
    },
    outputSchema: {
      type: "array",
      items: {
        type: "string",
      },
    },
  };

  const hash = await addNote(graphSchemaHash, graphNote);
  const saved = await getNote(hash);
  assertEq(saved.schemaHash, graphSchemaHash);
  assertEq(saved.data as Jsonable, graphNote as Jsonable);
})
