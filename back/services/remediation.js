const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const util = require("util");
const { execFile } = require("child_process");

const execFileAsync = util.promisify(execFile);
const SESSION_TTL_MS = 1000 * 60 * 60;
const sessions = new Map();

function now() {
  return Date.now();
}

function touchSession(session) {
  session.updatedAt = now();
  return session;
}

function cleanupExpiredSessions() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [sessionId, session] of sessions.entries()) {
    if ((session.updatedAt || session.createdAt || 0) > cutoff) continue;
    try {
      if (session.repoPath && fs.existsSync(session.repoPath)) {
        fs.rmSync(session.repoPath, { recursive: true, force: true });
      }
    } catch {}
    sessions.delete(sessionId);
  }
}

setInterval(cleanupExpiredSessions, 1000 * 60 * 10).unref?.();

function createSession({ repoPath, sourceType, repoUrl = null, branch = null, results = null }) {
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    repoPath,
    sourceType,
    repoUrl,
    branch,
    results,
    createdAt: now(),
    updatedAt: now(),
    lastCommitSha: null,
    lastBranchName: null,
    lastAppliedPatches: [],
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(String(sessionId));
  if (!session) return null;
  if (!session.repoPath || !fs.existsSync(session.repoPath)) {
    sessions.delete(String(sessionId));
    return null;
  }
  return touchSession(session);
}

function updateSessionResults(sessionId, results) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.results = results;
  return touchSession(session);
}

function closeSession(sessionId) {
  const session = sessions.get(String(sessionId));
  if (!session) return;
  try {
    if (session.repoPath && fs.existsSync(session.repoPath)) {
      fs.rmSync(session.repoPath, { recursive: true, force: true });
    }
  } catch {}
  sessions.delete(String(sessionId));
}

function sessionMeta(session) {
  return {
    sessionId: session.sessionId,
    sourceType: session.sourceType,
    patchable: true,
    canCommit: session.sourceType === "git",
    canPush: session.sourceType === "git",
    repoUrl: session.repoUrl || null,
    lastCommitSha: session.lastCommitSha || null,
    lastBranchName: session.lastBranchName || null,
  };
}

function listFindingsFromResults(results) {
  const out = [];
  const vulnerabilities = results?.vulnerabilities || {};
  for (const [file, secrets] of Object.entries(vulnerabilities)) {
    secrets.forEach((secret, index) => {
      out.push({
        file,
        secret: secret.secret,
        type: secret.type,
        line: secret.line,
        commit: secret.commit,
        branch: secret.branch,
        findingKey: `${file}#${index}`,
      });
    });
  }
  return out;
}

function normalizeLineNumber(value) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function secretVariants(secret) {
  const s = String(secret || "");
  const out = new Set();
  if (s) out.add(s);
  if (s.includes("\\n")) out.add(s.replace(/\\n/g, "\n"));
  if (s.includes("\\r\\n")) out.add(s.replace(/\\r\\n/g, "\n"));
  return Array.from(out).filter(Boolean);
}

function resolveRepoFile(repoRoot, relativeFile) {
  const normalizedRoot = path.resolve(repoRoot);
  const target = path.resolve(repoRoot, String(relativeFile || "").replace(/\//g, path.sep));
  const relative = path.relative(normalizedRoot, target);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }
  return null;
}

function findLineIndex(lines, finding) {
  const variants = secretVariants(finding.secret);
  const directLine = normalizeLineNumber(finding.line);
  if (directLine && directLine >= 1 && directLine <= lines.length) {
    const line = lines[directLine - 1] || "";
    if (!variants.length || variants.some((variant) => line.includes(variant))) {
      return directLine - 1;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (variants.some((variant) => lines[i].includes(variant))) return i;
  }
  return directLine ? Math.max(0, Math.min(lines.length - 1, directLine - 1)) : -1;
}

function isEnvFile(filePath) {
  const base = path.basename(filePath);
  return base === ".env" || base.startsWith(".env.");
}

function sanitizeEnvBase(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function inferEnvName({ finding, lineText = "", filePath = "" }) {
  const haystack = `${finding.type} ${filePath} ${lineText}`.toLowerCase();
  if (haystack.includes("mongo")) return "MONGODB_URI";
  if (haystack.includes("jwt")) return "JWT_SECRET";
  if (haystack.includes("openai")) return "OPENAI_API_KEY";
  if (haystack.includes("gemini")) return "GEMINI_API_KEY";
  if (haystack.includes("firebase")) return "FIREBASE_API_KEY";
  if (haystack.includes("aws")) return "AWS_ACCESS_KEY_ID";
  if (haystack.includes("github")) return "GITHUB_TOKEN";
  if (haystack.includes("slack")) return "SLACK_BOT_TOKEN";
  if (haystack.includes("stripe")) return "STRIPE_SECRET_KEY";

  const fileBase = sanitizeEnvBase(path.basename(filePath, path.extname(filePath)));
  const detectorBase = sanitizeEnvBase(finding.type || "SECRET");
  return `${fileBase || "APP"}_${detectorBase || "SECRET"}_VALUE`;
}

function isFrontendFile(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/client/") || normalized.startsWith("client/");
}

function envReferenceFor(filePath, envName) {
  if (isFrontendFile(filePath)) {
    const finalName = envName.startsWith("VITE_") ? envName : `VITE_${envName}`;
    return { envName: finalName, reference: `import.meta.env.${finalName}` };
  }
  return { envName, reference: `process.env.${envName}` };
}

function quoteCandidates(secret) {
  const variants = secretVariants(secret);
  const out = [];
  for (const variant of variants) {
    out.push(JSON.stringify(variant));
    out.push(`'${String(variant).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    out.push(`\`${String(variant).replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``);
    out.push(String(variant));
  }
  return Array.from(new Set(out));
}

function replaceLiteralWithEnv(line, secret, reference) {
  for (const candidate of quoteCandidates(secret)) {
    if (!candidate) continue;
    if (line.includes(candidate)) {
      return line.replace(candidate, reference);
    }
  }
  const variants = secretVariants(secret);
  for (const variant of variants) {
    if (line.includes(variant)) return line.replace(variant, reference);
  }
  return line;
}

function previewPatchForFinding(repoRoot, finding) {
  const absPath = resolveRepoFile(repoRoot, finding.file);
  if (!absPath || !fs.existsSync(absPath)) {
    return {
      ...finding,
      status: "error",
      reason: "File no longer exists in the remediation workspace.",
    };
  }

  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return {
      ...finding,
      status: "error",
      reason: "Unable to read this file as UTF-8 text.",
    };
  }

  const lines = content.split(/\r?\n/);
  const lineIndex = findLineIndex(lines, finding);
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      ...finding,
      status: "error",
      reason: "Unable to locate a stable line for this finding.",
    };
  }

  const oldLine = lines[lineIndex] || "";
  if (isEnvFile(finding.file)) {
    const envKey = oldLine.includes("=")
      ? oldLine.slice(0, oldLine.indexOf("=")).trim() || inferEnvName({ finding, lineText: oldLine, filePath: finding.file })
      : inferEnvName({ finding, lineText: oldLine, filePath: finding.file });
    return {
      ...finding,
      line: lineIndex + 1,
      oldLine,
      newLine: `${envKey}=`,
      envName: envKey,
      reference: "value removed from tracked env file",
      status: "ready",
    };
  }

  const inferredName = inferEnvName({ finding, lineText: oldLine, filePath: finding.file });
  const { envName, reference } = envReferenceFor(finding.file, inferredName);
  const newLine = replaceLiteralWithEnv(oldLine, finding.secret, reference);
  if (newLine === oldLine) {
    return {
      ...finding,
      line: lineIndex + 1,
      oldLine,
      newLine,
      envName,
      reference,
      status: "error",
      reason: "Patch agent could not rewrite this line safely.",
    };
  }

  return {
    ...finding,
    line: lineIndex + 1,
    oldLine,
    newLine,
    envName,
    reference,
    status: "ready",
  };
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.file}|${finding.line}|${finding.type}|${finding.secret}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchTargetFindings(session, payload = {}) {
  const allFindings = uniqueFindings(listFindingsFromResults(session.results));
  if (payload.applyAll || payload.all) return allFindings;
  const target = payload.finding || payload;
  if (!target?.file) return [];
  return allFindings.filter((finding) => {
    if (String(finding.file) !== String(target.file)) return false;
    if (target.type && String(finding.type) !== String(target.type)) return false;
    if (target.secret && String(finding.secret) !== String(target.secret)) return false;
    const targetLine = normalizeLineNumber(target.line);
    const findingLine = normalizeLineNumber(finding.line);
    if (targetLine && findingLine && targetLine !== findingLine) return false;
    return true;
  });
}

function previewPatches(session, payload = {}) {
  const findings = matchTargetFindings(session, payload);
  const previews = findings.map((finding) => previewPatchForFinding(session.repoPath, finding));
  session.lastAppliedPatches = previews;
  touchSession(session);
  return previews;
}

function ensureEnvExample(repoRoot, envNames) {
  if (!envNames.length) return [];
  const filePath = path.join(repoRoot, ".env.example");
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  }
  const existing = new Set(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim())
      .filter(Boolean)
  );
  const appended = [];
  for (const envName of envNames) {
    if (existing.has(envName)) continue;
    lines.push(`${envName}=`);
    existing.add(envName);
    appended.push(envName);
  }
  fs.writeFileSync(filePath, `${lines.filter((line, index, arr) => !(index === arr.length - 1 && line === "")).join("\n")}\n`, "utf8");
  return appended;
}

function ensureGitIgnore(repoRoot) {
  const filePath = path.join(repoRoot, ".gitignore");
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  }
  const needed = ["**/.env", "**/.env.local"];
  let changed = false;
  for (const entry of needed) {
    if (lines.includes(entry)) continue;
    lines.push(entry);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePath, `${lines.filter((line, index, arr) => !(index === arr.length - 1 && line === "")).join("\n")}\n`, "utf8");
  }
  return changed;
}

function ensureDotenvBootstrap(absPath) {
  let content = fs.readFileSync(absPath, "utf8");
  if (/dotenv\/config|dotenv"\)\.config|dotenv'\)\.config/.test(content)) return false;
  if (/^\s*import\s/m.test(content)) {
    content = `import "dotenv/config";\n${content}`;
  } else {
    content = `require("dotenv").config();\n${content}`;
  }
  fs.writeFileSync(absPath, content, "utf8");
  return true;
}

function applyPatches(session, payload = {}) {
  const previews = previewPatches(session, payload);
  const ready = previews.filter((preview) => preview.status === "ready");
  const changedFiles = new Set();
  const serverFilesNeedingEnv = new Set();

  for (const preview of ready) {
    const absPath = resolveRepoFile(session.repoPath, preview.file);
    if (!absPath || !fs.existsSync(absPath)) continue;
    const lines = fs.readFileSync(absPath, "utf8").split(/\r?\n/);
    const idx = findLineIndex(lines, preview);
    if (idx < 0 || idx >= lines.length) continue;
    lines[idx] = preview.newLine;
    fs.writeFileSync(absPath, `${lines.join("\n")}\n`, "utf8");
    changedFiles.add(preview.file);
    if (!isFrontendFile(preview.file) && !isEnvFile(preview.file) && String(preview.reference).startsWith("process.env.")) {
      serverFilesNeedingEnv.add(absPath);
    }
  }

  for (const absPath of serverFilesNeedingEnv) {
    ensureDotenvBootstrap(absPath);
    changedFiles.add(path.relative(session.repoPath, absPath).replace(/\\/g, "/"));
  }

  const envNames = ready.map((preview) => preview.envName).filter(Boolean);
  ensureEnvExample(session.repoPath, envNames);
  ensureGitIgnore(session.repoPath);

  session.lastAppliedPatches = previews;
  touchSession(session);
  return { previews, changedFiles: Array.from(changedFiles), envNames };
}

async function getGitDiff(session) {
  if (session.sourceType !== "git") return "";
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--no-ext-diff", "--unified=3"], {
      cwd: session.repoPath,
      maxBuffer: 1024 * 1024 * 10,
    });
    return stdout || "";
  } catch (error) {
    return error.stdout || "";
  }
}

async function ensureGitIdentity(repoPath) {
  try {
    const { stdout: currentName } = await execFileAsync("git", ["config", "--get", "user.name"], { cwd: repoPath });
    if (!String(currentName || "").trim()) {
      await execFileAsync("git", ["config", "user.name", "SecureScan Bot"], { cwd: repoPath });
    }
  } catch {
    await execFileAsync("git", ["config", "user.name", "SecureScan Bot"], { cwd: repoPath });
  }

  try {
    const { stdout: currentEmail } = await execFileAsync("git", ["config", "--get", "user.email"], { cwd: repoPath });
    if (!String(currentEmail || "").trim()) {
      await execFileAsync("git", ["config", "user.email", "securescan-bot@example.local"], { cwd: repoPath });
    }
  } catch {
    await execFileAsync("git", ["config", "user.email", "securescan-bot@example.local"], { cwd: repoPath });
  }
}

function normalizeRemoteForToken(remoteUrl, token) {
  const trimmed = String(remoteUrl || "").trim();
  if (!trimmed) return null;
  const encodedToken = encodeURIComponent(String(token || "").trim());
  if (!encodedToken) return null;

  if (/^git@github\.com:/i.test(trimmed)) {
    const repo = trimmed.replace(/^git@github\.com:/i, "");
    return `https://x-access-token:${encodedToken}@github.com/${repo}`;
  }
  if (/^https:\/\/github\.com\//i.test(trimmed)) {
    return trimmed.replace(/^https:\/\//i, `https://x-access-token:${encodedToken}@`);
  }
  return null;
}

function sanitizeSensitiveText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/https:\/\/x-access-token:[^@]+@github\.com\//gi, "https://x-access-token:[REDACTED]@github.com/")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]");
}

async function commitSession(session, payload = {}) {
  if (session.sourceType !== "git") {
    throw new Error("Commit and push are only available for Git repository scans.");
  }

  const branchName = (payload.branchName || `secure/fix-secrets-${new Date().toISOString().slice(0, 10)}`).trim();
  const commitMessage = (payload.commitMessage || "fix(secrets): move hardcoded secrets to environment variables").trim();
  await ensureGitIdentity(session.repoPath);

  const { stdout: statusBefore } = await execFileAsync("git", ["status", "--porcelain"], { cwd: session.repoPath });
  if (!String(statusBefore || "").trim()) {
    throw new Error("There are no remediation changes to commit yet.");
  }

  await execFileAsync("git", ["checkout", "-B", branchName], { cwd: session.repoPath });
  await execFileAsync("git", ["add", "--all"], { cwd: session.repoPath });
  await execFileAsync("git", ["commit", "-m", commitMessage], { cwd: session.repoPath, maxBuffer: 1024 * 1024 * 10 });

  const { stdout: shaStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.repoPath });
  const commitSha = String(shaStdout || "").trim();
  session.lastCommitSha = commitSha || null;
  session.lastBranchName = branchName;
  touchSession(session);

  let pushed = false;
  if (payload.push) {
    if (!payload.githubToken) {
      throw new Error("GitHub token is required to push the remediation branch.");
    }
    const { stdout: remoteStdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: session.repoPath });
    const authedRemote = normalizeRemoteForToken(remoteStdout, payload.githubToken);
    if (!authedRemote) {
      throw new Error("Only HTTPS or git@github.com remotes can be pushed automatically.");
    }
    try {
      await execFileAsync("git", ["push", "-u", authedRemote, `HEAD:refs/heads/${branchName}`], {
        cwd: session.repoPath,
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (error) {
      const stderr = sanitizeSensitiveText(error?.stderr || "");
      const message = sanitizeSensitiveText(error?.message || "");
      const details = stderr || message || "GitHub rejected the push.";
      throw new Error(`GitHub push failed. ${details}`);
    }
    pushed = true;
  }

  return {
    commitSha,
    branchName,
    pushed,
    commitMessage,
  };
}

async function rollbackSession(session, payload = {}) {
  if (session.sourceType !== "git") {
    throw new Error("Rollback is only available for Git repository scans.");
  }
  const targetSha = String(payload.commitSha || session.lastCommitSha || "").trim();
  if (!targetSha) {
    throw new Error("There is no remediation commit available to roll back.");
  }
  await ensureGitIdentity(session.repoPath);
  await execFileAsync("git", ["revert", "--no-edit", targetSha], {
    cwd: session.repoPath,
    maxBuffer: 1024 * 1024 * 10,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: session.repoPath });
  const revertSha = String(stdout || "").trim();
  session.lastCommitSha = null;
  touchSession(session);
  return { revertedCommitSha: targetSha, revertSha };
}

module.exports = {
  createSession,
  getSession,
  updateSessionResults,
  closeSession,
  sessionMeta,
  previewPatches,
  applyPatches,
  getGitDiff,
  commitSession,
  rollbackSession,
};
