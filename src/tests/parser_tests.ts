import { runWithFuelAsync } from "../../spacetimedb/src/parser";

type TestCase = {
  name: string;
  code: string;
  expect?: any;
  fuel?: number;
  compareWithNative?: boolean;
  expectFuelError?: boolean;
};
type TestResult = { name: string; ok: boolean; details?: string };

const runNativeAsync = async (code: string): Promise<{ ok: unknown } | { err: unknown }> => {
  try {
    const fn = new Function(`"use strict"; ${code}`);
    const res = fn();
    return { ok: res && typeof res.then === "function" ? await res : res };
  } catch (err) {
    return { err };
  }
};

const isErr = (r: any): r is { err: unknown } => "err" in r;

const same = (a: unknown, b: unknown) => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

const cases: TestCase[] = [
  { name: "return-number", code: "return 2 + 3;", expect: 5},
  { name: "array-map", code: "const a=[1,2,3]; return a[1]*2;" },
  { name: "object-literal", code: "const x={a:1,b:2}; return x.a + x.b;" },
  { name: "if-else", code: "const v=3; if (v>2) return 'ok'; else return 'no';" },
  { name: "arrow-call", code: "const f=(x)=>x+1; return f(4);" },
  { name: "logical", code: "const x=true && false; return x || 5;" },
  { name: "conditional", code: "const x=1; return x===1 ? 9 : 0;" },
  { name: "nested-funcall", code: "let ob={f:(x)=>x+3,g:(x)=>x+4}; return ob.g(ob.f(5));" },
  { name: "async-promise", code: "const f=(x)=>Promise.resolve(x+1); return f(4);" },
  { name: "async-chain", code: "return Promise.resolve(3).then(x=>x*2);", expect: 6},
  {
    name: "doomloop-recursion-fuel",
    code: "const f=(n)=>f(n+1); return f(0);",
    fuel: 50,
    compareWithNative: false,
    expectFuelError: true,
  },
];

export const runParserTests = async () => {
  const results: TestResult[] = [];
  for (const { name, code, fuel = 10000, compareWithNative = true, expectFuelError = false, expect} of cases) {
    const fuelRes = await runWithFuelAsync(code, fuel);
    if (expectFuelError) {
      results.push({ name, ok: isErr(fuelRes), details: isErr(fuelRes) ? undefined : "expected fuel error" });
      continue;
    }
    if (!compareWithNative) {
      results.push({ name, ok: !isErr(fuelRes), details: isErr(fuelRes) ? "fuel error" : undefined });
      continue;
    }
    const native = await runNativeAsync(code);
    if (isErr(native)) {
      results.push({ name, ok: isErr(fuelRes), details: "native error" });
      continue;
    }
    if (isErr(fuelRes)) {
      results.push({ name, ok: false, details: "fuel error" });
      continue;
    }

    results.push({ name, ok: same(native.ok, fuelRes.ok) && (expect != undefined ? same(native.ok, expect) : true)});
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.error("parser tests failed", failed);
    return { ok: false, failed, results };
  }
  console.log("parser tests ok", results);
  return { ok: true, results };
};
