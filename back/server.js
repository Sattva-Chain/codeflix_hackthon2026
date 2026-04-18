// server.js
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: false });

const express = require("express");
const multer = require("multer");
const { execFile } = require("child_process");
const AdmZip = require("adm-zip");
const fs = require("fs");
const http = require("http");
const https = require("https");
const util = require("util");
const cors = require("cors");
const mongoose = require("mongoose");
const router = require("./routes/user");
const authRouter = require("./routes/auth");
const organizationRouter = require("./routes/organizations");
const { default: user } = require("./models/user");
const { default: comp } = require("./models/company");
const repoModule = require("./models/repo");
const { getGitBlameInfo, emptyBlameInfo } = require("./utils/gitBlame");
const { resolveAuthUserFromHeader } = require("./middleware/auth");
const { persistScanVulnerabilities } = require("./services/vulnerabilityPersistence");
const {
  createSession,
  getSession,
  updateSessionResults,
  sessionMeta,
  previewPatches,
  applyPatches,
  getGitDiff,
  buildSessionMeta,
  commitSession,
  rollbackSession,
} = require("./services/remediation");
const Repository = repoModule.default || repoModule;

const execFileAsync = util.promisify(execFile);
const app = express();
const PORT = 3000;

async function ensureRepositoryIndexes() {
  try {
    const indexes = await Repository.collection.indexes();
    const legacyGitUrlIndex = indexes.find(
      (index) => index.name === "gitUrl_1" && index.unique
    );

    if (legacyGitUrlIndex) {
      await Repository.collection.dropIndex("gitUrl_1");
      console.log("ℹ️ Dropped legacy repositories.gitUrl unique index");
    }

    await Repository.collection.createIndex(
      { userId: 1, gitUrl: 1 },
      { unique: true, name: "userId_1_gitUrl_1" }
    );
  } catch (error) {
    console.error("Failed to ensure repository indexes:", error.message);
  }
}

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
  .connect("mongodb+srv://kr551344_db_user:ErqBwOEVmaJC2oPF@cluster1.uelsejd.mongodb.net/?retryWrites=true&w=majority&appName=cluster1")
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await ensureRepositoryIndexes();
  })
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

app.use("/api", router);
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationRouter);

// Upload + Temp
const uploadDir = path.join(__dirname, "uploads");
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  fileName: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });
const AI_ANALYZE_URL = process.env.SECURE_SCAN_AI_URL || "https://secure-scan-ai-risk.onrender.com/analyze";
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

function shouldIgnoreGeneratedFile(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  if (!normalized) return true;

  if (ignorePatterns.some((pattern) => normalized.includes(String(pattern).toLowerCase()))) {
    return true;
  }

  if (/vite\.config\.[^/]*\.timestamp-\d+-[a-z0-9]+\.mjs$/i.test(normalized)) {
    return true;
  }

  if (/\.timestamp-\d+-[a-z0-9]+\.mjs$/i.test(normalized) && normalized.includes("vite.config")) {
    return true;
  }

  return false;
}

async function runTrufflehog(scanPath) {
  const args = ["--json", `file://${scanPath}`];
  try {
    const { stdout } = await execFileAsync("trufflehog", args, {
      maxBuffer: 1024 * 1024 * 80,
      timeout: 1000 * 60 * 10,
    });
    return safeParseJson(stdout);
  } catch (error) {
    return safeParseJson(error.stdout || "");
  }
}

async function analyzeCandidateWithAi(candidate) {
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
      const data = await response.json();
      if (!data || typeof data !== "object") return null;
      return data;
    }
  } catch {
  }

  try {
    const target = new URL(AI_ANALYZE_URL);
    const client = target.protocol === "http:" ? http : https;
    const payload = text;

    const data = await new Promise((resolve) => {
      const request = client.request(
        target,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        }
      );

      request.on("error", () => resolve(null));
      request.write(payload);
      request.end();
    });

    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
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

/**
 * All distinct substrings TruffleHog reported (never join with commas — that breaks in-file lookup).
 */
function collectSecretNeedles(f) {
  const out = [];
  const add = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) add(x);
      return;
    }
    const s = String(v).trim();
    if (s.length >= 3 && s !== "Hidden" && !out.includes(s)) out.push(s);
  };
  add(f.Raw);
  add(f.raw);
  add(f.Secret);
  add(f.SecretString);
  add(f.raw_string);
  add(f.stringsFound);
  return out;
}

/** One value for the table/PDF; prefer explicit Raw/Secret, else first stringsFound entry. */
function pickPrimarySecret(f, needles) {
  if (!needles.length) return "Hidden";
  for (const key of ["Raw", "raw", "Secret", "SecretString", "raw_string"]) {
    const v = f[key];
    if (v != null && String(v).trim().length >= 3) return String(v).trim();
  }
  if (Array.isArray(f.stringsFound) && f.stringsFound.length) {
    const first = String(f.stringsFound[0]).trim();
    if (first.length >= 3) return first;
  }
  return needles[0];
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferServiceFromFinding(finding, candidate) {
  const text = `${finding?.DetectorName || finding?.detectorName || finding?.DetectorType || finding?.detectorType || ""} ${candidate || ""}`.toLowerCase();
  if (text.includes("openai") || /^sk-[a-z0-9]/i.test(candidate || "")) return "OpenAI";
  if (text.includes("github") || /^(ghp_|github_pat_)/i.test(candidate || "")) return "GitHub";
  if (text.includes("redis") || /^redis(s)?:\/\//i.test(candidate || "")) return "Redis";
  if (text.includes("mongo") || /^mongodb(\+srv)?:\/\//i.test(candidate || "")) return "MongoDB";
  if (text.includes("firebase") || text.includes("google")) return "Google/Firebase";
  if (text.includes("aws") || /^akia/i.test(candidate || "")) return "AWS";
  if (text.includes("slack") || /^xox[baprs]-/i.test(candidate || "")) return "Slack";
  if (text.includes("stripe") || /^sk_(live|test)_/i.test(candidate || "")) return "Stripe";
  const detectorLabel =
    finding?.DetectorName || finding?.detectorName || finding?.DetectorType || finding?.detectorType || finding?.Reason || finding?.reason || "";
  return titleCaseWords(detectorLabel) || "Unknown";
}

function buildBackendConfidenceAnalysis(finding, candidate) {
  const text = String(candidate || "").trim();
  if (!text || text === "Hidden") return null;

  const entropyOnly = detectorIsEntropyOnly(finding);
  const service = inferServiceFromFinding(finding, text);
  let confidence = entropyOnly ? 0.62 : 0.9;
  let risk = entropyOnly ? 0.68 : 0.93;
  let reason = entropyOnly
    ? "Backend heuristic scored this high-entropy string from detector metadata and secret shape."
    : "Backend heuristic scored this detector hit as a likely real secret.";

  if (/^(redis(s)?:\/\/|mongodb(\+srv)?:\/\/)/i.test(text)) {
    confidence += 0.16;
    risk += 0.18;
    reason = "Backend detected a credential-bearing connection string.";
  } else if (/^(sk-[a-z0-9]|ghp_|github_pat_|xox[baprs]-|akia)/i.test(text)) {
    confidence += 0.18;
    risk += 0.16;
    reason = "Backend matched a strong provider-specific secret pattern.";
  } else if (text.length >= 24) {
    confidence += 0.08;
    risk += 0.06;
  }

  const lower = text.toLowerCase();
  if (/(example|sample|dummy|placeholder|test|localhost)/.test(lower)) {
    confidence -= 0.28;
    risk -= 0.32;
    reason = "Backend found placeholder-style text, so the score was reduced.";
  }

  confidence = Math.max(0.15, Math.min(0.99, confidence));
  risk = Math.max(0.1, Math.min(0.99, risk));

  return {
    ai_analysis: {
      is_secret: confidence >= 0.55,
      risk_score: Number(risk.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      reason,
      service,
    },
    source: "backend-heuristic",
    candidate: text,
  };
}

async function enrichFindingsWithAi(findings = []) {
  if (!Array.isArray(findings) || !findings.length) {
    return { findings, stats: { reviewed: 0, confirmed: 0, rejected: 0 } };
  }

  const enriched = [];
  let reviewed = 0;
  let confirmed = 0;
  let rejected = 0;

  for (const finding of findings) {
    const needles = collectSecretNeedles(finding);
    const candidate = pickPrimarySecret(finding, needles);
    const ai = (await analyzeCandidateWithAi(candidate)) || buildBackendConfidenceAnalysis(finding, candidate);
    if (ai) {
      reviewed++;
      if (ai.ai_analysis?.is_secret) {
        confirmed++;
      } else {
        rejected++;
        continue;
      }
      enriched.push({
        ...finding,
        ai_analysis: ai.ai_analysis || null,
        ai_source: ai.source || null,
        ai_candidate: ai.candidate || candidate,
      });
      continue;
    }
    enriched.push(finding);
  }

  return { findings: enriched, stats: { reviewed, confirmed, rejected } };
}

function rowNeedleList(row) {
  if (row.needles?.length) return row.needles;
  if (row.secret && row.secret !== "Hidden" && String(row.secret).length >= 3) return [row.secret];
  return [];
}

/** Try each needle until one maps to a source line (fixes High Entropy + stringsFound arrays). */
function findSecretLineMulti(lines, fullText, needles) {
  const list = Array.isArray(needles) ? needles : needles ? [needles] : [];
  for (const n of list) {
    if (n == null || String(n).length < 3) continue;
    const hit = findSecretLine(lines, fullText, String(n));
    if (hit) return hit;
  }
  for (const n of list) {
    const s = String(n).trim();
    const hex = s.replace(/[^a-f0-9]/gi, "");
    if (hex.length !== 24) continue;
    const lower = hex.toLowerCase();
    const idx = lines.findIndex((ln) => ln.toLowerCase().includes(lower));
    if (idx >= 0) return { idx, needle: s };
  }
  return null;
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

function detectorIsEntropyOnly(f) {
  const d = (
    f.DetectorName ??
    f.detectorName ??
    f.DetectorType ??
    f.detectorType ??
    f.Reason ??
    f.reason ??
    ""
  )
    .toString()
    .toLowerCase();
  return d.includes("entropy");
}

function isTestOrFixturePath(fileKey) {
  const f = String(fileKey).replace(/\\/g, "/").toLowerCase();
  return (
    /(^|\/)(tests?|__tests__|fixtures?|mocks?|testing)(\/|$)/.test(f) ||
    /(^|\/)test_[^/]+\.py$/.test(f) ||
    /(^|\/)[^/]+_test\.py$/.test(f) ||
    f.includes("conftest.py") ||
    f.endsWith("conftest.py")
  );
}

/** Route strings and Mongo-style IDs in paths are not API keys. */
function anyNeedleLooksLikeRouteOrSample(needles) {
  const list = Array.isArray(needles) ? needles : [];
  for (const n of list) {
    const s = String(n).trim();
    if (s.length < 8) continue;
    if (s.startsWith("/") && /\/[a-f0-9]{12,}/i.test(s)) return true;
    if (/\/admin\/|\/api\/|\/v\d+\//i.test(s)) return true;
    if (s.startsWith("/") && s.split("/").length >= 4 && /^\/[a-z0-9/_-]+$/i.test(s)) return true;
  }
  return false;
}

function contextSuggestsExampleOrTest(low, fileIsTestPath) {
  if (!low) return false;
  const strong =
    /json_schema|schema_extra|"example"|'example'|example\s*=|fixtures?|@pytest|unittest\.|parametrize/.test(low) ||
    /\bget_page_type\b/.test(low) ||
    /\bclass\s+config\b/.test(low) ||
    /\bmock\.|faker\.|factory\./.test(low);
  if (strong) return true;
  if (fileIsTestPath && /\bassert\s+/.test(low)) return true;
  return false;
}

function readSourceContextLower(repoPath, fileKey, lineVal, pad = 6) {
  const pl = parseInt(String(lineVal), 10);
  if (!repoPath || !fileKey || fileKey === "unknown" || !Number.isFinite(pl) || pl < 1) return "";
  const norm = String(fileKey).replace(/\\/g, "/").trim();
  const keysToTry = [];
  if (norm && norm !== "unknown") keysToTry.push(norm);
  const parts = norm.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) keysToTry.push(parts.slice(i).join("/"));
  for (const key of keysToTry) {
    const abs = resolveSafeRepoFile(repoPath, key);
    if (!abs) continue;
    try {
      const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
      const i = pl - 1;
      if (i < 0 || i >= lines.length) continue;
      const start = Math.max(0, i - pad);
      const end = Math.min(lines.length, i + pad + 1);
      return lines.slice(start, end).join("\n").toLowerCase();
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * High Entropy flags any random-looking string; drop obvious non-secrets (tests, URLs, schema examples).
 * Does not affect named detectors (AWS, GitHub, private keys, etc.).
 */
function shouldDropHighEntropyFalsePositive(f, repoPath) {
  if (!repoPath || !detectorIsEntropyOnly(f)) return false;

  const fileKey = getFindingFileKey(f);
  const needles = collectSecretNeedles(f);
  const primary =
    needles.length > 0 ? pickPrimarySecret(f, needles) : "Hidden";
  const lineVal = getFindingLine(f);
  const ctx = readSourceContextLower(repoPath, fileKey, lineVal, 6);

  const testPath = isTestOrFixturePath(fileKey);
  const routeLike = anyNeedleLooksLikeRouteOrSample(needles.length ? needles : primary !== "Hidden" ? [primary] : []);
  const exampleOrTestCtx = contextSuggestsExampleOrTest(ctx, testPath);

  if (exampleOrTestCtx) return true;
  if (testPath && routeLike) return true;

  const hexOnly = primary.replace(/[^a-f0-9]/gi, "");
  if (testPath && hexOnly.length === 24 && /^[a-f0-9]{24}$/i.test(hexOnly)) return true;

  const fLower = String(fileKey).replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(fLower);
  const apiSchemaFile =
    /^api[_v]/.test(base) ||
    /(routes|schemas|models|schema|openapi)/.test(fLower);

  if (apiSchemaFile && hexOnly.length === 24 && /^[a-f0-9]{24}$/i.test(hexOnly)) return true;
  if (apiSchemaFile && routeLike) return true;

  return false;
}

function filterEntropyFalsePositives(findings, repoPath) {
  if (!findings?.length || !repoPath) return findings;
  return findings.filter((f) => !shouldDropHighEntropyFalsePositive(f, repoPath));
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

function readSnippetFromAbsoluteFile(absPath, lineNum, needles, contextLines) {
  const needleList = Array.isArray(needles) ? needles : needles ? [needles] : [];

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
    const lineText = lines[lineNum - 1] ?? "";
    if (
      !needleList.length ||
      needleList.some((n) => n && lineText.includes(String(n)))
    ) {
      targetIdx = lineNum - 1;
    }
  }

  if (targetIdx < 0 && needleList.length) {
    const hit = findSecretLineMulti(lines, content, needleList);
    if (hit) targetIdx = hit.idx;
  }

  if (targetIdx < 0 && lineNum != null && Number.isFinite(lineNum) && lineNum >= 1 && lineNum <= lines.length) {
    targetIdx = lineNum - 1;
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
function buildCodeSnippet(repoPath, fileKey, lineNum, needles, contextLines = 5) {
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
      const snip = readSnippetFromAbsoluteFile(abs, lineNum, needles, contextLines);
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
    (r) => !r.snippet && r.file && r.file !== "unknown" && rowNeedleList(r).length > 0
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
    return shouldIgnoreGeneratedFile(relUnix);
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
      const hit = findSecretLineMulti(lines, text, rowNeedleList(row));
      if (!hit) continue;
      row.line = hit.idx + 1;
      row.file = relUnix;
      row.snippet = readSnippetFromAbsoluteFile(absPath, hit.idx + 1, rowNeedleList(row), 5);
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
    return shouldIgnoreGeneratedFile(relUnix);
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
      const needles = rowNeedleList(row);
      if (!needles.length) continue;
      const hit = findSecretLineMulti(lines, text, needles);
      if (!hit) continue;
      row.line = hit.idx + 1;
      row.file = relUnix;
      row.snippet = readSnippetFromAbsoluteFile(absPath, hit.idx + 1, needles, 5);
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

    const needles = collectSecretNeedles(f);
    const secret = pickPrimarySecret(f, needles);
    const needlesForSnippet =
      needles.length > 0 ? needles : secret !== "Hidden" ? [secret] : [];

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
      ? buildCodeSnippet(repoPath, file, lineForSnippet, needlesForSnippet)
      : null;

    if (snippet && (String(line) === "N/A" || lineForSnippet == null)) {
      line = snippet.highlightLine;
      lineForSnippet = snippet.highlightLine;
    }

    rows.push({
      file,
      type,
      secret: String(secret),
      needles: needlesForSnippet,
      line,
      commit,
      branch,
      snippet,
      aiAnalysis: f.ai_analysis || null,
      aiSource: f.ai_source || null,
      aiCandidate: f.ai_candidate || null,
    });
  }

  const blameCache = new Map();
  for (const row of rows) {
    const parsedLine = parseInt(String(row.line), 10);
    if (!isGitRepo || !repoPath || !row.file || row.file === "unknown" || !Number.isFinite(parsedLine) || parsedLine < 1) {
      Object.assign(row, emptyBlameInfo());
      continue;
    }

    const cacheKey = `${row.file}:${parsedLine}`;
    if (!blameCache.has(cacheKey)) {
      blameCache.set(cacheKey, getGitBlameInfo(row.file, parsedLine, repoPath));
    }

    try {
      Object.assign(row, await blameCache.get(cacheKey));
    } catch {
      Object.assign(row, emptyBlameInfo());
    }
  }

  if (repoPath) {
    const pending = rows.filter((r) => !r.snippet && rowNeedleList(r).length > 0);
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
      author: r.author,
      authorEmail: r.authorEmail || r.email,
      email: r.email,
      commitTime: r.commitTime,
      commitHash: r.commitHash,
      assignedTo: r.assignedTo,
      snippet: r.snippet,
      aiAnalysis: r.aiAnalysis,
      aiSource: r.aiSource,
      aiCandidate: r.aiCandidate,
    });
    fileSet.add(r.file);
    total++;
  }

  return { summary: { secretsFound: total, filesWithSecrets: fileSet.size }, vulnerabilities };
}

async function withRemediationMeta(formatted, session) {
  return {
    ...formatted,
    remediation: await buildSessionMeta(session),
  };
}

async function buildScanResponse(scanPath, isGitRepo, extraMeta = {}, persistenceContext = null) {
  let findings = await runTrufflehog(scanPath);
  findings = findings.filter((f) => {
    const file = getFindingFileKey(f);
    return !shouldIgnoreGeneratedFile(file);
  });
  findings = filterEntropyFalsePositives(findings, scanPath);

  const aiEnriched = await enrichFindingsWithAi(findings);
  const formatted = await formatResults(aiEnriched.findings, scanPath, isGitRepo);
  const resolvedBranch = extraMeta.branch || (isGitRepo ? await getGitBranchSafe(scanPath) : null);

  if (resolvedBranch && formatted?.vulnerabilities) {
    Object.values(formatted.vulnerabilities).forEach((items) => {
      items.forEach((item) => {
        if (!item.branch || item.branch === "N/A") {
          item.branch = resolvedBranch;
        }
      });
    });
  }

  if (persistenceContext) {
    await persistFormattedScan(formatted, {
      ...persistenceContext,
      repoPath: scanPath,
      branch: resolvedBranch || persistenceContext.branch || null,
      sourceKind: extraMeta.sourceKind || persistenceContext.sourceKind || null,
      repoUrl: extraMeta.repoUrl || persistenceContext.repoUrl || null,
    });
  }

  return {
    ...formatted,
    scanMeta: {
      scannedAt: new Date().toISOString(),
      analyzer: {
        url: AI_ANALYZE_URL,
        reviewedCount: aiEnriched.stats.reviewed,
        confirmedCount: aiEnriched.stats.confirmed,
      },
      branch: resolvedBranch,
      ...extraMeta,
    },
  };
}

async function getGitBranchSafe(repoPath) {
  if (!repoPath) return null;
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoPath,
      timeout: 1000 * 10,
    });
    const branch = String(stdout || "").trim();
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

async function buildPersistenceContext(req, repoPath, defaults = {}) {
  const actor = await resolveAuthUserFromHeader(req.headers.authorization);
  if (!actor) return null;

  return {
    actor,
    organizationId: actor.organizationId || null,
    repoUrl: defaults.repoUrl || null,
    repoPath: repoPath || null,
    branch: defaults.branch || null,
    sourceKind: defaults.sourceKind || null,
  };
}

async function persistFormattedScan(formatted, persistenceContext) {
  if (!persistenceContext?.actor || !formatted || formatted.error) return null;

  try {
    return await persistScanVulnerabilities({
      formatted,
      actor: persistenceContext.actor,
      organizationId: persistenceContext.organizationId || null,
      repoUrl: persistenceContext.repoUrl || null,
      repoPath: persistenceContext.repoPath || null,
      branch: persistenceContext.branch || null,
      sourceKind: persistenceContext.sourceKind || null,
    });
  } catch (error) {
    console.error("Failed to persist vulnerabilities:", error.message);
    return null;
  }
}

function buildAuthedGithubUrl(repoUrl, token) {
  const trimmedRepo = String(repoUrl || "").trim();
  const trimmedToken = String(token || "").trim();
  if (!trimmedRepo) return null;
  if (!trimmedToken) return trimmedRepo;

  const encodedToken = encodeURIComponent(trimmedToken);
  if (/^git@github\.com:/i.test(trimmedRepo)) {
    const repo = trimmedRepo.replace(/^git@github\.com:/i, "");
    return `https://x-access-token:${encodedToken}@github.com/${repo}`;
  }
  if (/^https:\/\/github\.com\//i.test(trimmedRepo)) {
    return trimmedRepo.replace(/^https:\/\//i, `https://x-access-token:${encodedToken}@`);
  }
  return trimmedRepo;
}

async function buildFreshRemoteVerificationScan({ repoUrl, branchName, githubToken, persistenceContext = null }) {
  const verificationPath = path.join(tempDir, `${Date.now()}-repo-verify`);
  const cloneUrl = buildAuthedGithubUrl(repoUrl, githubToken);

  try {
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--branch", branchName, cloneUrl, verificationPath],
      { maxBuffer: 1024 * 1024 * 10, timeout: 1000 * 60 * 5 }
    );

    return await buildScanResponse(verificationPath, true, {
      mode: "post-push-verification",
      sourceKind: "git",
      repoUrl: repoUrl || null,
      branch: branchName || null,
      verification: {
        performed: true,
        scannedAt: new Date().toISOString(),
        branch: branchName || null,
        source: "fresh-remote-clone",
      },
    }, persistenceContext);
  } finally {
    try { fs.rmSync(verificationPath, { recursive: true, force: true }); } catch {}
  }
}

async function verifySessionAfterPush(session, githubToken) {
  const formatted =
    session.repoUrl && session.lastBranchName
      ? await buildFreshRemoteVerificationScan({
          repoUrl: session.repoUrl,
          branchName: session.lastBranchName,
          githubToken,
          persistenceContext: session.persistenceContext || null,
        })
      : await buildScanResponse(session.repoPath, session.sourceType === "git", {
          mode: "post-push-verification",
          sourceKind: session.sourceType,
          repoUrl: session.repoUrl || null,
          branch: session.lastBranchName || null,
          verification: {
            performed: true,
            scannedAt: new Date().toISOString(),
            branch: session.lastBranchName || null,
            source: "workspace-fallback",
          },
        }, session.persistenceContext || null);

  updateSessionResults(session.sessionId, formatted);
  return withRemediationMeta(formatted, session);
}

function sanitizeErrorMessage(value) {
  if (value == null) return "Unknown error";
  return String(value)
    .replace(/https:\/\/x-access-token:[^@]+@github\.com\//gi, "https://x-access-token:[REDACTED]@github.com/")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]");
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

    const branch = await getGitBranchSafe(clonePath);
    let findings = await runTrufflehog(clonePath);

    // ✅ Filter ignored files
    findings = findings.filter((f) => {
      const file = getFindingFileKey(f);
      return !shouldIgnoreGeneratedFile(file);
    });

    findings = filterEntropyFalsePositives(findings, clonePath);

    const formatted = await formatResults(findings, clonePath, true);
    Object.values(formatted.vulnerabilities || {}).forEach((items) => {
      items.forEach((item) => {
        if (!item.branch || item.branch === "N/A") item.branch = branch || "N/A";
      });
    });
    const persistenceContext = await buildPersistenceContext(req, clonePath, {
      repoUrl: repoURL,
      branch,
      sourceKind: "git",
    });
    await persistFormattedScan(formatted, persistenceContext);
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
      return !shouldIgnoreGeneratedFile(file);
    });

    findings = filterEntropyFalsePositives(findings, extractPath);

    const formatted = await formatResults(findings, extractPath, false);
    const persistenceContext = await buildPersistenceContext(req, extractPath, {
      repoUrl: null,
      branch: null,
      sourceKind: "zip",
    });
    await persistFormattedScan(formatted, persistenceContext);
    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractPath, { recursive: true, force: true }); } catch {}
  }
});

app.post("/scan-url-remediation", async (req, res) => {
  const repoURL = (req.body.url || "").trim();
  if (!repoURL) return res.status(400).json({ error: true, message: "URL required" });

  const clonePath = path.join(tempDir, `${Date.now()}-repo-remediate`);

  try {
    await execFileAsync("git", ["clone", "--depth", "1", repoURL, clonePath]);
    const branch = await getGitBranchSafe(clonePath);
    const persistenceContext = await buildPersistenceContext(req, clonePath, {
      repoUrl: repoURL,
      branch,
      sourceKind: "git",
    });
    const formatted = await buildScanResponse(clonePath, true, {
      mode: "scan",
      sourceKind: "git",
      repoUrl: repoURL,
      branch,
    }, persistenceContext);
    const session = createSession({
      repoPath: clonePath,
      sourceType: "git",
      repoUrl: repoURL,
      results: formatted,
      branch,
      persistenceContext,
    });
    return res.json(await withRemediationMeta(formatted, session));
  } catch (err) {
    try { fs.rmSync(clonePath, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ error: true, message: err.message });
  }
});

app.post("/scan-zip-remediation", upload.single("zipfile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: "ZIP file required" });

  const zipPath = req.file.path;
  const extractPath = path.join(tempDir, `${Date.now()}-zip-remediate`);

  try {
    fs.mkdirSync(extractPath, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extractPath);
    const persistenceContext = await buildPersistenceContext(req, extractPath, {
      repoUrl: null,
      branch: null,
      sourceKind: "zip",
    });

    const formatted = await buildScanResponse(extractPath, false, {
      mode: "scan",
      sourceKind: "zip",
      repoUrl: null,
    }, persistenceContext);
    const session = createSession({
      repoPath: extractPath,
      sourceType: "zip",
      repoUrl: null,
      results: formatted,
      persistenceContext,
    });
    return res.json(await withRemediationMeta(formatted, session));
  } catch (err) {
    try { fs.rmSync(extractPath, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ error: true, message: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
  }
});

app.post("/patch/preview", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });
    const previews = previewPatches(session, req.body);
    return res.json({ success: true, previews, remediation: await buildSessionMeta(session) });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.post("/patch/apply", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });

    const applyResult = applyPatches(session, req.body);
    const formatted = await buildScanResponse(session.repoPath, session.sourceType === "git", {
      mode: "post-patch-scan",
      sourceKind: session.sourceType,
      repoUrl: session.repoUrl || null,
      branch: session.lastBranchName || session.branch || null,
    }, session.persistenceContext || null);
    updateSessionResults(session.sessionId, formatted);
    const diff = await getGitDiff(session);

    return res.json({
      success: true,
      previews: applyResult.previews,
      changedFiles: applyResult.changedFiles,
      diff,
      results: await withRemediationMeta(formatted, session),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.post("/patch/diff", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });
    const diff = await getGitDiff(session);
    return res.json({ success: true, diff, remediation: await buildSessionMeta(session) });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.post("/patch/commit", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });
    const commit = await commitSession(session, req.body);
    const diff = await getGitDiff(session);
    let results = null;

    if (req.body.push) {
      results = await verifySessionAfterPush(session, req.body.githubToken);
    }

    return res.json({
      success: true,
      commit,
      diff,
      remediation: await buildSessionMeta(session),
      results,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.post("/patch/verify", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });
    const results = await verifySessionAfterPush(session, req.body.githubToken);
    return res.json({
      success: true,
      remediation: await buildSessionMeta(session),
      results,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.post("/patch/rollback", async (req, res) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return res.status(404).json({ success: false, message: "Patch session not found or expired." });

    const rollback = await rollbackSession(session, req.body);
    const formatted = await buildScanResponse(session.repoPath, session.sourceType === "git", {
      mode: "post-rollback-scan",
      sourceKind: session.sourceType,
      repoUrl: session.repoUrl || null,
      branch: session.lastBranchName || session.branch || null,
    }, session.persistenceContext || null);
    updateSessionResults(session.sessionId, formatted);
    const diff = await getGitDiff(session);

    return res.json({
      success: true,
      rollback,
      diff,
      results: await withRemediationMeta(formatted, session),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: sanitizeErrorMessage(err.message) });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running: http://localhost:${PORT}`));
