const { scanStagedChanges } = require("../services/preCommitGuard");

async function main() {
  const repoPath = process.argv[2] || process.cwd();
  const result = await scanStagedChanges(repoPath);

  if (!result.stagedFiles.length) {
    console.log("SecureScan Guard: no staged files found.");
    process.exit(0);
  }

  if (!result.blocked) {
    console.log("SecureScan Guard: no staged secrets found. Commit allowed.");
    process.exit(0);
  }

  console.error(`SecureScan Guard: commit blocked. ${result.findings.length} secret${result.findings.length === 1 ? "" : "s"} found in staged changes.`);
  for (const finding of result.findings.slice(0, 10)) {
    console.error(`- ${finding.file}:${finding.line} [${finding.type}] ${finding.secret.slice(0, 4)}...`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(`SecureScan Guard failed: ${error.message || error}`);
  process.exit(1);
});
