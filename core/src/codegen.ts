/**
 * codegen.ts — Security-critical code generation and runtime execution.
 *
 * This module takes a validated AST (from parser.ts) and produces JavaScript
 * source strings that are evaluated via `new Function()`. Every identifier
 * emitted into the generated code is validated by `assertSafeIdent` as a
 * defense-in-depth measure (the parser already produces safe names, but the
 * codegen must not trust its input).
 *
 * Audit surface: renderExpr, renderStmt, renderPattern, and the runner
 * functions that interpolate fuel references.
 */

import type {
  Program, Stmt, Expr, Literal, Property, Pattern, PatternProperty,
  Identifier, SpreadElement, BlockStatement, VarDecl,
} from "./parser.ts";
import { parse, validateScopes, validateNoPrototype } from "./parser.ts";

// ---------------------------------------------------------------------------
// Defense-in-depth: identifier validation
// ---------------------------------------------------------------------------

const SAFE_IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const FORBIDDEN_IDENTS = new Set([
  "eval", "arguments", "this", "globalThis", "window", "document",
  "self", "top", "parent", "frames",
  "process", "require", "module", "exports", "__dirname", "__filename",
  "importScripts",
]);

export const assertSafeIdent = (name: string): void => {
  if (!SAFE_IDENT_RE.test(name))
    throw new Error(`unsafe identifier in codegen: ${JSON.stringify(name)}`);
  if (FORBIDDEN_IDENTS.has(name))
    throw new Error(`forbidden identifier in codegen: ${name}`);
};

// ---------------------------------------------------------------------------
// Code generation (AST → JS source string)
// ---------------------------------------------------------------------------

const renderLiteral = (v: Literal["value"]) => {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
};

const renderExpr = (e: Expr): string => {
  switch (e.type) {
    case "Identifier":
      assertSafeIdent(e.name);
      return e.name;
    case "SpreadElement":
      return `...${renderExpr(e.argument)}`;
    case "Literal":
      return renderLiteral(e.value);
    case "ArrayExpression":
      return `[${e.elements.map(renderExpr).join(", ")}]`;
    case "ObjectExpression":
      return `{${e.properties.map((p) => p.type === "SpreadElement" ? `...${renderExpr(p.argument)}` : renderProp(p)).join(", ")}}`;
    case "AwaitExpression":
      return `(await ${renderExpr(e.argument)})`;
    case "CallExpression": {
      const calleeStr = renderExpr(e.callee);
      const needsParens = e.callee.type === "ArrowFunctionExpression";
      return `${needsParens ? "(" : ""}${calleeStr}${needsParens ? ")" : ""}(${e.arguments.map(renderExpr).join(", ")})`;
    }
    case "MemberExpression":
      return e.computed
        ? `${renderExpr(e.object)}[${renderExpr(e.property)}]`
        : `${renderExpr(e.object)}.${renderExpr(e.property)}`;
    case "AssignmentExpression":
      return `${renderExpr(e.left)} ${e.operator} ${renderExpr(e.right)}`;
    case "UpdateExpression":
      return e.prefix
        ? `${e.operator}${renderExpr(e.argument)}`
        : `${renderExpr(e.argument)}${e.operator}`;
    case "BinaryExpression":
    case "LogicalExpression":
      return `(${renderExpr(e.left)} ${e.operator} ${renderExpr(e.right)})`;
    case "UnaryExpression":
      return e.operator === "typeof"
        ? `(${e.operator} ${renderExpr(e.argument)})`
        : `(${e.operator}${renderExpr(e.argument)})`;
    case "ConditionalExpression":
      return `(${renderExpr(e.test)} ? ${renderExpr(e.consequent)} : ${renderExpr(e.alternate)})`;
    case "ArrowFunctionExpression":
      return renderArrow(e);
  }
};

const renderProp = (p: Property) => {
  const key =
    p.key.type === "Identifier" ? p.key.name : renderLiteral(p.key.value);
  if (p.shorthand && p.value.type === "Identifier" && p.value.name === key) {
    assertSafeIdent(key);
    return key;
  }
  return `${key}: ${renderExpr(p.value)}`;
};

const renderArrow = (e: Extract<Expr, { type: "ArrowFunctionExpression" }>) => {
  const params = `(${e.params.map(renderPattern).join(", ")})`;
  const prefix = e.async ? "async " : "";
  if (e.body.type === "BlockStatement") {
    return `${prefix}${params} => ${renderStmt(e.body, true)}`;
  }
  return `${prefix}${params} => { __burn(); return ${renderExpr(e.body)}; }`;
};

const renderStmt = (s: Stmt, inFn = false): string => {
  const burn = inFn ? "__burn();" : "";
  const renderLoopBody = (body: Stmt) => {
    if (body.type === "BlockStatement") {
      const inner = body.body.map((b) => renderStmt(b, inFn)).join("");
      return `{__burn();${inner}}`;
    }
    return `{__burn();${renderStmt(body, inFn)}}`;
  };
  switch (s.type) {
    case "BlockStatement":
      return `{${s.body.map((b) => renderStmt(b, inFn)).join("")}}`;
    case "ExpressionStatement":
      return `${burn}${renderExpr(s.expression)};`;
    case "IfStatement": {
      const wrap = (stmt: Stmt) =>
        stmt.type === "BlockStatement" ? renderStmt(stmt, inFn) : `{${renderStmt(stmt, inFn)}}`;
      return `${burn}if (${renderExpr(s.test)}) ${wrap(s.consequent)}${s.alternate ? ` else ${wrap(s.alternate)}` : ""}`;
    }
    case "ReturnStatement":
      return `${burn}return${s.argument ? ` ${renderExpr(s.argument)}` : ""};`;
    case "VariableDeclaration":
      return `${burn}${s.kind} ${s.declarations.map(renderDecl).join(", ")};`;
    case "BreakStatement":
      return `${burn}break;`;
    case "ContinueStatement":
      return `${burn}continue;`;
    case "WhileStatement":
      return `${burn}while (${renderExpr(s.test)}) ${renderLoopBody(s.body)}`;
    case "ForStatement": {
      const init =
        s.init == null
          ? ""
          : Array.isArray(s.init)
          ? `${s.initKind} ${s.init.map(renderDecl).join(", ")}`
          : renderExpr(s.init);
      const test = s.test ? renderExpr(s.test) : "";
      const update = s.update ? renderExpr(s.update) : "";
      return `${burn}for (${init}; ${test}; ${update}) ${renderLoopBody(s.body)}`;
    }
    case "ForInStatement": {
      const left = Array.isArray(s.left)
        ? `${s.leftKind} ${s.left.map(renderDecl).join(", ")}`
        : renderExpr(s.left);
      return `${burn}for (${left} in ${renderExpr(s.right)}) ${renderLoopBody(s.body)}`;
    }
    case "ForOfStatement": {
      const left = Array.isArray(s.left)
        ? `${s.leftKind} ${s.left.map(renderDecl).join(", ")}`
        : renderExpr(s.left);
      return `${burn}for (${left} of ${renderExpr(s.right)}) ${renderLoopBody(s.body)}`;
    }
  }
};

const renderDecl = (d: VarDecl) =>
  `${renderPattern(d.id)}${d.init ? ` = ${renderExpr(d.init)}` : ""}`;

const renderPattern = (p: Pattern): string => {
  if (p.type === "Identifier") {
    assertSafeIdent(p.name);
    return p.name;
  }
  if (p.type === "RestElement") return `...${renderPattern(p.argument)}`;
  if (p.type === "ArrayPattern") return `[${p.elements.map(renderPattern).join(", ")}]`;
  return `{${p.properties.map((prop) => prop.type === "RestElement" ? `...${renderPattern(prop.argument)}` : renderPatternProperty(prop)).join(", ")}}`;
};

const renderPatternProperty = (p: PatternProperty): string => {
  const key =
    p.key.type === "Identifier" ? p.key.name : renderLiteral(p.key.value);
  if (
    p.shorthand &&
    p.key.type === "Identifier" &&
    p.value.type === "Identifier" &&
    p.value.name === p.key.name
  ) {
    assertSafeIdent(key);
    return key;
  }
  return `${key}: ${renderPattern(p.value)}`;
};

// ---------------------------------------------------------------------------
// Runner codegen (wraps program body with fuel metering)
// ---------------------------------------------------------------------------

export const renderWithFuel = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}${body}`;
};

export const renderRunnerWithFuel = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = () => {${body}}; try { const ok = __run(); return { ok, fuel: __fuel }; } catch (err) { return { err: String(err), fuel: __fuel }; }`;
};

export const renderRunnerWithFuelShared = (program: Program, fuelRefName = "__fuel") => {
  assertSafeIdent(fuelRefName);
  const prelude = `const __burn = () => { if (--${fuelRefName}.value < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = () => {${body}}; try { const ok = __run(); return { ok, fuel: ${fuelRefName}.value }; } catch (err) { return { err: String(err), fuel: ${fuelRefName}.value }; }`;
};

export const renderRunnerWithFuelSharedAsync = (program: Program, fuelRefName = "__fuel") => {
  assertSafeIdent(fuelRefName);
  const prelude = `const __burn = () => { if (--${fuelRefName}.value < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = async () => {${body}}; return __run().then(ok => ({ ok, fuel: ${fuelRefName}.value })).catch(err => ({ err: String(err), fuel: ${fuelRefName}.value }));`;
};

export const renderRunnerWithFuelAsync = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = async () => {${body}}; return __run().then(ok => ({ ok, fuel: __fuel })).catch(err => ({ err: String(err), fuel: __fuel }));`;
};

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

export type runRes = { ok: unknown; fuel: number } | { err: string; fuel: number };

const SAFE_OBJECT = (() => {
  const safe = Object.create(null) as {
    keys: (obj: unknown) => string[];
    values: (obj: unknown) => unknown[];
    entries: (obj: unknown) => [string, unknown][];
  };
  safe.keys = (obj: unknown) => Object.keys(obj as Record<string, unknown>);
  safe.values = (obj: unknown) => Object.values(obj as Record<string, unknown>);
  safe.entries = (obj: unknown) => Object.entries(obj as Record<string, unknown>);
  return Object.freeze(safe);
})();

type FuelRef = { value: number };
type FunctionParam = { name: string, rest: boolean };

const parseFunctionCtor = (ctorArgs: unknown[]): { params: FunctionParam[], body: string } => {
  if (ctorArgs.some((v) => typeof v !== "string")) {
    throw new Error("Function arguments must be strings");
  }
  const parts = ctorArgs as string[];
  const body = parts.length ? parts[parts.length - 1] : "";
  const rawParams = parts.slice(0, -1);
  const params: FunctionParam[] = [];
  for (const raw of rawParams) {
    for (const seg of raw.split(",")) {
      const name = seg.trim();
      if (!name) continue;
      const rest = name.startsWith("...");
      const base = rest ? name.slice(3) : name;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(base)) {
        throw new Error(`Invalid function parameter: ${name}`);
      }
      params.push({ name: base, rest });
    }
  }
  const restCount = params.filter((p) => p.rest).length;
  if (restCount > 1 || (restCount === 1 && !params[params.length - 1].rest)) {
    throw new Error("Rest parameter must be the last parameter");
  }
  return { params, body };
};

const mapFunctionArgs = (params: FunctionParam[], callArgs: unknown[]): Record<string, unknown> => {
  const env: Record<string, unknown> = {};
  let idx = 0;
  for (const p of params) {
    if (p.rest) {
      env[p.name] = callArgs.slice(idx);
      idx = callArgs.length;
    } else {
      env[p.name] = callArgs[idx++];
    }
  }
  return env;
};

const makeSafeFunctionSync = (fuelRef: FuelRef, outerGlobals: Record<string, unknown>) => (...ctorArgs: unknown[]) => {
  const { params, body } = parseFunctionCtor(ctorArgs);
  return (...callArgs: unknown[]) => {
    const localEnv = { ...outerGlobals, ...mapFunctionArgs(params, callArgs) };
    const res = runWithFuelShared(body, fuelRef, localEnv);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  };
};

const makeSafeFunctionAsync = (fuelRef: FuelRef, outerGlobals: Record<string, unknown>) => (...ctorArgs: unknown[]) => {
  const { params, body } = parseFunctionCtor(ctorArgs);
  return async (...callArgs: unknown[]) => {
    const localEnv = { ...outerGlobals, ...mapFunctionArgs(params, callArgs) };
    const res = await runWithFuelSharedAsync(body, fuelRef, localEnv);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  };
};

const withBuiltins = (
  env: Record<string, unknown>,
  fuelRef: FuelRef,
  mode: "sync" | "async",
): Record<string, unknown> => {
  const baseGlobals: Record<string, unknown> = {
    ...env,
    Object: SAFE_OBJECT,
    Promise,
  };
  return {
    ...baseGlobals,
    Function: mode === "async"
      ? makeSafeFunctionAsync(fuelRef, baseGlobals)
      : makeSafeFunctionSync(fuelRef, baseGlobals),
  };
};

const stringifyError = (err: unknown): string => {
  if (err instanceof Error) {
    const stack = err.stack || '';
    const prefix = `${err.name}: ${err.message}`;
    const cleanStack = stack
      .replace(/^[^\n]*\n?/, '')
      .replace(/spacetimedb_module:(\d+):(\d+)/g, '<bundled:$1:$2>');
    return cleanStack ? `${prefix}\n${cleanStack}` : prefix;
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
};

// ---------------------------------------------------------------------------
// Public runtime API
// ---------------------------------------------------------------------------

export const runWithFuel = (
  src: string,
  fuel = 10000,
  env: Record<string, unknown> = {},
): runRes => {
  const fuelRef = { value: fuel };
  return runWithFuelShared(src, fuelRef, env);
};

export const runWithFuelShared = (
  src: string,
  fuelRef: FuelRef,
  env: Record<string, unknown> = {},
  fuelRefName = "__fuel"
): runRes => {
  try {
    const runtimeEnv = withBuiltins(env, fuelRef, "sync");
    const program = parse(src);
    const protoErrs = validateNoPrototype(program);
    if (protoErrs.length) return { err: "prototype access", fuel: fuelRef.value };
    const scopeErrs = validateScopes(program, [...Object.keys(runtimeEnv), fuelRefName]);
    if (scopeErrs.length) return { err: scopeErrs.join(", "), fuel: fuelRef.value };
    const code = renderRunnerWithFuelShared(program, fuelRefName);
    const fullEnv = { ...runtimeEnv, [fuelRefName]: fuelRef };
    return (new Function(...Object.keys(fullEnv), code) as (...args:unknown[]) => runRes)(...Object.values(fullEnv));
  } catch (err) {
    return { err: stringifyError(err), fuel: fuelRef.value };
  }
};

export const runWithFuelSharedAsync = async (
  src: string,
  fuelRef: FuelRef,
  env: Record<string, unknown> = {},
  fuelRefName = "__fuel"
): Promise<runRes> => {
  try {
    const runtimeEnv = withBuiltins(env, fuelRef, "async");
    const program = parse(src);
    const protoErrs = validateNoPrototype(program);
    if (protoErrs.length) return { err: "prototype access", fuel: fuelRef.value };
    const scopeErrs = validateScopes(program, [...Object.keys(runtimeEnv), fuelRefName]);
    if (scopeErrs.length) return { err: scopeErrs.join(", "), fuel: fuelRef.value };
    const code = renderRunnerWithFuelSharedAsync(program, fuelRefName);
    const fullEnv = { ...runtimeEnv, [fuelRefName]: fuelRef };
    const fn = new Function(...Object.keys(fullEnv), code) as (...args: unknown[]) => Promise<runRes>;
    return await fn(...Object.values(fullEnv));
  } catch (err) {
    return { err: stringifyError(err), fuel: fuelRef.value };
  }
};

export const runWithFuelAsync = async (
  src: string,
  fuel = 10000,
  env: Record<string, unknown> = {}
): Promise<runRes> => {
  const fuelRef = { value: fuel };
  return runWithFuelSharedAsync(src, fuelRef, env);
};
