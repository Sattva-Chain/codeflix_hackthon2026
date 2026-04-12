const path = require("path");

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

function supports(filePath) {
  return TS_EXTENSIONS.has(path.extname(String(filePath || "")).toLowerCase());
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
    language: helpers.isFrontendFile(filePath) ? "vite-ts" : "node-ts",
    bootstrapKind: helpers.isFrontendFile(filePath) ? null : "node-dotenv",
  };
}

module.exports = {
  id: "typescript",
  supports,
  preview,
};
