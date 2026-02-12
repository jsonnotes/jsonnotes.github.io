
import { it } from "node:test";
import { type Jsonable } from "@jsonview/core";
import { runWithFuel, runWithFuelAsync, parse, validateScopes, validateNoPrototype, assertSafeIdent, renderWithFuel } from "@jsonview/core/parser";

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
  testRun("return typeof 3", {result: "number"})
  testRun("return typeof 'x'", {result: "string"})
  testRun("return typeof {a: 1}", {result: "object"})
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
  testRun("let {x: a, y: b} = {x: 10, y: 20}; return a + b", {result: 30})
  testRun("let {a: {b}} = {a: {b: 7}}; return b", {result: 7})
  testRun("const sum = ({x, y}) => x + y; return sum({x: 2, y: 3})", {result: 5})
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
  testRun("const f = (...xs) => xs.length; return f(1, 2, 3)", {result: 3})
  testRun("const add3 = (a, b, c) => a + b + c; return add3(...[1, 2], 3)", {result: 6})
  testRun("let async = 2; return async + 1", {result: 3})
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
  testRun("return [...[1, 2], 3]", {result: [1, 2, 3]})
  testRun("let [x, ...rest] = [1, 2, 3]; return [x, rest]", {result: [1, [2, 3]]})
})

it("objects", () => {
  testRun("return {a: 1, b: 2}", {result: {a: 1, b: 2}})
  testRun("let o = {x: 5}; return o.x", {result: 5})
  testRun("let o = {x: 5}; return o['x']", {shouldError: true})
  testRun("let o = {x: 5}; return o.constructor", {shouldError: true})
  testRun("let o = {x: 5}; return o.__proto__", {shouldError: true})
  testRun("let x = 1; let y = 2; return {x, y}", {result: {x: 1, y: 2}})
  testRun("return {a: 1, ...{b: 2}}", {result: {a: 1, b: 2}})
  testRun("let {a, ...rest} = {a: 1, b: 2, c: 3}; return [a, rest]", {result: [1, {b: 2, c: 3}]})
  testRun("return Object.keys({a: 1, b: 2})", {result: ["a", "b"]})
  testRun("return Object.values({a: 1, b: 2})", {result: [1, 2]})
  testRun("return Object.entries({a: 1, b: 2})", {result: [["a", 1], ["b", 2]]})
})

it("method calls", () => {
  testRun('return "hello".toUpperCase()', {result: "HELLO"})
  testRun('return "a,b,c".split(",")', {result: ["a", "b", "c"]})
})

it("safe Function builtin", () => {
  testRun("const f = Function('x', 'return x + 1'); return f(2)", {result: 3})
  testRun("const mul = Function('a,b', 'return a * b'); return mul(3, 4)", {result: 12})
  testRun("const f = Function('...xs', 'return xs.length'); return f(1, 2, 3)", {result: 3})
  testRun("let y = 7; const f = Function('return y'); return f()", {shouldError: true})
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

it("safe Function shares fuel budget", () => {
  let res = runWithFuel("const f = Function('while (true) {}'); return f()", 100)
  assert("err" in res, "expected error")
  assert((res as any).err.includes("fuel"), `expected fuel error, got: ${(res as any).err}`)
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
  assert(validateNoPrototype(parse("x.constructor")).length > 0)
  assert(validateNoPrototype(parse("x.__proto__")).length > 0)
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

it("async: supports await syntax", async () => {
  let res = await runWithFuelAsync("return await f()", 1000, {f: () => Promise.resolve(99)})
  assert("ok" in res, `expected ok, got: ${"err" in res ? res.err : ""}`)
  assert((res as any).ok === 99, `expected 99, got: ${(res as any).ok}`)
})

it("async: supports async arrow functions", async () => {
  let res1 = await runWithFuelAsync("const f = async x => await Promise.resolve(x + 1); return await f(4)", 1000, {Promise})
  assert("ok" in res1, `expected ok, got: ${"err" in res1 ? res1.err : ""}`)
  assert((res1 as any).ok === 5, `expected 5, got: ${(res1 as any).ok}`)

  let res2 = await runWithFuelAsync("const f = async (a, b) => { return a + b }; return await f(2, 3)", 1000)
  assert("ok" in res2, `expected ok, got: ${"err" in res2 ? res2.err : ""}`)
  assert((res2 as any).ok === 5, `expected 5, got: ${(res2 as any).ok}`)
})

it("async: supports member access on awaited value", async () => {
  let res = await runWithFuelAsync(
    "let graph = (await getNote('#x')).data; return graph",
    1000,
    {getNote: async () => ({data: {ok: true}})},
  )
  assert("ok" in res, `expected ok, got: ${"err" in res ? res.err : ""}`)
  assert(JSON.stringify((res as any).ok) === JSON.stringify({ok: true}))
})

it("async: safe Object facade is available", async () => {
  let res = await runWithFuelAsync("return await Promise.resolve(Object.keys({a: 1}))", 1000)
  assert("ok" in res, `expected ok, got: ${"err" in res ? res.err : ""}`)
  assert((res as any).ok?.[0] === "a", `expected ['a'], got: ${JSON.stringify((res as any).ok)}`)
})

it("async: safe Function builtin supports await", async () => {
  let res = await runWithFuelAsync(
    "const f = Function('x', 'return await Promise.resolve(x + 1)'); return await f(4)",
    1000,
  )
  assert("ok" in res, `expected ok, got: ${"err" in res ? res.err : ""}`)
  assert((res as any).ok === 5, `expected 5, got: ${(res as any).ok}`)
})

it("sync runner: await syntax is rejected", () => {
  testRun("return await f()", { shouldError: true, env: {f: () => Promise.resolve(1)} })
})

// ---------------------------------------------------------------------------
// Security: sandbox escape prevention
// ---------------------------------------------------------------------------

it("security: can't access browser/node globals", () => {
  const globals = [
    "window", "document", "globalThis", "self",
    "eval", "setTimeout", "setInterval", "fetch",
    "localStorage", "sessionStorage",
    "process", "require",
  ]
  for (const g of globals) {
    const res = runWithFuel(`return ${g}`, 100)
    assert("err" in res, `${g} should be rejected, got: ${"ok" in res ? JSON.stringify(res.ok) : ""}`)
  }
})

it("security: 'this' is rejected (parsed as undeclared identifier)", () => {
  // 'this' is not a keyword in the parser, so it becomes an identifier and fails scope check
  const res = runWithFuel("return this", 100)
  assert("err" in res, "this should be rejected")
})

it("security: 'new' is a parse error", () => {
  const res = runWithFuel("return new Array()", 100)
  assert("err" in res, "'new' should cause a parse error")
})

it("security: 'class' is a parse error", () => {
  const res = runWithFuel("class Foo {}", 100)
  assert("err" in res, "'class' should cause a parse error")
})

it("security: 'function' declaration is a parse error", () => {
  const res = runWithFuel("function foo() {}", 100)
  assert("err" in res, "'function' declaration should cause a parse error")
})

it("security: try/catch/throw are parse errors", () => {
  assert("err" in runWithFuel("try { return 1 } catch(e) {}", 100), "try/catch should error")
  assert("err" in runWithFuel("throw 'error'", 100), "throw should error")
})

it("security: template literals / backticks rejected by tokenizer", () => {
  assert("err" in runWithFuel("`hello`", 100), "backticks should error")
  assert("err" in runWithFuel("let x = `${1}`", 100), "template literals should error")
})

it("security: import is rejected", () => {
  // Dynamic import() — 'import' is not a keyword, would be an identifier
  const res = runWithFuel("return import('fs')", 100)
  assert("err" in res, "import should be rejected")
})

// ---------------------------------------------------------------------------
// Security: prototype chain attacks
// ---------------------------------------------------------------------------

it("security: prototype chain attacks blocked", () => {
  assert("err" in runWithFuel("let x = {}; return x.constructor", 100), "x.constructor should be blocked")
  assert("err" in runWithFuel("let x = {}; return x.__proto__", 100), "x.__proto__ should be blocked")
  assert("err" in runWithFuel("let x = {}; return x.prototype", 100), "x.prototype should be blocked")
})

it("security: computed string access blocked (prevents x['constructor'])", () => {
  assert("err" in runWithFuel('let x = {}; return x["constructor"]', 100), 'x["constructor"] should be blocked')
  assert("err" in runWithFuel('return ({})["__proto__"]', 100), '({})["__proto__"] should be blocked')
})

it("security: can't reach Function via prototype chain", () => {
  // [].filter.constructor would give Function — but .constructor is blocked
  assert("err" in runWithFuel("return [].filter.constructor", 100), "filter.constructor should be blocked")
})

// ---------------------------------------------------------------------------
// Security: fuel exhaustion
// ---------------------------------------------------------------------------

it("security: while(true) exhausts fuel", () => {
  const res = runWithFuel("while(true){}", 100)
  assert("err" in res, "should exhaust fuel")
  assert(res.err.includes("fuel"), `expected fuel error: ${res.err}`)
})

it("security: nested function calls share fuel", () => {
  const res = runWithFuel("const f = Function('while (true) {}'); return f()", 100)
  assert("err" in res, "nested while(true) should exhaust shared fuel")
  assert(res.err.includes("fuel"), `expected fuel error: ${res.err}`)
})

it("security: recursive arrow functions exhaust fuel", () => {
  const res = runWithFuel("const f = (n) => f(n + 1); return f(0)", 200)
  assert("err" in res, "recursive arrows should exhaust fuel")
  assert(res.err.includes("fuel"), `expected fuel error: ${res.err}`)
})

it("security: deeply nested expressions exhaust fuel", () => {
  // Build a deeply nested expression: ((((1+1)+1)+1)+...)
  let code = "let x = 0; "
  for (let i = 0; i < 200; i++) code += "x = x + 1; "
  code += "return x"
  const res = runWithFuel(code, 50)
  assert("err" in res, "deep expression chain should exhaust fuel")
})

// ---------------------------------------------------------------------------
// Security: scope isolation
// ---------------------------------------------------------------------------

it("security: undeclared variables rejected", () => {
  const errs = validateScopes(parse("return foo"))
  assert(errs.length > 0, "undeclared 'foo' should be rejected")
  assert(errs[0].includes("foo"), `error should mention 'foo': ${errs[0]}`)
})

it("security: variables from one run don't leak to another", () => {
  const res1 = runWithFuel("let secret = 42", 100)
  assert("ok" in res1, "first run should succeed")
  const res2 = runWithFuel("return secret", 100)
  assert("err" in res2, "'secret' should not leak between runs")
})

it("security: arrow function closures can't escape scope", () => {
  // Inner arrow sees outer vars, but outer can't see inner vars
  const res = runWithFuel("const f = () => { let inner = 1 }; f(); return inner", 100)
  assert("err" in res, "'inner' should not be visible outside arrow function")
})

// ---------------------------------------------------------------------------
// Security: assertSafeIdent defense-in-depth
// ---------------------------------------------------------------------------

it("security: assertSafeIdent blocks forbidden identifiers", () => {
  const forbidden = ["eval", "arguments", "this", "globalThis", "window", "document", "self", "process", "require"]
  for (const name of forbidden) {
    let threw = false
    try { assertSafeIdent(name) } catch { threw = true }
    assert(threw, `assertSafeIdent should reject '${name}'`)
  }
})

it("security: assertSafeIdent blocks malformed identifiers", () => {
  const bad = ["123abc", "a b", "", "a;b", "a\nb", "a+b"]
  for (const name of bad) {
    let threw = false
    try { assertSafeIdent(name) } catch { threw = true }
    assert(threw, `assertSafeIdent should reject '${JSON.stringify(name)}'`)
  }
})

it("security: assertSafeIdent allows valid identifiers", () => {
  const good = ["x", "_foo", "$bar", "abc123", "Object", "Promise", "Function", "__fuel", "__burn"]
  for (const name of good) {
    assertSafeIdent(name) // should not throw
  }
})

// ---------------------------------------------------------------------------
// Regression: codegen round-trip
// ---------------------------------------------------------------------------

it("regression: parse-render-eval round-trip for expressions", () => {
  const cases: [string, unknown][] = [
    ["return 42", 42],
    ["return 'hello'", "hello"],
    ["return true", true],
    ["return false", false],
    ["return null", null],
    ["return -5", -5],
    ["return !false", true],
    ["return typeof 'x'", "string"],
    ["return 1 + 2 * 3", 7],
    ["return (1 + 2) * 3", 9],
    ["return 10 > 5 ? 'yes' : 'no'", "yes"],
    ["return [1, 2, 3]", [1, 2, 3]],
    ["return {a: 1, b: 2}", {a: 1, b: 2}],
    ["return [...[1, 2], 3]", [1, 2, 3]],
    ["return {a: 1, ...{b: 2}}", {a: 1, b: 2}],
  ]
  for (const [code, expected] of cases) {
    const res = runWithFuel(code, 1000)
    assert("ok" in res, `round-trip failed for '${code}': ${"err" in res ? res.err : ""}`)
    assert(JSON.stringify(res.ok) === JSON.stringify(expected), `'${code}': ${JSON.stringify(res.ok)} !== ${JSON.stringify(expected)}`)
  }
})

it("regression: parse-render-eval round-trip for statements", () => {
  const cases: [string, unknown][] = [
    ["let x = 5; return x", 5],
    ["const y = 10; return y", 10],
    ["let x = 1; x += 2; return x", 3],
    ["if (true) return 1; return 2", 1],
    ["if (false) return 1; else return 2", 2],
    ["let i = 0; while (i < 5) { i++ } return i", 5],
    ["let s = 0; for (let i = 0; i < 5; i++) { s += i } return s", 10],
    ["let s = 0; for (let x of [1, 2, 3]) { s += x } return s", 6],
    ["let k = []; for (let x in {a: 1, b: 2}) { k.push(x) } return k", ["a", "b"]],
    ["let i = 0; while (true) { i++; if (i === 3) break } return i", 3],
    ["let s = 0; for (let i = 0; i < 5; i++) { if (i === 2) continue; s += i } return s", 8],
  ]
  for (const [code, expected] of cases) {
    const res = runWithFuel(code, 1000)
    assert("ok" in res, `round-trip failed for '${code}': ${"err" in res ? res.err : ""}`)
    assert(JSON.stringify(res.ok) === JSON.stringify(expected), `'${code}': ${JSON.stringify(res.ok)} !== ${JSON.stringify(expected)}`)
  }
})

it("regression: parse-render-eval round-trip for functions", () => {
  const cases: [string, unknown][] = [
    ["const add = (a, b) => a + b; return add(2, 3)", 5],
    ["const inc = x => x + 1; return inc(4)", 5],
    ["const f = () => { return 42 }; return f()", 42],
    ["const f = (...xs) => xs.length; return f(1, 2, 3)", 3],
    ["let x = 10; const f = () => x; return f()", 10],
    ["const sum = ({x, y}) => x + y; return sum({x: 2, y: 3})", 5],
  ]
  for (const [code, expected] of cases) {
    const res = runWithFuel(code, 1000)
    assert("ok" in res, `round-trip failed for '${code}': ${"err" in res ? res.err : ""}`)
    assert(JSON.stringify(res.ok) === JSON.stringify(expected), `'${code}': ${JSON.stringify(res.ok)} !== ${JSON.stringify(expected)}`)
  }
})

it("regression: parse-render-eval round-trip for destructuring", () => {
  const cases: [string, unknown][] = [
    ["let [a, b] = [1, 2]; return a + b", 3],
    ["let {x, y} = {x: 10, y: 20}; return x + y", 30],
    ["let {x: a, y: b} = {x: 10, y: 20}; return a + b", 30],
    ["let [x, ...rest] = [1, 2, 3]; return [x, rest]", [1, [2, 3]]],
    ["let {a, ...rest} = {a: 1, b: 2, c: 3}; return [a, rest]", [1, {b: 2, c: 3}]],
  ]
  for (const [code, expected] of cases) {
    const res = runWithFuel(code, 1000)
    assert("ok" in res, `round-trip failed for '${code}': ${"err" in res ? res.err : ""}`)
    assert(JSON.stringify(res.ok) === JSON.stringify(expected), `'${code}': ${JSON.stringify(res.ok)} !== ${JSON.stringify(expected)}`)
  }
})

it("regression: renderWithFuel produces valid JS", () => {
  const code = "let x = 1; for (let i = 0; i < 3; i++) { x = x + i }"
  const program = parse(code)
  const rendered = renderWithFuel(program, 1000)
  // Verify the rendered code contains the fuel prelude
  assert(rendered.includes("__fuel"), "rendered code should contain __fuel")
  assert(rendered.includes("__burn"), "rendered code should contain __burn")
  // Execute it via Function to verify it's valid JS (no errors)
  new Function(rendered)()
})
