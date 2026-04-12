const javascript = require("./javascript");
const typescript = require("./typescript");
const python = require("./python");
const java = require("./java");
const go = require("./go");
const php = require("./php");
const csharp = require("./csharp");

const patchers = [typescript, javascript, python, java, go, php, csharp];

function inferPatcherFromContent(content) {
  const text = String(content || "");
  if (!text.trim()) return null;

  if (
    /^\s*from\s+\w+.*\s+import\s+/m.test(text) ||
    /^\s*import\s+\w+(\s+as\s+\w+)?/m.test(text) ||
    /^\s*def\s+\w+\(/m.test(text) ||
    /\bos\.getenv\(/.test(text)
  ) {
    return python;
  }

  if (/^\s*package\s+main\b/m.test(text) || /^\s*func\s+\w+\(/m.test(text) || /\bos\.Getenv\(/.test(text)) {
    return go;
  }

  if (/^\s*<\?php/m.test(text) || /\$\w+\s*=/.test(text) || /\bgetenv\(/.test(text)) {
    return php;
  }

  if (/^\s*using\s+System\b/m.test(text) || /\bSystem\.Environment\.GetEnvironmentVariable\(/.test(text)) {
    return csharp;
  }

  if (/^\s*(public\s+)?class\s+\w+/m.test(text) || /^\s*import\s+java\./m.test(text) || /\bSystem\.getenv\(/.test(text)) {
    return java;
  }

  return null;
}

function pickPatcher(filePath, content = "") {
  return patchers.find((patcher) => patcher.supports(filePath)) || inferPatcherFromContent(content) || null;
}

function buildPatchPreview({ finding, filePath, oldLine, envName, fileContent, helpers }) {
  const patcher = pickPatcher(filePath, fileContent);
  if (!patcher) {
    return {
      envName,
      reference: null,
      newLine: oldLine,
      language: "unsupported",
      bootstrapKind: null,
      reason: "Patch agent does not support this language yet.",
    };
  }

  return patcher.preview({ finding, filePath, oldLine, envName, helpers });
}

module.exports = {
  buildPatchPreview,
  pickPatcher,
};
