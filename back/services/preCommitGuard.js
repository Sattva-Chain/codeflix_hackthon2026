const fs = require("fs");
const path = require("path");
const {
	runGit,
	detectGitRepoRoot,
} = require("./scanRuntime");
const { runLocalScan } = require("./localRepoCli");

const HOOK_MARKER = "SECURESCAN_PRE_COMMIT_GUARD";

function shellPath(value) {
	const normalized = path.resolve(value);
	return process.platform === "win32" ? normalized.replace(/\\/g, "/") : normalized;
}

async function resolveHooksDir(repoRoot) {
	const { stdout } = await runGit(["rev-parse", "--git-path", "hooks"], {
		cwd: repoRoot,
	});
	const hookDir = path.resolve(repoRoot, String(stdout || "").trim());
	fs.mkdirSync(hookDir, { recursive: true });
	return hookDir;
}

async function getHookPaths(repoPath) {
	const repoRoot = await detectGitRepoRoot(repoPath);
	const hooksDir = await resolveHooksDir(repoRoot);
	return {
		repoRoot,
		hooksDir,
		shPath: path.join(hooksDir, "pre-commit"),
		cmdPath: path.join(hooksDir, "pre-commit.cmd"),
	};
}

function buildHookScripts(repoRoot) {
	const scriptPath = path.resolve(__dirname, "..", "scripts", "preCommitScan.js");
	const normalizedScriptPath = shellPath(scriptPath);
	const normalizedRepoRoot = shellPath(repoRoot);

	const shellScript = `#!/bin/sh
# ${HOOK_MARKER}
node "${normalizedScriptPath}" "${normalizedRepoRoot}"
status=$?
if [ "$status" -ne 0 ]; then
  echo "Secure Scan blocked this commit because staged secrets were found."
  exit "$status"
fi
exit 0
`;

	const cmdScript = `@echo off\r\nREM ${HOOK_MARKER}\r\nnode "${scriptPath}" "${repoRoot}"\r\nif errorlevel 1 (\r\n  echo Secure Scan blocked this commit because staged secrets were found.\r\n  exit /b 1\r\n)\r\nexit /b 0\r\n`;

	return { shellScript, cmdScript };
}

async function installGuard(repoPath) {
	const { repoRoot, shPath, cmdPath } = await getHookPaths(repoPath);
	const { shellScript, cmdScript } = buildHookScripts(repoRoot);
	fs.writeFileSync(shPath, shellScript, "utf8");
	fs.writeFileSync(cmdPath, cmdScript, "utf8");
	try {
		fs.chmodSync(shPath, 0o755);
	} catch {}
	return {
		installed: true,
		repoPath: repoRoot,
		hookPath: shPath,
		shellHookInstalled: true,
		cmdHookInstalled: true,
	};
}

async function uninstallGuard(repoPath) {
	const { repoRoot, shPath, cmdPath } = await getHookPaths(repoPath);
	for (const target of [shPath, cmdPath]) {
		if (!fs.existsSync(target)) continue;
		const content = fs.readFileSync(target, "utf8");
		if (!content.includes(HOOK_MARKER)) continue;
		fs.rmSync(target, { force: true });
	}
	return {
		installed: false,
		repoPath: repoRoot,
		hookPath: shPath,
		shellHookInstalled: false,
		cmdHookInstalled: false,
	};
}

async function getGuardStatus(repoPath) {
	const { repoRoot, shPath, cmdPath } = await getHookPaths(repoPath);
	const shellHookInstalled =
		fs.existsSync(shPath) && fs.readFileSync(shPath, "utf8").includes(HOOK_MARKER);
	const cmdHookInstalled =
		fs.existsSync(cmdPath) && fs.readFileSync(cmdPath, "utf8").includes(HOOK_MARKER);
	return {
		installed: shellHookInstalled || cmdHookInstalled,
		repoPath: repoRoot,
		hookPath: shellHookInstalled ? shPath : cmdHookInstalled ? cmdPath : shPath,
		shellHookInstalled,
		cmdHookInstalled,
	};
}

function makeSilentStdout() {
	return {
		write() {},
	};
}

async function scanStagedChanges(repoPath) {
	const result = await runLocalScan({
		repoPath,
		staged: true,
		stdout: makeSilentStdout(),
	});
	const findings = (result.results?.findings || [])
		.filter((finding) => !finding.ignored)
		.map((finding) => {
			const location = (finding.locations || [])[0] || {};
			return {
				file: location.filePath || finding.filePath || "unknown",
				line: location.lineStart ?? finding.lineStart ?? "N/A",
				type: finding.secretType || "Secret",
				secret: finding.rawSecret || "Hidden",
			};
		});
	return {
		repoPath: result.repoRoot,
		stagedFiles: result.stagedFiles || [],
		findings,
		blocked: findings.length > 0,
	};
}

module.exports = {
	HOOK_MARKER,
	installGuard,
	uninstallGuard,
	getGuardStatus,
	scanStagedChanges,
};
