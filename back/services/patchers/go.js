const path = require("path");

function supports(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".go";
}

function preview({ finding, oldLine, envName, helpers }) {
  const reference = `os.Getenv("${envName}")`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName,
    reference,
    newLine,
    language: "go",
    bootstrapKind: "go-os",
  };
}

module.exports = {
  id: "go",
  supports,
  preview,
};
