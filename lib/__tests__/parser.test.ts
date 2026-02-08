
import { it } from "node:test";
import { type Jsonable } from "@jsonview/core";
import { runWithFuel, runWithFuelAsync, parse, validateScopes, validateNoPrototype } from "@jsonview/core/parser";

const assert = (t: boolean, msg?: string) => { if (!t) throw new Error(msg || "Assertion failed") }

const testRun = (code: string, args: {fuel?: number, result? : Jsonable, shouldError?: true, env?: Record<string, unknown>} = {}) =>{
  try{
    let res = runWithFuel(code, args.fuel || 1000, args.env)
    if ("err" in res) throw new Error (res.err)
    let {ok} = res
    if (args.shouldError) throw new Error(`Expected error: ${code}`);
    if (args.result == undefined) args.result = (Function(code))()
    let [a,b] = [args.result!, ok].map(x=>JSON.stringify(x))
    if (a != b) throw new Error(`${a} != ${b}`)
  }catch(e){
    if (!args.shouldError) throw e;
  }
}

it ("runs JS", ()=>{
  testRun("return 1+1", {result: 2})
  testRun("return [][0].e", {shouldError: true})
  testRun("while(true){}", {shouldError: true, fuel:100})
  testRun("while(true){return 0}")
})

it("arithmetic", () => {
  testRun("return 10 - 4", {result: 6})
  testRun("return 3 * 7", {result: 21})
  testRun("return 15 / 3", {result: 5})
  testRun("return 7 % 3", {result: 1})
  testRun("return -5", {result: -5})
})

it("strings", () => {
  testRun('return "hello"', {result: "hello"})
  testRun("return 'world'", {result: "world"})
  testRun('return "a" + "b"', {result: "ab"})
})

it("booleans and comparisons", () => {
  testRun("return true", {result: true})
  testRun("return false", {result: false})
  testRun("return 3 > 2", {result: true})
  testRun("return 1 === 1", {result: true})
  testRun("return 1 !== '1'", {result: true})
  testRun("return !true", {result: false})
  testRun("return true && false", {result: false})
  testRun("return false || true", {result: true})
})

it("ternary", () => {
  testRun("return true ? 1 : 2", {result: 1})
  testRun("return false ? 1 : 2", {result: 2})
})

it("variables and assignment", () => {
  testRun("let x = 5; return x", {result: 5})
  testRun("const y = 10; return y", {result: 10})
  testRun("let x = 5; x += 3; return x", {result: 8})
  testRun("let x = 10; x -= 4; return x", {result: 6})
  testRun("let x = 3; x *= 2; return x", {result: 6})
})

it("destructuring", () => {
  testRun("let [a, b] = [1, 2]; return a + b", {result: 3})
  testRun("let {x, y} = {x: 10, y: 20}; return x + y", {result: 30})
})

it("if/else", () => {
  testRun("if (true) return 1; return 2", {result: 1})
  testRun("if (false) return 1; else return 2", {result: 2})
  testRun("let x = 0; if (true) { x = 1 } else { x = 2 } return x", {result: 1})
})

it("while loop", () => {
  testRun("let i = 0; while (i < 5) { i++ } return i", {result: 5})
})

it("for loop", () => {
  testRun("let s = 0; for (let i = 0; i < 5; i++) { s += i } return s", {result: 10})
})

it("for-of", () => {
  testRun("let s = 0; for (let x of [1, 2, 3]) { s += x } return s", {result: 6})
})

it("for-in", () => {
  testRun("let k = []; for (let x in {a: 1, b: 2}) { k.push(x) } return k", {result: ["a", "b"]})
})

it("break and continue", () => {
  testRun("let i = 0; while (true) { i++; if (i == 3) break } return i", {result: 3})
  testRun("let s = 0; for (let i = 0; i < 5; i++) { if (i == 2) continue; s += i } return s", {result: 8})
})

it("arrow functions", () => {
  testRun("const add = (a, b) => a + b; return add(2, 3)", {result: 5})
  testRun("const inc = x => x + 1; return inc(4)", {result: 5})
  testRun("const f = () => { return 42 }; return f()", {result: 42})
})

it("closures", () => {
  testRun("let x = 10; const f = () => x; return f()", {result: 10})
})

it("arrays", () => {
  testRun("return [1, 2, 3]", {result: [1, 2, 3]})
  testRun("let a = [1, 2]; return a[0]", {result: 1})
  testRun("let a = [1, 2, 3]; return a.length", {result: 3})
  testRun("return [1, 2, 3].map(x => x * 2)", {result: [2, 4, 6]})
  testRun("return [1, 2, 3].filter(x => x > 1)", {result: [2, 3]})
})

it("objects", () => {
  testRun("return {a: 1, b: 2}", {result: {a: 1, b: 2}})
  testRun("let o = {x: 5}; return o.x", {result: 5})
  testRun("let o = {x: 5}; return o['x']", {shouldError: true})
  testRun("let x = 1; let y = 2; return {x, y}", {result: {x: 1, y: 2}})
})

it("method calls", () => {
  testRun('return "hello".toUpperCase()', {result: "HELLO"})
  testRun('return "a,b,c".split(",")', {result: ["a", "b", "c"]})
})

it("env injection", () => {
  testRun("return x + y", {result: 7, env: {x: 3, y: 4}})
  testRun("return greet('world')", {result: "hi world", env: {greet: (s: string) => `hi ${s}`}})
})

it("comments", () => {
  testRun("// comment\nreturn 42", {result: 42})
  testRun("/* block */ return 42", {result: 42})
})

it("prefix/postfix", () => {
  testRun("let x = 5; return ++x", {result: 6})
  testRun("let x = 5; x++; return x", {result: 6})
})

it("fuel exhaustion", () => {
  let res = runWithFuel("while (true) {}", 100)
  if ("ok" in res) throw new Error ("while true ok")
  assert(res.err.includes("fuel"), `expected fuel error: ${res.err}`)
})

it("fuel consumed", () => {
  let res = runWithFuel("for (let i = 0; i < 10; i++) {}", 10000)
  assert("ok" in res, "should succeed")
  assert(res.fuel < 10000, "fuel should decrease")
})

it("scope: rejects undeclared", () => {
  let errs = validateScopes(parse("return foo"))
  assert(errs.length > 0 && errs[0].includes("foo"))
})

it("scope: allows declared", () => {
  let errs = validateScopes(parse("let x = 1; return x"))
  assert(errs.length === 0, `unexpected errors: ${errs}`)
})

it("scope: allows globals", () => {
  let errs = validateScopes(parse("return foo"), ["foo"])
  assert(errs.length === 0)
})

it("prototype: rejected", () => {
  assert(validateNoPrototype(parse("x.prototype")).length > 0)
})

it("bracket indexing: only numeric literals", () => {

  testRun("{a:22}[\"a\"]", {shouldError: true})
})



it("async: returns promise result", async () => {
  let res = await runWithFuelAsync("return f()", 1000, {f: () => Promise.resolve(99)})
  assert("ok" in res, `expected ok, got: ${"err" in res ? res.err : ""}`)
  assert((res as any).ok === 99, `expected 99, got: ${(res as any).ok}`)
})

it("async: env with sync functions", async () => {
  let res = await runWithFuelAsync("return add(3, 4)", 1000, {add: (a: number, b: number) => a + b})
  assert("ok" in res && (res as any).ok === 7)
})

