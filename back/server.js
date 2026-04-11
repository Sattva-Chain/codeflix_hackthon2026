// server.js
const express = require("express");
const multer = require("multer");
const { execFile } = require("child_process");
const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");
const util = require("util");
const cors = require("cors");
const mongoose = require("mongoose");
const router = require("./routes/user");
const { default: user } = require("./models/user");
const { default: comp } = require("./models/company");

const execFileAsync = util.promisify(execFile);
const app = express();
const PORT = 3000;
const bundledTrufflehogPath = path.resolve(__dirname, "../electronjs/bin/trufflehog-win.exe");
const trufflehogCommand =
  process.env.TRUFFLEHOG_PATH ||
  (process.platform === "win32" && fs.existsSync(bundledTrufflehogPath)
    ? bundledTrufflehogPath
    : "trufflehog");
const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://kr551344:o43CV2CxzEyrBKVj@cluster0.iabyjku.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Electron (file://) and some clients send no Origin or Origin: null — allow them to reach the API.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === "null") return callback(null, true);
      if (origin.startsWith("file://")) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

app.use("/api", router);

// Upload + Temp
const uploadDir = path.join(__dirname, "uploads");
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });
app.get("/userdata",async(req,res)=>{
  const data = await user.find({})
  console.log(data)
  const data2 = await comp.find({})
  console.log(data2)
  return res.json({
    success:"data"
  })
})
function safeParseJson(lines) {
  const results = [];
  if (!lines) return results;
  lines.split("\n").forEach((line) => {
    if (!line.trim()) return;
    try {
      results.push(JSON.parse(line));
    } catch {}
  });
  return results;
}

// ✅ IGNORE PATTERNS (Active Filtering)
const ignorePatterns = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "node_modules",
  "dist",
  "build",
  ".git",
  ".env.example",
  "README.md",
  "client/public/vite.svg"
];

async function runTrufflehog(scanPath) {
  const args = ["--json", `file://${scanPath}`];
  try {
    const { stdout } = await execFileAsync(trufflehogCommand, args, {
      maxBuffer: 1024 * 1024 * 80,
      timeout: 1000 * 60 * 10,
    });
    return safeParseJson(stdout);
  } catch (error) {
    const parsed = safeParseJson(error.stdout || "");
    if (parsed.length) return parsed;
    if (error.code === "ENOENT") {
      throw new Error(
        `TruffleHog executable not found. Set TRUFFLEHOG_PATH or place the binary at ${bundledTrufflehogPath}.`
      );
    }
    throw new Error(error.stderr || error.message || "TruffleHog scan failed");
  }
}

function pickSourceMetadata(f) {
  return f.SourceMetadata || f.source_metadata || f.sourceMetadata || null;
}

function pickMetadataData(sm) {
  if (!sm) return null;
  return sm.Data || sm.data || null;
}

function pickFilesystem(data) {
  if (!data) return null;
  return data.Filesystem || data.filesystem || null;
}

function pickGit(data) {
  if (!data) return null;
  return data.Git || data.git || null;
}

/** Stable repo-relative path (forward slashes) for grouping in the API. */
function getFindingFileKey(f) {
  const sm = pickSourceMetadata(f);
  const data = pickMetadataData(sm);
  const fsMeta = pickFilesystem(data);
  const gitMeta = pickGit(data);
  const raw =
    (fsMeta?.file != null && String(fsMeta.file)) ||
    (fsMeta?.filepath != null && String(fsMeta.filepath)) ||
    (fsMeta?.path != null && String(fsMeta.path)) ||
    (gitMeta?.file != null && String(gitMeta.file)) ||
    (gitMeta?.filepath != null && String(gitMeta.filepath)) ||
    (f.Path != null && String(f.Path)) ||
    (f.path != null && String(f.path)) ||
    (sm?.File != null && String(sm.File)) ||
    (sm?.file != null && String(sm.file)) ||
    (f.file != null && String(f.file)) ||
    "unknown";
  return raw
    .replace(/^file:\/\//i, "")
    .trim()
    .replace(/\\/g, "/");
}

function normalizeLineValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") {
    const n = v.line ?? v.Line ?? v.number;
    if (n !== undefined && n !== null) return n;
    return null;
  }
  return v;
}

function pluckLineFromExtra(extra) {
  if (!extra || typeof extra !== "object") return null;
  const cand =
    extra.line ??
    extra.Line ??
    extra.lineNumber ??
    extra.LineNumber ??
    (typeof extra.location === "object" && (extra.location.line ?? extra.location.Line));
  if (cand === undefined || cand === null) return null;
  const n = parseInt(String(cand), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pluckFileFromExtra(extra) {
  if (!extra || typeof extra !== "object") return null;
  const s =
    extra.file ??
    extra.File ??
    extra.path ??
    extra.Path ??
    extra.filepath ??
    extra.filePath;
  if (s == null) return null;
  const str = String(s).trim();
  return str.length ? str.replace(/\\/g, "/") : null;
}

function getFindingLine(f) {
  const sm = pickSourceMetadata(f);
  const data = pickMetadataData(sm);
  const fsMeta = pickFilesystem(data);
  const gitMeta = pickGit(data);
  const extra = f.ExtraData || f.extraData || f.StructuredData || f.structuredData;

  const fromExtra = pluckLineFromExtra(extra);
  if (fromExtra != null) return fromExtra;

  const v =
    normalizeLineValue(fsMeta?.line) ??
    normalizeLineValue(gitMeta?.line) ??
    normalizeLineValue(f.Line) ??
    normalizeLineValue(f.line) ??
    normalizeLineValue(sm?.Line) ??
    normalizeLineValue(sm?.line);

  if (v === undefined || v === null) return "N/A";
  const n = parseInt(String(v), 10);
  if (Number.isFinite(n) && n > 0) return n;
  if (typeof v === "string" && v.trim() && v !== "0") return v;
  return "N/A";
}

/** Resolve path inside repo only (blocks path traversal). Uses real paths on disk (Windows-safe). */
function resolveSafeRepoFile(repoPath, fileKey) {
  if (!repoPath || !fileKey || fileKey === "unknown") return null;
  const cleaned = String(fileKey).replace(/^file:\/\//i, "").trim();
  const withSep = cleaned.split(/[/\\]/).join(path.sep);
  let rootNorm;
  try {
    rootNorm = fs.realpathSync(path.normalize(repoPath));
  } catch {
    rootNorm = path.normalize(repoPath);
  }
  let candidate = path.normalize(path.isAbsolute(withSep) ? withSep : path.join(rootNorm, withSep));
  try {
    candidate = fs.realpathSync(candidate);
  } catch {
    /* file missing */
  }
  const relFromRoot = path.relative(rootNorm, candidate);
  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) return null;
  if (!fs.existsSync(candidate)) return null;
  return candidate;
}

/** TruffleHog Raw often differs slightly from disk (quotes, escapes); try several forms. */
function collectNeedleVariants(secret) {
  const s = String(secret);
  const out = [];
  const add = (x) => {
    if (typeof x !== "string") return;
    const t = x.trim();
    if (t.length < 3) return;
    if (!out.includes(t)) out.push(t);
  };
  add(s);
  let q = s.trim();
  add(q);
  for (let i = 0; i < 5; i++) {
    const dq = q.startsWith('"') && q.endsWith('"');
    const sq = q.startsWith("'") && q.endsWith("'");
    const bt = q.startsWith("`") && q.endsWith("`");
    if (dq || sq || bt) {
      q = q.slice(1, -1);
      add(q);
      q = q.trim();
      add(q);
    } else break;
  }
  add(s.replace(/\\n/g, "\n").trim());
  add(s.replace(/\\r\\n/g, "\n").trim());
  return out;
}

/**
 * Locate the line index for a secret using substring variants and .env KEY=value rules.
 */
function findSecretLine(lines, fullText, secret) {
  const text = fullText.startsWith("\uFEFF") ? fullText.slice(1) : fullText;
  const variants = collectNeedleVariants(secret);

  for (const needle of variants) {
    if (!text.includes(needle)) continue;
    const idx = lines.findIndex((ln) => ln.includes(needle));
    if (idx >= 0) return { idx, needle };
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || /^\s*#/.test(ln)) continue;
    const eq = ln.indexOf("=");
    if (eq === -1) continue;
    const rhs = ln.slice(eq + 1).trim();
    const rhsBare = rhs.replace(/^["'`]|["'`]$/g, "").trim();
    for (const needle of variants) {
      if (
        rhs === needle ||
        rhsBare === needle ||
        rhs.includes(needle) ||
        rhsBare.includes(needle)
      ) {
        return { idx: i, needle };
      }
    }
  }

  return null;
}

function readSnippetFromAbsoluteFile(absPath, lineNum, rawSecret, contextLines) {
  let content;
  try {
    const buf = fs.readFileSync(absPath);
    if (buf.includes(0)) return null;
    content = buf.toString("utf8");
  } catch {
    return null;
  }

  const lines = content.split(/\r?\n/);
  let targetIdx = -1;

  if (lineNum != null && Number.isFinite(lineNum) && lineNum >= 1 && lineNum <= lines.length) {
    targetIdx = lineNum - 1;
  } else if (rawSecret && String(rawSecret).length >= 3) {
    const hit = findSecretLine(lines, content, rawSecret);
    if (hit) targetIdx = hit.idx;
  }

  if (targetIdx < 0) return null;

  const start = Math.max(0, targetIdx - contextLines);
  const end = Math.min(lines.length, targetIdx + contextLines + 1);
  const snippetLines = [];
  for (let i = start; i < end; i++) {
    snippetLines.push({ num: i + 1, text: lines[i] });
  }
  return { lines: snippetLines, highlightLine: targetIdx + 1 };
}

/**
 * Real source lines around the finding (like GitHub secret scanning).
 * Tries full path, then strips leading segments (ZIPs often add one root folder).
 */
function buildCodeSnippet(repoPath, fileKey, lineNum, rawSecret, contextLines = 5) {
  const keysToTry = [];
  const norm = String(fileKey).replace(/\\/g, "/").trim();
  if (norm && norm !== "unknown") keysToTry.push(norm);
  const parts = norm.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    keysToTry.push(parts.slice(i).join("/"));
  }

  for (const key of keysToTry) {
    const abs = resolveSafeRepoFile(repoPath, key);
    if (abs) {
      const snip = readSnippetFromAbsoluteFile(abs, lineNum, rawSecret, contextLines);
      if (snip) return snip;
    }
  }
  return null;
}

const WALK_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  "venv",
  ".venv",
  "target",
]);

/**
 * Fast pass: only open files whose basename matches TruffleHog's reported path
 * (e.g. many `.env` / `firebase.ts` copies under different folders).
 */
function assignSnippetsBasenamePass(repoRoot, pendingRows) {
  const stillNeed = pendingRows.filter(
    (r) => !r.snippet && r.file && r.file !== "unknown" && r.secret.length >= 3 && r.secret !== "Hidden"
  );
  if (!stillNeed.length) return;

  let realRoot;
  try {
    realRoot = fs.realpathSync(path.normalize(repoRoot));
  } catch {
    realRoot = path.normalize(repoRoot);
  }

  const byBase = new Map();
  for (const row of stillNeed) {
    const base = path.posix.basename(String(row.file).replace(/\\/g, "/"));
    if (!base) continue;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }
  if (!byBase.size) return;

  function relUnixFromAbs(absPath) {
    try {
      const rel = path.relative(realRoot, absPath);
      if (rel.startsWith("..")) return null;
      return rel.split(path.sep).join("/");
    } catch {
      return null;
    }
  }

  function shouldIgnoreRel(relUnix) {
    if (!relUnix) return true;
    return ignorePatterns.some((p) => relUnix.includes(p));
  }

  let filesChecked = 0;
  const MAX_FILES = 12000;
  const MAX_BYTES = 2 * 1024 * 1024;

  function tryFile(absPath) {
    if (filesChecked >= MAX_FILES) return;
    const relUnix = relUnixFromAbs(absPath);
    if (!relUnix || shouldIgnoreRel(relUnix)) return;
    const base = path.posix.basename(relUnix);
    const rows = byBase.get(base);
    if (!rows?.length) return;

    let st;
    try {
      st = fs.statSync(absPath);
    } catch {
      return;
    }
    if (!st.isFile() || st.size > MAX_BYTES) return;

    let buf;
    try {
      buf = fs.readFileSync(absPath);
    } catch {
      return;
    }
    if (buf.includes(0)) return;

    filesChecked++;
    const text = buf.toString("utf8");
    const lines = text.split(/\r?\n/);

    for (const row of rows) {
      if (row.snippet) continue;
      const hit = findSecretLine(lines, text, row.secret);
      if (!hit) continue;
      row.line = hit.idx + 1;
      row.file = relUnix;
      row.snippet = readSnippetFromAbsoluteFile(absPath, hit.idx + 1, row.secret, 5);
    }
  }

  function walk(dir) {
    if (filesChecked >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (filesChecked >= MAX_FILES) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (WALK_SKIP_DIRS.has(ent.name)) continue;
        walk(full);
      } else {
        if (!byBase.has(ent.name)) continue;
        tryFile(full);
      }
    }
  }

  walk(realRoot);
}

/**
 * When TruffleHog omits line/path (common for some detectors), scan text files once
 * and locate the raw secret string to fill line + VS Code snippet.
 */
function assignSnippetsByRepoWalk(repoRoot, pendingRows) {
  if (!pendingRows.length) return;

  let realRoot;
  try {
    realRoot = fs.realpathSync(path.normalize(repoRoot));
  } catch {
    realRoot = path.normalize(repoRoot);
  }

  function relUnixFromAbs(absPath) {
    try {
      const rel = path.relative(realRoot, absPath);
      if (rel.startsWith("..")) return null;
      return rel.split(path.sep).join("/");
    } catch {
      return null;
    }
  }

  function shouldIgnoreRel(relUnix) {
    if (!relUnix) return true;
    return ignorePatterns.some((p) => relUnix.includes(p));
  }

  let filesChecked = 0;
  const MAX_FILES = 16000;
  const MAX_BYTES = 2 * 1024 * 1024;

  function tryFile(absPath) {
    if (filesChecked >= MAX_FILES) return;
    const relUnix = relUnixFromAbs(absPath);
    if (!relUnix || shouldIgnoreRel(relUnix)) return;

    let st;
    try {
      st = fs.statSync(absPath);
    } catch {
      return;
    }
    if (!st.isFile() || st.size > MAX_BYTES) return;

    let buf;
    try {
      buf = fs.readFileSync(absPath);
    } catch {
      return;
    }
    if (buf.includes(0)) return;

    filesChecked++;
    const text = buf.toString("utf8");
    const lines = text.split(/\r?\n/);

    for (const row of pendingRows) {
      if (row.snippet) continue;
      if (!row.secret || row.secret.length < 3 || row.secret === "Hidden") continue;
      const hit = findSecretLine(lines, text, row.secret);
      if (!hit) continue;
      row.line = hit.idx + 1;
      row.file = relUnix;
      row.snippet = readSnippetFromAbsoluteFile(absPath, hit.idx + 1, row.secret, 5);
    }
  }

  function walk(dir) {
    if (filesChecked >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (filesChecked >= MAX_FILES) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (WALK_SKIP_DIRS.has(ent.name)) continue;
        walk(full);
      } else {
        tryFile(full);
      }
    }
  }

  walk(realRoot);
}

async function formatResults(findings = [], repoPath = null, isGitRepo = false) {
  if (!findings.length) {
    return { summary: { secretsFound: 0, filesWithSecrets: 0 }, vulnerabilities: {} };
  }

  const rows = [];

  for (const f of findings) {
    const sm = pickSourceMetadata(f);
    const extra = f.ExtraData || f.extraData;

    let file = getFindingFileKey(f);
    const exFile = pluckFileFromExtra(extra);
    if (exFile && (file === "unknown" || !file || file.length < 2)) {
      file = exFile.replace(/\\/g, "/");
    }

    const type =
      f.DetectorName ||
      f.detectorName ||
      f.DetectorType ||
      f.detectorType ||
      f.Reason ||
      f.reason ||
      f.Rule ||
      f.rule ||
      "Secret";
    const secret =
      f.Raw ||
      f.raw ||
      f.Secret ||
      (Array.isArray(f.stringsFound) && f.stringsFound.join(", ")) ||
      f.SecretString ||
      f.raw_string ||
      "Hidden";

    let line = getFindingLine(f);
    let commit =
      f.Commit ||
      f.commit ||
      (sm && (sm.Commit || sm.commit)) ||
      "N/A";
    const branch = "N/A";

    const parsedLine = parseInt(String(line), 10);
    let lineForSnippet = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;

    let snippet = repoPath
      ? buildCodeSnippet(repoPath, file, lineForSnippet, String(secret))
      : null;

    if (snippet && (String(line) === "N/A" || lineForSnippet == null)) {
      line = snippet.highlightLine;
      lineForSnippet = snippet.highlightLine;
    }

    rows.push({
      file,
      type,
      secret: String(secret),
      line,
      commit,
      branch,
      snippet,
    });
  }

  if (repoPath) {
    const pending = rows.filter(
      (r) => !r.snippet && r.secret.length >= 3 && r.secret !== "Hidden"
    );
    assignSnippetsBasenamePass(repoPath, pending);
    assignSnippetsByRepoWalk(
      repoPath,
      pending.filter((r) => !r.snippet)
    );
  }

  const vulnerabilities = {};
  const fileSet = new Set();
  let total = 0;

  for (const r of rows) {
    if (!vulnerabilities[r.file]) vulnerabilities[r.file] = [];
    vulnerabilities[r.file].push({
      secret: r.secret,
      type: r.type,
      line: r.line,
      commit: r.commit,
      branch: r.branch,
      snippet: r.snippet,
    });
    fileSet.add(r.file);
    total++;
  }

  return { summary: { secretsFound: total, filesWithSecrets: fileSet.size }, vulnerabilities };
}

// ✅ Repo URL Scan
app.post("/scan-url", async (req, res) => {
  const repoURL = (req.body.url || "").trim();
  if (!repoURL) return res.status(400).json({ error: true, message: "URL required" });

  const clonePath = path.join(tempDir, `${Date.now()}-repo`);
  console.log("🔍 Scanning repo:", repoURL);

  try {
    await execFileAsync("git", ["clone", "--depth", "1", repoURL, clonePath]);
    console.log("✅ Repo cloned:", clonePath);

    let findings = await runTrufflehog(clonePath);

    // ✅ Filter ignored files
    findings = findings.filter((f) => {
      const file = getFindingFileKey(f);
      return !ignorePatterns.some((pattern) => file.includes(pattern));
    });

    const formatted = await formatResults(findings, clonePath, true);
    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  } finally {
    try { fs.rmSync(clonePath, { recursive: true, force: true }); } catch {}
  }
});

// ✅ ZIP File Scan
app.post("/scan-zip", upload.single("zipfile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: "ZIP file required" });

  const zipPath = req.file.path;
  const extractPath = path.join(tempDir, `${Date.now()}-zip`);

  try {
    fs.mkdirSync(extractPath, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extractPath);

    let findings = await runTrufflehog(extractPath);

    // ✅ Filter ignored files
    findings = findings.filter((f) => {
      const file = getFindingFileKey(f);
      return !ignorePatterns.some((pattern) => file.includes(pattern));
    });

    const formatted = await formatResults(findings, extractPath, false);
    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractPath, { recursive: true, force: true }); } catch {}
  }
});

app.listen(PORT, () => console.log(`🚀 Server running: http://localhost:${PORT}`));
