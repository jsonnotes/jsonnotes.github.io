const fs = require("fs");
const path = require("path");
const ts = require("typescript");

require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      sourceMap: false,
      inlineSourceMap: false,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const testsPath = path.join(__dirname, "..", "src", "tests", "parser_tests.ts");
const tests = require(testsPath);
(async () => {
  const res = await tests.runParserTests();
  if (!res || res.ok !== true) process.exit(1);
})();
