const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const util = require("util");
const { execFile } = require("child_process");

const execFileAsync = util.promisify(execFile);
const AI_ANALYZE_URL = process.env.SECURE_SCAN_AI_URL || "https://secure-scan-ai-risk.onrender.com/analyze";
const HOOK_MARKER = "SECURESCAN_PRE_COMMIT_GUARD";
const IGNORE_PATTERNS = [".git/", "node_modules/", "dist/", "build/", ".env.example"];

function safeParseJson(lines) {
  const results = [];
  String(lines || "")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line.trim()) return;
      try {
        results.push(JSON.parse(line));
      } catch {}
    });
  return results;
}

async function runGit(repoPath, args, extra = {}) {
  return execFileAsync("git", args, {
    cwd: repoPath,
    maxBuffer: 1024 * 1024 * 20,
    ...extra,
  });
}

async function getRepoRoot(repoPath) {
  const { stdout } = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  return String(stdout || "").trim();
}

function ensureGitHooksDir(repoPath) {
  const hooksDir = path.join(repoPath, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  return hooksDir;
}

function getHookPaths(repoPath) {
  const hooksDir = ensureGitHooksDir(repoPath);
  return {
    hooksDir,
    shPath: path.join(hooksDir, "pre-commit"),
    cmdPath: path.join(hooksDir, "pre-commit.cmd"),
  };
}

function buildHookScripts() {
  const scriptPath = path.resolve(__dirname, "..", "scripts", "preCommitScan.js");
  const normalizedScriptPath = scriptPath.replace(/\\/g, "/");

  const shellScript = `#!/bin/sh
# ${HOOK_MARKER}
node "${normalizedScriptPath}" "$PWD"
status=$?
if [ "$status" -ne 0 ]; then
  echo "SecureScan blocked this commit because staged secrets were found."
  exit "$status"
fi
exit 0
`;

  const cmdScript = `@echo off\r\nREM ${HOOK_MARKER}\r\nnode "${scriptPath}" "%cd%"\r\nif errorlevel 1 (\r\n  echo SecureScan blocked this commit because staged secrets were found.\r\n  exit /b 1\r\n)\r\nexit /b 0\r\n`;

  return { shellScript, cmdScript };
}

async function installGuard(repoPath) {
  const root = await getRepoRoot(repoPath);
  const { shPath, cmdPath } = getHookPaths(root);
  const { shellScript, cmdScript } = buildHookScripts();
  fs.writeFileSync(shPath, shellScript, "utf8");
  fs.writeFileSync(cmdPath, cmdScript, "utf8");
  return { installed: true, hookPath: shPath, repoPath: root };
}

async function uninstallGuard(repoPath) {
  const root = await getRepoRoot(repoPath);
  const { shPath, cmdPath } = getHookPaths(root);
  for (const filePath of [shPath, cmdPath]) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (!content.includes(HOOK_MARKER)) continue;
    fs.rmSync(filePath, { force: true });
  }
  return { installed: false, repoPath: root };
}

async function getGuardStatus(repoPath) {
  const root = await getRepoRoot(repoPath);
  const { shPath, cmdPath } = getHookPaths(root);
  const shInstalled = fs.existsSync(shPath) && fs.readFileSync(shPath, "utf8").includes(HOOK_MARKER);
  const cmdInstalled = fs.existsSync(cmdPath) && fs.readFileSync(cmdPath, "utf8").includes(HOOK_MARKER);
  return {
    installed: shInstalled || cmdInstalled,
    shellHookInstalled: shInstalled,
    cmdHookInstalled: cmdInstalled,
    repoPath: root,
    hookPath: shInstalled ? shPath : cmdInstalled ? cmdPath : shPath,
  };
}

async function getStagedFiles(repoPath) {
  const { stdout } = await runGit(repoPath, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !IGNORE_PATTERNS.some((pattern) => file.replace(/\\/g, "/").includes(pattern)));
}

async function getStagedFileContent(repoPath, filePath) {
  try {
    const { stdout } = await runGit(repoPath, ["show", `:${filePath}`], { encoding: "buffer" });
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

async function writeStagedSnapshot(repoPath, files) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "securescan-guard-"));
  for (const file of files) {
    const content = await getStagedFileContent(repoPath, file);
    if (content == null) continue;
    const target = path.join(tempDir, file.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return tempDir;
}

function pickSourceMetadata(f) {
  return f.SourceMetadata || f.source_metadata || f.sourceMetadata || null;
}

function pickMetadataData(sm) {
  return sm?.Data || sm?.data || null;
}

function getFindingFileKey(f) {
  const sm = pickSourceMetadata(f);
  const data = pickMetadataData(sm);
  const fsMeta = data?.Filesystem || data?.filesystem || null;
  return (
    fsMeta?.file ||
    fsMeta?.filepath ||
    f.Path ||
    f.path ||
    f.file ||
    "unknown"
  )
    .toString()
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/");
}

function getFindingLine(f) {
  const sm = pickSourceMetadata(f);
  const data = pickMetadataData(sm);
  const fsMeta = data?.Filesystem || data?.filesystem || null;
  const value = fsMeta?.line ?? f.Line ?? f.line ?? "N/A";
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : "N/A";
}

function collectSecretNeedles(f) {
  const values = [f.Raw, f.raw, f.Secret, f.SecretString, f.raw_string, ...(Array.isArray(f.stringsFound) ? f.stringsFound : [])];
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== "Hidden");
}

function pickPrimarySecret(f) {
  const needles = collectSecretNeedles(f);
  return needles[0] || "Hidden";
}

function detectorIsEntropyOnly(f) {
  const label = `${f.DetectorName || f.detectorName || f.DetectorType || f.detectorType || f.Reason || f.reason || ""}`.toLowerCase();
  return label.includes("entropy");
}

async function analyzeCandidate(candidate) {
  const text = String(candidate || "").trim();
  if (!text || text === "Hidden" || text.length < 6) return null;

  try {
    if (typeof fetch === "function") {
      const response = await fetch(AI_ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      if (!response.ok) return null;
      return await response.json();
    }
  } catch {}

  try {
    const target = new URL(AI_ANALYZE_URL);
    const client = target.protocol === "http:" ? http : https;
    const data = await new Promise((resolve) => {
      const request = client.request(
        target,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": Buffer.byteLength(text),
          },
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            try {
              resolve(response.statusCode >= 200 && response.statusCode < 300 ? JSON.parse(body) : null);
            } catch {
              resolve(null);
            }
          });
        }
      );
      request.on("error", () => resolve(null));
      request.write(text);
      request.end();
    });
    return data;
  } catch {
    return null;
  }
}

async function runTrufflehog(scanPath) {
  try {
    const { stdout } = await execFileAsync("trufflehog", ["--json", `file://${scanPath}`], {
      maxBuffer: 1024 * 1024 * 60,
      timeout: 1000 * 60 * 5,
    });
    return safeParseJson(stdout);
  } catch (error) {
    return safeParseJson(error.stdout || "");
  }
}

async function scanStagedChanges(repoPath) {
  const root = await getRepoRoot(repoPath);
  const stagedFiles = await getStagedFiles(root);
  if (stagedFiles.length === 0) {
    return { repoPath: root, stagedFiles: [], findings: [], blocked: false };
  }

  const snapshotPath = await writeStagedSnapshot(root, stagedFiles);
  try {
    const findings = await runTrufflehog(snapshotPath);
    const filtered = [];

    for (const finding of findings) {
      const detector = finding.DetectorName || finding.detectorName || finding.DetectorType || finding.detectorType || "Secret";
      const secret = pickPrimarySecret(finding);

      if (detectorIsEntropyOnly(finding)) {
        const ai = await analyzeCandidate(secret);
        if (!ai?.ai_analysis?.is_secret) continue;
      }

      filtered.push({
        file: getFindingFileKey(finding),
        line: getFindingLine(finding),
        type: detector,
        secret,
      });
    }

    return {
      repoPath: root,
      stagedFiles,
      findings: filtered,
      blocked: filtered.length > 0,
    };
  } finally {
    try {
      fs.rmSync(snapshotPath, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = {
  installGuard,
  uninstallGuard,
  getGuardStatus,
  scanStagedChanges,
  HOOK_MARKER,
};
