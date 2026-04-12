const path = require("path");

function supports(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".py";
}

function preview({ finding, oldLine, envName, helpers }) {
  const reference = `os.getenv("${envName}")`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName,
    reference,
    newLine,
    language: "python",
    bootstrapKind: "python-os",
  };
}

module.exports = {
  id: "python",
  supports,
  preview,
};
