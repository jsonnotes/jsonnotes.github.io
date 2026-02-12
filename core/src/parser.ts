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
  "await",
  "typeof",
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
    if (three === "===" || three === "!==" || three === "...") {
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
  | RestElement
  | { type: "ArrayPattern"; elements: Pattern[] }
  | { type: "ObjectPattern"; properties: (PatternProperty | RestElement)[] };

export type RestElement = { type: "RestElement"; argument: Pattern };

export type PatternProperty = {
  type: "Property";
  key: Identifier | Literal;
  value: Pattern;
  shorthand: boolean;
};

export type VarDecl = { type: "VariableDeclarator"; id: Pattern; init: Expr | null };

export type Expr =
  | Identifier
  | SpreadElement
  | Literal
  | { type: "ArrayExpression"; elements: (Expr | SpreadElement)[] }
  | { type: "ObjectExpression"; properties: (Property | SpreadElement)[] }
  | { type: "AwaitExpression"; argument: Expr }
  | { type: "CallExpression"; callee: Expr; arguments: (Expr | SpreadElement)[] }
  | { type: "MemberExpression"; object: Expr; property: Expr; computed: boolean }
  | { type: "AssignmentExpression"; operator: string; left: Expr; right: Expr }
  | { type: "UpdateExpression"; operator: "++" | "--"; argument: Expr; prefix: boolean }
  | { type: "BinaryExpression"; operator: string; left: Expr; right: Expr }
  | { type: "LogicalExpression"; operator: string; left: Expr; right: Expr }
  | { type: "UnaryExpression"; operator: string; argument: Expr }
  | { type: "ConditionalExpression"; test: Expr; consequent: Expr; alternate: Expr }
  | { type: "ArrowFunctionExpression"; params: Pattern[]; body: Expr | BlockStatement; async: boolean };

export type Identifier = { type: "Identifier"; name: string };
export type SpreadElement = { type: "SpreadElement"; argument: Expr };
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
    else if (p.type === "RestElement") declarePattern(p.argument);
    else if (p.type === "ArrayPattern") p.elements.forEach(declarePattern);
    else p.properties.forEach((prop) => {
      if (prop.type === "RestElement") declarePattern(prop.argument);
      else declarePattern(prop.value);
    });
  };

  const visitExpr = (e: Expr): void => {
    switch (e.type) {
      case "Identifier":
        checkIdent(e.name);
        return;
      case "Literal":
        return;
      case "SpreadElement":
        visitExpr(e.argument);
        return;
      case "ArrayExpression":
        e.elements.forEach((el) => visitExpr(el));
        return;
      case "ObjectExpression":
        e.properties.forEach((p) => {
          if (p.type === "SpreadElement") visitExpr(p.argument);
          else visitExpr(p.value);
        });
        return;
      case "AwaitExpression":
        visitExpr(e.argument);
        return;
      case "CallExpression":
        visitExpr(e.callee);
        e.arguments.forEach((a) => visitExpr(a));
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
        e.params.forEach(declarePattern);
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
  const forbiddenMembers = new Set(["prototype", "constructor", "__proto__"]);
  const visitExpr = (e: Expr): void => {
    switch (e.type) {
      case "MemberExpression":
        if (!e.computed && e.property.type === "Identifier" && forbiddenMembers.has(e.property.name)) {
          errors.push("prototype access");
        }
        if (e.computed && !(e.property.type === "Literal" && typeof e.property.value === "number")) {
          errors.push("only numeric literal indexing allowed");
        }
        visitExpr(e.object);
        if (e.computed) visitExpr(e.property);
        return;
      case "SpreadElement":
        visitExpr(e.argument);
        return;
      case "CallExpression":
        visitExpr(e.callee);
        e.arguments.forEach((a) => visitExpr(a));
        return;
      case "AwaitExpression":
        visitExpr(e.argument);
        return;
      case "ArrayExpression":
        e.elements.forEach((el) => visitExpr(el));
        return;
      case "ObjectExpression":
        e.properties.forEach((p) => {
          if (p.type === "SpreadElement") visitExpr(p.argument);
          else visitExpr(p.value);
        });
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
    if (match("keyword", "await")) {
      next();
      return { type: "AwaitExpression", argument: parseUnary() };
    }
    if (match("operator", "++") || match("operator", "--")) {
      const op = next().value as "++" | "--";
      return { type: "UpdateExpression", operator: op, argument: parseUnary(), prefix: true };
    }
    if (match("keyword", "typeof")) {
      next();
      return { type: "UnaryExpression", operator: "typeof", argument: parseUnary() };
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
    if (match("identifier", "async")) {
      const start = i;
      next();
      if (match("identifier")) {
        const id = parseIdentifier();
        if (match("operator", "=>")) {
          next();
          const body = match("punct", "{") ? parseBlock() : parseExpression();
          return { type: "ArrowFunctionExpression", params: [id], body, async: true };
        }
      } else if (match("punct", "(")) {
        next();
        const params: Pattern[] = [];
        let isParams = true;
        try {
          if (!match("punct", ")")) {
            do {
              params.push(parsePattern());
              if (!match("punct", ",")) break;
              next();
            } while (true);
          }
        } catch {
          isParams = false;
        }
        if (isParams && match("punct", ")")) {
          next();
          if (match("operator", "=>")) {
            next();
            const body = match("punct", "{") ? parseBlock() : parseExpression();
            return { type: "ArrowFunctionExpression", params, body, async: true };
          }
        }
      }
      i = start;
    }

    if (match("identifier")) {
      const id = parseIdentifier();
      if (match("operator", "=>")) {
        next();
        const body = match("punct", "{") ? parseBlock() : parseExpression();
        return { type: "ArrowFunctionExpression", params: [id], body, async: false };
      }
      return id;
    }
    if (match("punct", "(")) {
      const start = i;
      next();
      const params: Pattern[] = [];
      let isParams = true;
      try {
        if (!match("punct", ")")) {
          do {
            params.push(parsePattern());
            if (!match("punct", ",")) break;
            next();
          } while (true);
        }
      } catch {
        isParams = false;
      }
      if (isParams && match("punct", ")")) {
        next();
        if (match("operator", "=>")) {
          next();
          const body = match("punct", "{") ? parseBlock() : parseExpression();
          return { type: "ArrowFunctionExpression", params, body, async: false };
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
    const elements: (Expr | SpreadElement)[] = [];
    if (!match("punct", "]")) {
      do {
        if (match("operator", "...")) {
          next();
          elements.push({ type: "SpreadElement", argument: parseExpression() });
        } else {
          elements.push(parseExpression());
        }
        if (!match("punct", ",")) break;
        next();
      } while (true);
    }
    eat("punct", "]");
    return { type: "ArrayExpression", elements };
  };

  const parseObject = (): Expr => {
    eat("punct", "{");
    const properties: (Property | SpreadElement)[] = [];
    if (!match("punct", "}")) {
      do {
        if (match("operator", "...")) {
          next();
          properties.push({ type: "SpreadElement", argument: parseExpression() });
          if (!match("punct", ",")) break;
          next();
          continue;
        }
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

  const parseArguments = (): (Expr | SpreadElement)[] => {
    eat("punct", "(");
    const args: (Expr | SpreadElement)[] = [];
    if (!match("punct", ")")) {
      do {
        if (match("operator", "...")) {
          next();
          args.push({ type: "SpreadElement", argument: parseExpression() });
        } else {
          args.push(parseExpression());
        }
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
    if (match("operator", "...")) {
      next();
      return { type: "RestElement", argument: parsePattern() };
    }
    if (match("punct", "[")) {
      eat("punct", "[");
      const elements: Pattern[] = [];
      if (!match("punct", "]")) {
        do {
          elements.push(parsePattern());
          if (!match("punct", ",")) break;
          next();
        } while (true);
      }
      eat("punct", "]");
      return { type: "ArrayPattern", elements };
    }
    if (match("punct", "{")) {
      eat("punct", "{");
      const properties: (PatternProperty | RestElement)[] = [];
      if (!match("punct", "}")) {
        do {
          if (match("operator", "...")) {
            next();
            properties.push({ type: "RestElement", argument: parsePattern() });
            if (!match("punct", ",")) break;
            next();
            continue;
          }
          let key: Identifier | Literal;
          let shorthand = false;
          if (match("identifier")) key = parseIdentifier();
          else if (match("string")) key = { type: "Literal", value: next().value };
          else if (match("number")) key = { type: "Literal", value: Number(next().value) };
          else throw new Error(`Expected object pattern key at ${peek().pos}`);
          let value: Pattern;
          if (match("operator", ":")) {
            next();
            value = parsePattern();
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
      return { type: "ObjectPattern", properties };
    }
    return parseIdentifier();
  };

  return parseProgram();
};

// Re-export codegen + runtime from codegen.ts so existing import paths keep working
export {
  assertSafeIdent,
  renderWithFuel,
  renderRunnerWithFuel,
  renderRunnerWithFuelShared,
  renderRunnerWithFuelSharedAsync,
  renderRunnerWithFuelAsync,
  runWithFuel,
  runWithFuelShared,
  runWithFuelSharedAsync,
  runWithFuelAsync,
} from "./codegen.ts";
export type { runRes } from "./codegen.ts";
