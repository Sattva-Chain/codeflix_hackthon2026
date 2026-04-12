const path = require("path");

function supports(filePath) {
  return path.extname(String(filePath || "")).toLowerCase() === ".php";
}

function preview({ finding, oldLine, envName, helpers }) {
  const reference = `getenv('${envName}')`;
  const newLine = helpers.replaceLiteralWithEnv(oldLine, finding.secret, reference);

  return {
    envName,
    reference,
    newLine,
    language: "php",
    bootstrapKind: null,
  };
}

module.exports = {
  id: "php",
  supports,
  preview,
};
