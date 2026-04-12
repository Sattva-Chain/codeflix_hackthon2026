const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

function supports(filePath) {
  return JS_EXTENSIONS.has(require("path").extname(String(filePath || "")).toLowerCase());
}

function preview({ finding, filePath, oldLine, envName, helpers }) {
  const target = helpers.isFrontendFile(filePath)
    ? envName.startsWith("VITE_")
      ? envName
      : `VITE_${envName}`
    : envName;
  const reference = helpers.isFrontendFile(filePath)
    ? `import.meta.env.${target}`
    : `process.env.${target}`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName: target,
    reference,
    newLine,
    language: helpers.isFrontendFile(filePath) ? "vite-js" : "node-js",
    bootstrapKind: helpers.isFrontendFile(filePath) ? null : "node-dotenv",
  };
}

module.exports = {
  id: "javascript",
  supports,
  preview,
};
