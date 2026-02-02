type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "keyword"
  | "operator"
  | "punct"
  | "eof";

type Token = { type: TokenType; value: string; pos: number };

const keywords = new Set([
  "if",
  "else",
  "return",
  "let",
  "const",
  "for",
  "while",
  "in",
  "of",
  "break",
  "continue",
  "true",
  "false",
  "null",
]);

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => /[0-9]/.test(c);

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string, pos: number) => tokens.push({ type, value, pos });
  const peek = () => src[i];
  const next = () => src[i++];

  while (i < src.length) {
    const c = peek();
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === "\"") {
      const quote = next();
      let out = "";
      const start = i - 1;
      while (i < src.length) {
        const ch = next();
        if (ch === "\\") {
          const esc = next();
          out += esc;
        } else if (ch === quote) {
          break;
        } else {
          out += ch;
        }
      }
      push("string", out, start);
      continue;
    }
    if (isDigit(c)) {
      const start = i;
      let num = "";
      while (i < src.length && isDigit(peek())) num += next();
      if (peek() === ".") {
        num += next();
        while (i < src.length && isDigit(peek())) num += next();
      }
      push("number", num, start);
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      let id = "";
      while (i < src.length && isIdentPart(peek())) id += next();
      if (keywords.has(id)) push("keyword", id, start);
      else push("identifier", id, start);
      continue;
    }
    const start = i;
    const two = src.slice(i, i + 2);
    const three = src.slice(i, i + 3);
    if (three === "===" || three === "!==") {
      i += 3;
      push("operator", three, start);
      continue;
    }
    if (two === "&&" || two === "||" || two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "=>" || two === "+=" || two === "-=" || two === "*=" || two === "/=" || two === "%=" || two === "++" || two === "--") {
      i += 2;
      push("operator", two, start);
      continue;
    }
    if ("+-*/%<>=!.,;:?(){}[]".includes(c)) {
      i++;
      const type = ".;,(){}[]".includes(c) ? "punct" : "operator";
      push(type, c, start);
      continue;
    }
    throw new Error(`Unexpected character '${c}' at ${i}`);
  }
  tokens.push({ type: "eof", value: "", pos: i });
  return tokens;
};

export type Program = { type: "Program"; body: Stmt[] };
export type BlockStatement = { type: "BlockStatement"; body: Stmt[] };
export type Stmt =
  | BlockStatement
  | { type: "ExpressionStatement"; expression: Expr }
  | { type: "IfStatement"; test: Expr; consequent: Stmt; alternate: Stmt | null }
  | { type: "ReturnStatement"; argument: Expr | null }
  | { type: "VariableDeclaration"; kind: "let" | "const"; declarations: VarDecl[] }
  | { type: "BreakStatement" }
  | { type: "ContinueStatement" }
  | { type: "WhileStatement"; test: Expr; body: Stmt }
  | {
      type: "ForStatement";
      init: VarDecl[] | Expr | null;
      initKind: "let" | "const" | null;
      test: Expr | null;
      update: Expr | null;
      body: Stmt;
    }
  | { type: "ForInStatement"; left: VarDecl[] | Expr; leftKind: "let" | "const" | null; right: Expr; body: Stmt }
  | { type: "ForOfStatement"; left: VarDecl[] | Expr; leftKind: "let" | "const" | null; right: Expr; body: Stmt };
export type Pattern =
  | Identifier
  | { type: "ArrayPattern"; elements: Identifier[] }
  | { type: "ObjectPattern"; properties: Identifier[] };

export type VarDecl = { type: "VariableDeclarator"; id: Pattern; init: Expr | null };

export type Expr =
  | Identifier
  | Literal
  | { type: "ArrayExpression"; elements: Expr[] }
  | { type: "ObjectExpression"; properties: Property[] }
  | { type: "CallExpression"; callee: Expr; arguments: Expr[] }
  | { type: "MemberExpression"; object: Expr; property: Expr; computed: boolean }
  | { type: "AssignmentExpression"; operator: string; left: Expr; right: Expr }
  | { type: "UpdateExpression"; operator: "++" | "--"; argument: Expr; prefix: boolean }
  | { type: "BinaryExpression"; operator: string; left: Expr; right: Expr }
  | { type: "LogicalExpression"; operator: string; left: Expr; right: Expr }
  | { type: "UnaryExpression"; operator: string; argument: Expr }
  | { type: "ConditionalExpression"; test: Expr; consequent: Expr; alternate: Expr }
  | { type: "ArrowFunctionExpression"; params: Identifier[]; body: Expr | BlockStatement };

export type Identifier = { type: "Identifier"; name: string };
export type Literal = { type: "Literal"; value: string | number | boolean | null };
export type Property = { type: "Property"; key: Identifier | Literal; value: Expr; shorthand: boolean };

export const validateScopes = (program: Program, allowedGlobals: string[] = []) => {
  const errors: string[] = [];
  const globals = new Set(allowedGlobals);
  const scopes: Array<Set<string>> = [new Set()];

  const declare = (name: string) => scopes[scopes.length - 1].add(name);
  const isDeclared = (name: string) => scopes.some((s) => s.has(name)) || globals.has(name);
  const enter = () => scopes.push(new Set());
  const exit = () => { scopes.pop(); };
  const checkIdent = (name: string) => {
    if (!isDeclared(name)) errors.push(`undeclared: ${name}`);
  };

  const declarePattern = (p: Pattern) => {
    if (p.type === "Identifier") declare(p.name);
    else if (p.type === "ArrayPattern") p.elements.forEach((e) => declare(e.name));
    else p.properties.forEach((e) => declare(e.name));
  };

  const visitExpr = (e: Expr): void => {
    switch (e.type) {
      case "Identifier":
        checkIdent(e.name);
        return;
      case "Literal":
        return;
      case "ArrayExpression":
        e.elements.forEach(visitExpr);
        return;
      case "ObjectExpression":
        e.properties.forEach((p) => visitExpr(p.value));
        return;
      case "CallExpression":
        visitExpr(e.callee);
        e.arguments.forEach(visitExpr);
        return;
      case "MemberExpression":
        visitExpr(e.object);
        if (e.computed) visitExpr(e.property);
        return;
      case "AssignmentExpression":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "UpdateExpression":
        visitExpr(e.argument);
        return;
      case "BinaryExpression":
      case "LogicalExpression":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "UnaryExpression":
        visitExpr(e.argument);
        return;
      case "ConditionalExpression":
        visitExpr(e.test);
        visitExpr(e.consequent);
        visitExpr(e.alternate);
        return;
      case "ArrowFunctionExpression":
        enter();
        e.params.forEach((p) => declare(p.name));
        if (e.body.type === "BlockStatement") visitStmt(e.body);
        else visitExpr(e.body);
        exit();
        return;
    }
  };

  const visitVarDecl = (d: VarDecl) => {
    declarePattern(d.id);
    if (d.init) visitExpr(d.init);
  };

  const visitStmt = (s: Stmt): void => {
    switch (s.type) {
      case "BlockStatement":
        enter();
        s.body.forEach(visitStmt);
        exit();
        return;
      case "ExpressionStatement":
        visitExpr(s.expression);
        return;
      case "IfStatement":
        visitExpr(s.test);
        visitStmt(s.consequent);
        if (s.alternate) visitStmt(s.alternate);
        return;
      case "ReturnStatement":
        if (s.argument) visitExpr(s.argument);
        return;
      case "VariableDeclaration":
        s.declarations.forEach(visitVarDecl);
        return;
      case "WhileStatement":
        visitExpr(s.test);
        visitStmt(s.body);
        return;
      case "ForStatement": {
        enter();
        if (Array.isArray(s.init)) s.init.forEach(visitVarDecl);
        else if (s.init) visitExpr(s.init);
        if (s.test) visitExpr(s.test);
        if (s.update) visitExpr(s.update);
        visitStmt(s.body);
        exit();
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        enter();
        if (Array.isArray(s.left)) s.left.forEach(visitVarDecl);
        else visitExpr(s.left);
        visitExpr(s.right);
        visitStmt(s.body);
        exit();
        return;
      }
      case "BreakStatement":
      case "ContinueStatement":
        return;
    }
  };

  program.body.forEach(visitStmt);
  return errors;
};

export const validateNoPrototype = (program: Program) => {
  const errors: string[] = [];
  const visitExpr = (e: Expr): void => {
    switch (e.type) {
      case "MemberExpression":
        if (!e.computed && e.property.type === "Identifier" && e.property.name === "prototype") {
          errors.push("prototype access");
        }
        if (e.computed && e.property.type === "Literal" && e.property.value === "prototype") {
          errors.push("prototype access");
        }
        visitExpr(e.object);
        if (e.computed) visitExpr(e.property);
        return;
      case "CallExpression":
        visitExpr(e.callee);
        e.arguments.forEach(visitExpr);
        return;
      case "ArrayExpression":
        e.elements.forEach(visitExpr);
        return;
      case "ObjectExpression":
        e.properties.forEach((p) => visitExpr(p.value));
        return;
      case "AssignmentExpression":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "UpdateExpression":
        visitExpr(e.argument);
        return;
      case "BinaryExpression":
      case "LogicalExpression":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "UnaryExpression":
        visitExpr(e.argument);
        return;
      case "ConditionalExpression":
        visitExpr(e.test);
        visitExpr(e.consequent);
        visitExpr(e.alternate);
        return;
      case "ArrowFunctionExpression":
        if (e.body.type === "BlockStatement") visitStmt(e.body);
        else visitExpr(e.body);
        return;
      case "Identifier":
      case "Literal":
        return;
    }
  };
  const visitStmt = (s: Stmt): void => {
    switch (s.type) {
      case "BlockStatement":
        s.body.forEach(visitStmt);
        return;
      case "ExpressionStatement":
        visitExpr(s.expression);
        return;
      case "IfStatement":
        visitExpr(s.test);
        visitStmt(s.consequent);
        if (s.alternate) visitStmt(s.alternate);
        return;
      case "ReturnStatement":
        if (s.argument) visitExpr(s.argument);
        return;
      case "VariableDeclaration":
        s.declarations.forEach((d) => d.init && visitExpr(d.init));
        return;
      case "WhileStatement":
        visitExpr(s.test);
        visitStmt(s.body);
        return;
      case "ForStatement":
        if (Array.isArray(s.init)) s.init.forEach((d) => d.init && visitExpr(d.init));
        else if (s.init) visitExpr(s.init);
        if (s.test) visitExpr(s.test);
        if (s.update) visitExpr(s.update);
        visitStmt(s.body);
        return;
      case "ForInStatement":
      case "ForOfStatement":
        if (Array.isArray(s.left)) s.left.forEach((d) => d.init && visitExpr(d.init));
        else visitExpr(s.left);
        visitExpr(s.right);
        visitStmt(s.body);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
    }
  };
  program.body.forEach(visitStmt);
  return errors;
};

const renderLiteral = (v: Literal["value"]) => {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
};

const renderExpr = (e: Expr): string => {
  switch (e.type) {
    case "Identifier":
      return e.name;
    case "Literal":
      return renderLiteral(e.value);
    case "ArrayExpression":
      return `[${e.elements.map(renderExpr).join(", ")}]`;
    case "ObjectExpression":
      return `{${e.properties.map(renderProp).join(", ")}}`;
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
      return `(${e.operator}${renderExpr(e.argument)})`;
    case "ConditionalExpression":
      return `(${renderExpr(e.test)} ? ${renderExpr(e.consequent)} : ${renderExpr(e.alternate)})`;
    case "ArrowFunctionExpression":
      return renderArrow(e);
  }
};

const renderProp = (p: Property) => {
  const key =
    p.key.type === "Identifier" ? p.key.name : renderLiteral(p.key.value);
  if (p.shorthand && p.value.type === "Identifier" && p.value.name === key) return key;
  return `${key}: ${renderExpr(p.value)}`;
};

const renderArrow = (e: Extract<Expr, { type: "ArrowFunctionExpression" }>) => {
  const params = `(${e.params.map((p) => p.name).join(", ")})`;
  if (e.body.type === "BlockStatement") {
    return `${params} => ${renderStmt(e.body, true)}`;
  }
  return `${params} => { __burn(); return ${renderExpr(e.body)}; }`;
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
  if (p.type === "Identifier") return p.name;
  if (p.type === "ArrayPattern") return `[${p.elements.map((e) => e.name).join(", ")}]`;
  return `{${p.properties.map((e) => e.name).join(", ")}}`;
};

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
  const prelude = `const __burn = () => { if (--${fuelRefName}.value < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = () => {${body}}; try { const ok = __run(); return { ok, fuel: ${fuelRefName}.value }; } catch (err) { return { err: String(err), fuel: ${fuelRefName}.value }; }`;
};

export const renderRunnerWithFuelAsync = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = async () => {${body}}; return __run().then(ok => ({ ok, fuel: __fuel })).catch(err => ({ err: String(err), fuel: __fuel }));`;
};

export type runRes = { ok: unknown; fuel: number } | { err: string; fuel: number };

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

export const runWithFuel = (
  src: string,
  fuel = 10000,
  env: Record<string, unknown> = {},
): runRes => {
  try {
    const program = parse(src);
    const protoErrs = validateNoPrototype(program);
    if (protoErrs.length) return { err: "prototype access", fuel };
    return (new Function(...Object.keys(env),renderRunnerWithFuel(program, fuel)) as (...args:unknown[]) => runRes)(...Object.values(env));
  } catch (err) {
    console.log("run with Fuel error: ",err)
    return {err: stringifyError(err), fuel };
  }
};

export const runWithFuelShared = (
  src: string,
  fuelRef: { value: number },
  env: Record<string, unknown> = {},
  fuelRefName = "__fuel"
): runRes => {
  try {
    const program = parse(src);
    const protoErrs = validateNoPrototype(program);
    if (protoErrs.length) return { err: "prototype access", fuel: fuelRef.value };
    const code = renderRunnerWithFuelShared(program, fuelRefName);
    const fullEnv = { ...env, [fuelRefName]: fuelRef };
    return (new Function(...Object.keys(fullEnv), code) as (...args:unknown[]) => runRes)(...Object.values(fullEnv));
  } catch (err) {
    return { err: stringifyError(err), fuel: fuelRef.value };
  }
};

export const runWithFuelAsync = async (
  src: string,
  fuel = 10000,
  env: Record<string, unknown> = {}
): Promise<runRes> => {
  try {
    const program = parse(src);
    const protoErrs = validateNoPrototype(program);
    if (protoErrs.length) return { err: "prototype access", fuel };
    const code = renderRunnerWithFuelAsync(program, fuel);
    const fn = new Function(...Object.keys(env), code) as (...args:unknown[]) => Promise<runRes>;
    return await fn(...Object.values(env));
  } catch (err) {
    return { err: stringifyError(err), fuel };
  }
};

export const parse = (src: string): Program => {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const eat = (type: TokenType, value?: string) => {
    const t = peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${value ?? type} at ${t.pos}`);
    }
    return next();
  };
  const match = (type: TokenType, value?: string) => {
    const t = peek();
    return t.type === type && (value === undefined || t.value === value);
  };

  const parseProgram = (): Program => {
    const body: Stmt[] = [];
    while (!match("eof")) body.push(parseStatement());
    return { type: "Program", body };
  };

  const parseStatement = (): Stmt => {
    if (match("punct", "{")) return parseBlock();
    if (match("keyword", "if")) return parseIf();
    if (match("keyword", "while")) return parseWhile();
    if (match("keyword", "for")) return parseFor();
    if (match("keyword", "break")) { next(); if (match("punct", ";")) next(); return { type: "BreakStatement" }; }
    if (match("keyword", "continue")) { next(); if (match("punct", ";")) next(); return { type: "ContinueStatement" }; }
    if (match("keyword", "return")) return parseReturn();
    if (match("keyword", "let") || match("keyword", "const")) return parseVarDecl();
    const expr = parseExpression();
    if (match("punct", ";")) next();
    return { type: "ExpressionStatement", expression: expr };
  };

  const parseBlock = (): BlockStatement => {
    eat("punct", "{");
    const body: Stmt[] = [];
    while (!match("punct", "}")) body.push(parseStatement());
    eat("punct", "}");
    return { type: "BlockStatement", body };
  };

  const parseIf = (): Stmt => {
    eat("keyword", "if");
    eat("punct", "(");
    const test = parseExpression();
    eat("punct", ")");
    const consequent = parseStatement();
    const alternate = match("keyword", "else") ? (next(), parseStatement()) : null;
    return { type: "IfStatement", test, consequent, alternate };
  };

  const parseReturn = (): Stmt => {
    eat("keyword", "return");
    if (match("punct", ";")) {
      next();
      return { type: "ReturnStatement", argument: null };
    }
    const argument = match("punct", "}") ? null : parseExpression();
    if (match("punct", ";")) next();
    return { type: "ReturnStatement", argument };
  };

  const parseVarDeclCore = (consumeSemi: boolean) => {
    const kind = next().value as "let" | "const";
    const declarations: VarDecl[] = [];
    do {
      const id = parsePattern();
      const init = match("operator", "=") ? (next(), parseExpression()) : null;
      declarations.push({ type: "VariableDeclarator", id, init });
      if (!match("punct", ",")) break;
      next();
    } while (true);
    if (consumeSemi && match("punct", ";")) next();
    return { kind, declarations };
  };

  const parseVarDecl = (): Stmt => {
    const { kind, declarations } = parseVarDeclCore(true);
    return { type: "VariableDeclaration", kind, declarations };
  };

  const parseWhile = (): Stmt => {
    eat("keyword", "while");
    eat("punct", "(");
    const test = parseExpression();
    eat("punct", ")");
    const body = parseStatement();
    return { type: "WhileStatement", test, body };
  };

  const parseFor = (): Stmt => {
    eat("keyword", "for");
    eat("punct", "(");
    let init: VarDecl[] | Expr | null = null;
    let initKind: "let" | "const" | null = null;
    if (!match("punct", ";")) {
      if (match("keyword", "let") || match("keyword", "const")) {
        const parsed = parseVarDeclCore(false);
        init = parsed.declarations;
        initKind = parsed.kind;
      } else {
        init = parseExpression();
      }
    }
    if (match("keyword", "in") || match("keyword", "of")) {
      const kind = next().value;
      const right = parseExpression();
      eat("punct", ")");
      const body = parseStatement();
      if (!init) throw new Error(`Expected initializer before ${kind} at ${peek().pos}`);
      return kind === "in"
        ? { type: "ForInStatement", left: init, leftKind: initKind, right, body }
        : { type: "ForOfStatement", left: init, leftKind: initKind, right, body };
    }
    eat("punct", ";");
    const test = match("punct", ";") ? null : parseExpression();
    eat("punct", ";");
    const update = match("punct", ")") ? null : parseExpression();
    eat("punct", ")");
    const body = parseStatement();
    return { type: "ForStatement", init, initKind, test, update, body };
  };

  const parseExpression = (): Expr => parseAssignment();

  const parseAssignment = (): Expr => {
    const left = parseConditional();
    if (match("operator", "=") || match("operator", "+=") || match("operator", "-=") || match("operator", "*=") || match("operator", "/=") || match("operator", "%=")) {
      const op = next().value;
      const right = parseAssignment();
      return { type: "AssignmentExpression", operator: op, left, right };
    }
    return left;
  };

  const parseConditional = (): Expr => {
    let test = parseLogicalOr();
    if (match("operator", "?")) {
      next();
      const consequent = parseExpression();
      eat("operator", ":");
      const alternate = parseExpression();
      return { type: "ConditionalExpression", test, consequent, alternate };
    }
    return test;
  };

  const parseLogicalOr = (): Expr => {
    let left = parseLogicalAnd();
    while (match("operator", "||")) {
      const op = next().value;
      const right = parseLogicalAnd();
      left = { type: "LogicalExpression", operator: op, left, right };
    }
    return left;
  };

  const parseLogicalAnd = (): Expr => {
    let left = parseEquality();
    while (match("operator", "&&")) {
      const op = next().value;
      const right = parseEquality();
      left = { type: "LogicalExpression", operator: op, left, right };
    }
    return left;
  };

  const parseEquality = (): Expr => {
    let left = parseRelational();
    while (match("operator", "==") || match("operator", "!=") || match("operator", "===") || match("operator", "!==")) {
      const op = next().value;
      const right = parseRelational();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  };

  const parseRelational = (): Expr => {
    let left = parseAdditive();
    while (match("operator", "<") || match("operator", "<=") || match("operator", ">") || match("operator", ">=")) {
      const op = next().value;
      const right = parseAdditive();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  };

  const parseAdditive = (): Expr => {
    let left = parseMultiplicative();
    while (match("operator", "+") || match("operator", "-")) {
      const op = next().value;
      const right = parseMultiplicative();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  };

  const parseMultiplicative = (): Expr => {
    let left = parseUnary();
    while (match("operator", "*") || match("operator", "/") || match("operator", "%")) {
      const op = next().value;
      const right = parseUnary();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  };

  const parseUnary = (): Expr => {
    if (match("operator", "++") || match("operator", "--")) {
      const op = next().value as "++" | "--";
      return { type: "UpdateExpression", operator: op, argument: parseUnary(), prefix: true };
    }
    if (match("operator", "!") || match("operator", "-") || match("operator", "+")) {
      const op = next().value;
      return { type: "UnaryExpression", operator: op, argument: parseUnary() };
    }
    return parsePostfix();
  };

  const parsePostfix = (): Expr => {
    let expr = parseArrowOrPrimary();
    while (true) {
      if (match("operator", "++") || match("operator", "--")) {
        const op = next().value as "++" | "--";
        expr = { type: "UpdateExpression", operator: op, argument: expr, prefix: false };
        continue;
      }
      if (match("punct", "(")) {
        const args = parseArguments();
        expr = { type: "CallExpression", callee: expr, arguments: args };
        continue;
      }
      if (match("punct", ".")) {
        next();
        const prop = parseIdentifier();
        expr = { type: "MemberExpression", object: expr, property: prop, computed: false };
        continue;
      }
      if (match("punct", "[")) {
        next();
        const prop = parseExpression();
        eat("punct", "]");
        expr = { type: "MemberExpression", object: expr, property: prop, computed: true };
        continue;
      }
      break;
    }
    return expr;
  };

  const parseArrowOrPrimary = (): Expr => {
    if (match("identifier")) {
      const id = parseIdentifier();
      if (match("operator", "=>")) {
        next();
        const body = match("punct", "{") ? parseBlock() : parseExpression();
        return { type: "ArrowFunctionExpression", params: [id], body };
      }
      return id;
    }
    if (match("punct", "(")) {
      const start = i;
      next();
      const params: Identifier[] = [];
      let isParams = true;
      if (!match("punct", ")")) {
        do {
          if (!match("identifier")) { isParams = false; break; }
          params.push(parseIdentifier());
          if (!match("punct", ",")) break;
          next();
        } while (true);
      }
      if (isParams && match("punct", ")")) {
        next();
        if (match("operator", "=>")) {
          next();
          const body = match("punct", "{") ? parseBlock() : parseExpression();
          return { type: "ArrowFunctionExpression", params, body };
        }
      }
      i = start;
      eat("punct", "(");
      const expr = parseExpression();
      eat("punct", ")");
      return expr;
    }
    return parsePrimary();
  };

  const parsePrimary = (): Expr => {
    if (match("number")) return { type: "Literal", value: Number(next().value) };
    if (match("string")) return { type: "Literal", value: next().value };
    if (match("keyword", "true")) { next(); return { type: "Literal", value: true }; }
    if (match("keyword", "false")) { next(); return { type: "Literal", value: false }; }
    if (match("keyword", "null")) { next(); return { type: "Literal", value: null }; }
    if (match("punct", "[")) return parseArray();
    if (match("punct", "{")) return parseObject();
    if (match("identifier")) return parseIdentifier();
    throw new Error(`Unexpected token ${peek().type} ${peek().value} at ${peek().pos}`);
  };

  const parseArray = (): Expr => {
    eat("punct", "[");
    const elements: Expr[] = [];
    if (!match("punct", "]")) {
      do {
        elements.push(parseExpression());
        if (!match("punct", ",")) break;
        next();
      } while (true);
    }
    eat("punct", "]");
    return { type: "ArrayExpression", elements };
  };

  const parseObject = (): Expr => {
    eat("punct", "{");
    const properties: Property[] = [];
    if (!match("punct", "}")) {
      do {
        let key: Identifier | Literal;
        let shorthand = false;
        if (match("identifier")) key = parseIdentifier();
        else if (match("string")) key = { type: "Literal", value: next().value };
        else if (match("number")) key = { type: "Literal", value: Number(next().value) };
        else throw new Error(`Expected object key at ${peek().pos}`);
        let value: Expr;
        if (match("operator", ":")) {
          next();
          value = parseExpression();
        } else {
          if (key.type !== "Identifier") throw new Error(`Expected ':' after key at ${peek().pos}`);
          value = key;
          shorthand = true;
        }
        properties.push({ type: "Property", key, value, shorthand });
        if (!match("punct", ",")) break;
        next();
      } while (true);
    }
    eat("punct", "}");
    return { type: "ObjectExpression", properties };
  };

  const parseArguments = (): Expr[] => {
    eat("punct", "(");
    const args: Expr[] = [];
    if (!match("punct", ")")) {
      do {
        args.push(parseExpression());
        if (!match("punct", ",")) break;
        next();
      } while (true);
    }
    eat("punct", ")");
    return args;
  };

  const parseIdentifier = (): Identifier => {
    const t = eat("identifier");
    return { type: "Identifier", name: t.value };
  };

  const parsePattern = (): Pattern => {
    if (match("punct", "[")) {
      eat("punct", "[");
      const elements: Identifier[] = [];
      if (!match("punct", "]")) {
        do {
          elements.push(parseIdentifier());
          if (!match("punct", ",")) break;
          next();
        } while (true);
      }
      eat("punct", "]");
      return { type: "ArrayPattern", elements };
    }
    if (match("punct", "{")) {
      eat("punct", "{");
      const properties: Identifier[] = [];
      if (!match("punct", "}")) {
        do {
          properties.push(parseIdentifier());
          if (!match("punct", ",")) break;
          next();
        } while (true);
      }
      eat("punct", "}");
      return { type: "ObjectPattern", properties };
    }
    return parseIdentifier();
  };

  return parseProgram();
};
