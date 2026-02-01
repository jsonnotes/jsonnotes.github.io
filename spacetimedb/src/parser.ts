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
    if (two === "&&" || two === "||" || two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "=>") {
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
  | { type: "VariableDeclaration"; kind: "let" | "const"; declarations: VarDecl[] };
export type VarDecl = { type: "VariableDeclarator"; id: Identifier; init: Expr | null };

export type Expr =
  | Identifier
  | Literal
  | { type: "ArrayExpression"; elements: Expr[] }
  | { type: "ObjectExpression"; properties: Property[] }
  | { type: "CallExpression"; callee: Expr; arguments: Expr[] }
  | { type: "MemberExpression"; object: Expr; property: Expr; computed: boolean }
  | { type: "AssignmentExpression"; operator: "="; left: Expr; right: Expr }
  | { type: "BinaryExpression"; operator: string; left: Expr; right: Expr }
  | { type: "LogicalExpression"; operator: string; left: Expr; right: Expr }
  | { type: "UnaryExpression"; operator: string; argument: Expr }
  | { type: "ConditionalExpression"; test: Expr; consequent: Expr; alternate: Expr }
  | { type: "ArrowFunctionExpression"; params: Identifier[]; body: Expr | BlockStatement };

export type Identifier = { type: "Identifier"; name: string };
export type Literal = { type: "Literal"; value: string | number | boolean | null };
export type Property = { type: "Property"; key: Identifier | Literal; value: Expr; shorthand: boolean };

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
    case "CallExpression":
      return `${renderExpr(e.callee)}(${e.arguments.map(renderExpr).join(", ")})`;
    case "MemberExpression":
      return e.computed
        ? `${renderExpr(e.object)}[${renderExpr(e.property)}]`
        : `${renderExpr(e.object)}.${renderExpr(e.property)}`;
    case "AssignmentExpression":
      return `${renderExpr(e.left)} ${e.operator} ${renderExpr(e.right)}`;
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
    return `${params} ${renderStmt(e.body, true)}`;
  }
  return `${params} => { __burn(); return ${renderExpr(e.body)}; }`;
};

const renderStmt = (s: Stmt, inFn = false): string => {
  const burn = inFn ? "__burn();" : "";
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
  }
};

const renderDecl = (d: VarDecl) =>
  `${d.id.name}${d.init ? ` = ${renderExpr(d.init)}` : ""}`;

export const renderWithFuel = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}${body}`;
};

export const renderRunnerWithFuel = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = () => {${body}}; try { const ok = __run(); return { ok, fuel: __fuel }; } catch (err) { return { err, fuel: __fuel }; }`;
};

export const renderRunnerWithFuelAsync = (program: Program, fuel = 10000) => {
  const prelude = `let __fuel = ${fuel}; const __burn = () => { if (--__fuel < 0) throw new Error("fuel exhausted"); };`;
  const body = program.body.map((s) => renderStmt(s, true)).join("");
  return `${prelude}const __run = async () => {${body}}; return __run().then(ok => ({ ok, fuel: __fuel })).catch(err => ({ err, fuel: __fuel }));`;
};

export const runWithFuel = (
  src: string,
  fuel = 10000
): { ok: unknown; fuel: number } | { err: unknown; fuel: number } => {
  try {
    const program = parse(src);
    const code = renderRunnerWithFuel(program, fuel);
    const fn = new Function(code) as () =>
      | { ok: unknown; fuel: number }
      | { err: unknown; fuel: number };
    return fn();
  } catch (err) {
    return { err, fuel };
  }
};

export const runWithFuelAsync = async (
  src: string,
  fuel = 10000
): Promise<{ ok: unknown; fuel: number } | { err: unknown; fuel: number }> => {
  try {
    const program = parse(src);
    const code = renderRunnerWithFuelAsync(program, fuel);
    const fn = new Function(code) as () => Promise<
      | { ok: unknown; fuel: number }
      | { err: unknown; fuel: number }
    >;
    return await fn();
  } catch (err) {
    return { err, fuel };
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

  const parseVarDecl = (): Stmt => {
    const kind = (next().value as "let" | "const");
    const declarations: VarDecl[] = [];
    do {
      const id = parseIdentifier();
      const init = match("operator", "=") ? (next(), parseExpression()) : null;
      declarations.push({ type: "VariableDeclarator", id, init });
      if (!match("punct", ",")) break;
      next();
    } while (true);
    if (match("punct", ";")) next();
    return { type: "VariableDeclaration", kind, declarations };
  };

  const parseExpression = (): Expr => parseAssignment();

  const parseAssignment = (): Expr => {
    const left = parseConditional();
    if (match("operator", "=")) {
      next();
      const right = parseAssignment();
      return { type: "AssignmentExpression", operator: "=", left, right };
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
    if (match("operator", "!") || match("operator", "-") || match("operator", "+")) {
      const op = next().value;
      return { type: "UnaryExpression", operator: op, argument: parseUnary() };
    }
    return parsePostfix();
  };

  const parsePostfix = (): Expr => {
    let expr = parseArrowOrPrimary();
    while (true) {
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

  return parseProgram();
};
