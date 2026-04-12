const fs = require("fs");
const path = require("path");
const { runTrufflehog, getGitMetadata } = require("./scanRuntime");
const { runCustomDetectors } = require("./customDetectors");
const { createCanonicalFinding } = require("./findingContract");
const { dedupeCanonicalFindings } = require("./findingDeduper");
const { loadIgnoreConfig, matchIgnoreScope } = require("./findingIgnore");
const { formatLegacyResults } = require("./findingFormatter");
const { enrichFindingsWithVerification } = require("./aiVerification");

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
	"client/public/vite.svg",
];

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
	return raw.replace(/^file:\/\//i, "").trim().replace(/\\/g, "/");
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
		(typeof extra.location === "object" &&
			(extra.location.line ?? extra.location.Line));
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
	const extra =
		f.ExtraData || f.extraData || f.StructuredData || f.structuredData;

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

function rowNeedleList(row) {
	if (row.needles?.length) return row.needles;
	if (row.secret && row.secret !== "Hidden" && String(row.secret).length >= 3) {
		return [row.secret];
	}
	return [];
}

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
	let candidate = path.normalize(
		path.isAbsolute(withSep) ? withSep : path.join(rootNorm, withSep),
	);
	try {
		candidate = fs.realpathSync(candidate);
	} catch {}
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

function anyNeedleLooksLikeRouteOrSample(needles) {
	const list = Array.isArray(needles) ? needles : [];
	for (const n of list) {
		const s = String(n).trim();
		if (s.length < 8) continue;
		if (s.startsWith("/") && /\/[a-f0-9]{12,}/i.test(s)) return true;
		if (/\/admin\/|\/api\/|\/v\d+\//i.test(s)) return true;
		if (
			s.startsWith("/") &&
			s.split("/").length >= 4 &&
			/^\/[a-z0-9/_-]+$/i.test(s)
		) {
			return true;
		}
	}
	return false;
}

function contextSuggestsExampleOrTest(low, fileIsTestPath) {
	if (!low) return false;
	const strong =
		/json_schema|schema_extra|"example"|'example'|example\s*=|fixtures?|@pytest|unittest\.|parametrize/.test(
			low,
		) ||
		/\bget_page_type\b/.test(low) ||
		/\bclass\s+config\b/.test(low) ||
		/\bmock\.|faker\.|factory\./.test(low);
	if (strong) return true;
	if (fileIsTestPath && /\bassert\s+/.test(low)) return true;
	return false;
}

function readSourceContextLower(repoPath, fileKey, lineVal, pad = 6) {
	const pl = parseInt(String(lineVal), 10);
	if (!repoPath || !fileKey || fileKey === "unknown" || !Number.isFinite(pl) || pl < 1) {
		return "";
	}
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

function shouldDropHighEntropyFalsePositive(f, repoPath) {
	if (!repoPath || !detectorIsEntropyOnly(f)) return false;

	const fileKey = getFindingFileKey(f);
	const needles = collectSecretNeedles(f);
	const primary = needles.length > 0 ? pickPrimarySecret(f, needles) : "Hidden";
	const lineVal = getFindingLine(f);
	const ctx = readSourceContextLower(repoPath, fileKey, lineVal, 6);

	const testPath = isTestOrFixturePath(fileKey);
	const routeLike = anyNeedleLooksLikeRouteOrSample(
		needles.length ? needles : primary !== "Hidden" ? [primary] : [],
	);
	const exampleOrTestCtx = contextSuggestsExampleOrTest(ctx, testPath);

	if (exampleOrTestCtx) return true;
	if (testPath && routeLike) return true;

	const hexOnly = primary.replace(/[^a-f0-9]/gi, "");
	if (testPath && hexOnly.length === 24 && /^[a-f0-9]{24}$/i.test(hexOnly)) {
		return true;
	}

	const fLower = String(fileKey).replace(/\\/g, "/").toLowerCase();
	const base = path.posix.basename(fLower);
	const apiSchemaFile =
		/^api[_v]/.test(base) || /(routes|schemas|models|schema|openapi)/.test(fLower);

	if (apiSchemaFile && hexOnly.length === 24 && /^[a-f0-9]{24}$/i.test(hexOnly)) {
		return true;
	}
	if (apiSchemaFile && routeLike) return true;

	return false;
}

function filterEntropyFalsePositives(findings, repoPath) {
	if (!findings?.length || !repoPath) return findings;
	return findings.filter((f) => !shouldDropHighEntropyFalsePositive(f, repoPath));
}

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
		} else {
			break;
		}
	}
	add(s.replace(/\\n/g, "\n").trim());
	add(s.replace(/\\r\\n/g, "\n").trim());
	return out;
}

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

	if (
		lineNum != null &&
		Number.isFinite(lineNum) &&
		lineNum >= 1 &&
		lineNum <= lines.length
	) {
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

	if (
		targetIdx < 0 &&
		lineNum != null &&
		Number.isFinite(lineNum) &&
		lineNum >= 1 &&
		lineNum <= lines.length
	) {
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

function assignSnippetsBasenamePass(repoRoot, pendingRows) {
	const stillNeed = pendingRows.filter(
		(r) =>
			!r.snippet &&
			r.file &&
			r.file !== "unknown" &&
			rowNeedleList(r).length > 0,
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
			const hit = findSecretLineMulti(lines, text, rowNeedleList(row));
			if (!hit) continue;
			row.line = hit.idx + 1;
			row.file = relUnix;
			row.snippet = readSnippetFromAbsoluteFile(
				absPath,
				hit.idx + 1,
				rowNeedleList(row),
				5,
			);
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
			} else if (byBase.has(ent.name)) {
				tryFile(full);
			}
		}
	}

	walk(realRoot);
}

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

async function buildFindingOccurrences(
	findings = [],
	repoPath = null,
	isGitRepo = false,
	sourceType = null,
) {
	if (!findings.length) return [];

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
		const parsedLine = parseInt(String(line), 10);
		let lineForSnippet =
			Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;

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
			ruleId:
				f.Rule ||
				f.rule ||
				String(type || "secret")
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "_"),
			reason:
				f.reason ||
				f.Reason ||
				f.VerificationError ||
				f.DecoderName ||
				type,
			secret: String(secret),
			needles: needlesForSnippet,
			line,
			snippet,
			contextText: readSourceContextLower(repoPath, file, line, 6),
			source: {
				engine: String(
					f.Provider ||
						f.provider ||
						f.Engine ||
						f.engine ||
						"trufflehog",
				).toLowerCase(),
				mode: "filesystem",
				sourceType: sourceType || (isGitRepo ? "git" : "zip"),
			},
			detectorConfidence:
				typeof f.DetectorConfidence === "number"
					? f.DetectorConfidence
					: typeof f.detectorConfidence === "number"
						? f.detectorConfidence
						: null,
			aiAnalysis: f.ai_analysis || null,
			aiSource: f.ai_source || null,
			aiCandidate: f.ai_candidate || null,
			raw: f,
			sm,
		});
	}

	if (repoPath) {
		const pending = rows.filter(
			(row) => !row.snippet && rowNeedleList(row).length > 0,
		);
		assignSnippetsBasenamePass(repoPath, pending);
		assignSnippetsByRepoWalk(repoPath, pending.filter((row) => !row.snippet));
	}

	const gitCache = new Map();
	for (const row of rows) {
		const parsedLine = parseInt(String(row.line), 10);
		const lineNumber =
			Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null;
		const cacheKey = `${row.file}|${lineNumber || "na"}`;
		if (!gitCache.has(cacheKey)) {
			const fallbackCommit =
				row.raw.Commit ||
				row.raw.commit ||
				(row.sm && (row.sm.Commit || row.sm.commit)) ||
				null;
			const fallbackBranch = row.raw.Branch || row.raw.branch || null;
			gitCache.set(
				cacheKey,
				isGitRepo && repoPath
					? await getGitMetadata(repoPath, row.file)
					: {
							commit: fallbackCommit,
							branch: fallbackBranch,
							ageDays: null,
							firstSeenDate: null,
							note: null,
						},
			);
		}

		row.git = gitCache.get(cacheKey);
		row.lineStart = lineNumber;
		row.lineEnd = lineNumber;
	}

	return rows;
}

async function buildCanonicalFindings(
	findings = [],
	repoPath = null,
	isGitRepo = false,
	sourceType = null,
) {
	const ignoreConfig = loadIgnoreConfig(repoPath);
	const occurrences = await buildFindingOccurrences(
		findings,
		repoPath,
		isGitRepo,
		sourceType,
	);

	const canonical = occurrences.map((occurrence) => {
		const location = {
			filePath: occurrence.file,
			lineStart: occurrence.lineStart,
			lineEnd: occurrence.lineEnd,
			preview: null,
			snippet: occurrence.snippet || null,
			git: occurrence.git,
			ignored: false,
			ignoreScope: null,
		};

		const finding = createCanonicalFinding({
			source: occurrence.source,
			secretType: occurrence.type,
			filePath: occurrence.file,
			lineStart: occurrence.lineStart,
			lineEnd: occurrence.lineEnd,
			ruleId: occurrence.ruleId,
			reason: occurrence.reason,
			rawSecret: occurrence.secret,
			contextText: occurrence.contextText,
			detectorConfidence: occurrence.detectorConfidence,
			detectors: [occurrence.type],
			locations: [location],
			git: occurrence.git,
			remediation: {
				patchable: true,
			},
			storage: {
				sanitized: false,
				persisted: false,
			},
			aiAnalysis: occurrence.aiAnalysis,
			aiSource: occurrence.aiSource,
			aiCandidate: occurrence.aiCandidate,
		});

		const ignoreMatch = matchIgnoreScope(finding, ignoreConfig);
		finding.ignored = ignoreMatch.ignored;
		finding.ignoreScope = ignoreMatch.ignoreScope;
		finding.decision = finding.ignored ? "ignored" : "active";
		finding.locations = finding.locations.map((item) => ({
			...item,
			ignored: ignoreMatch.ignored,
			ignoreScope: ignoreMatch.ignoreScope,
			preview: finding.preview,
		}));
		return finding;
	});

	return dedupeCanonicalFindings(canonical);
}

function sanitizeErrorMessage(value) {
	if (value == null) return "Unknown error";
	return String(value)
		.replace(
			/https:\/\/x-access-token:[^@]+@github\.com\//gi,
			"https://x-access-token:[REDACTED]@github.com/",
		)
		.replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]");
}

function buildScanWarnings(warnings = []) {
	return Array.from(
		new Set(
			(Array.isArray(warnings) ? warnings : [])
				.map((warning) => sanitizeErrorMessage(warning))
				.filter(Boolean),
		),
	);
}

async function prepareScanResponse(
	findings,
	repoPath,
	isGitRepo,
	warnings = [],
	sourceType = null,
	extraScanMeta = null,
) {
	let normalizedFindings = findings.filter((f) => {
		const file = getFindingFileKey(f);
		return !ignorePatterns.some((pattern) => file.includes(pattern));
	});

	normalizedFindings = filterEntropyFalsePositives(normalizedFindings, repoPath);
	const verification = await enrichFindingsWithVerification(normalizedFindings, {
		collectSecretNeedles,
		pickPrimarySecret,
		detectorIsEntropyOnly,
	});

	const canonicalFindings = await buildCanonicalFindings(
		verification.findings,
		repoPath,
		isGitRepo,
		sourceType,
	);
	const formatted = formatLegacyResults(canonicalFindings);
	const nextWarnings = buildScanWarnings(warnings);
	if (nextWarnings.length) {
		formatted.warnings = nextWarnings;
	}
	formatted.scanMeta = {
		scannedAt: new Date().toISOString(),
		analyzer: verification.meta.analyzer,
		...(extraScanMeta || {}),
	};
	return formatted;
}

async function executeScanWorkspace({
	repoPath,
	isGitRepo,
	sourceType = null,
	scanMeta = null,
}) {
	const [scanOutput, customFindings] = await Promise.all([
		runTrufflehog(repoPath),
		runCustomDetectors(repoPath),
	]);
	const formatted = await prepareScanResponse(
		[...(scanOutput.findings || []), ...(customFindings || [])],
		repoPath,
		isGitRepo,
		scanOutput.warnings || [],
		sourceType,
		scanMeta,
	);
	return {
		formatted,
		warnings: formatted.warnings || [],
	};
}

module.exports = {
	getFindingFileKey,
	buildScanWarnings,
	prepareScanResponse,
	buildCanonicalFindings,
	executeScanWorkspace,
};
