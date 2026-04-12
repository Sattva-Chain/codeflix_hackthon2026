const path = require("path");

function supports(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".cs";
}

function preview({ finding, oldLine, envName, helpers }) {
  const reference = `System.Environment.GetEnvironmentVariable("${envName}")`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName,
    reference,
    newLine,
    language: "csharp",
    bootstrapKind: null,
  };
}

module.exports = {
  id: "csharp",
  supports,
  preview,
};
