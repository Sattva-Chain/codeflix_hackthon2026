const path = require("path");

function supports(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".java";
}

function preview({ finding, oldLine, envName, helpers }) {
  const reference = `System.getenv("${envName}")`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName,
    reference,
    newLine,
    language: "java",
    bootstrapKind: null,
  };
}

module.exports = {
  id: "java",
  supports,
  preview,
};
