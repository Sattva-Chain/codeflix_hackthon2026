const fs = require("fs");
const path = require("path");
const {
	hasLiteralSecretEvidence,
	isReferenceLike,
	isIndirectExpression,
	isLikelyPlaceholder,
	hasStrongProviderPrefix,
	isDatabaseUrlWithPassword,
	isPrivateKey,
} = require("./findingScoring");

const SKIP_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".next",
	"coverage",
	"target",
	"venv",
	".venv",
	"__pycache__",
]);

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_FILES = 12000;

const PRIVATE_KEY_HEADER_RE =
	/^-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----$/m;
const PRIVATE_KEY_BEGIN_RE =
	/^-----BEGIN ((?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY)-----$/;
const PRIVATE_KEY_END_RE = /^-----END ((?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY)-----$/;

const DB_URL_RE =
	/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp):\/\/([^\s:/@]+):([^\s/@]+)@[^\s'"`]+/gi;

const ASSIGNMENT_RE =
	/\b(api[_-]?key|client[_-]?secret|access[_-]?token|database[_-]?url|db[_-]?url|password|passwd|secret|token)\b\s*[:=]\s*(["'`]?)([^"'`\r\n#]+)\2/gi;

const PROVIDER_TOKEN_PATTERNS = [
	{
		detectorName: "GitHub",
		ruleId: "github",
		regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
		confidence: 0.98,
	},
	{
		detectorName: "AWS",
		ruleId: "aws",
		regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
		confidence: 0.95,
	},
	{
		detectorName: "JWT",
		ruleId: "jwt_token",
		regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
		confidence: 0.9,
	},
];

function normalizePath(value) {
	return String(value || "").replace(/\\/g, "/");
}

function shouldSkipDir(dirName) {
	return SKIP_DIRS.has(dirName);
}

function looksBinary(buffer) {
	return buffer.includes(0);
}

function isPlaceholderValue(value) {
	const normalized = String(value || "").trim().toLowerCase();
	if (!normalized) return true;
	if (isLikelyPlaceholder(normalized)) return true;
	if (/^(null|undefined|none)$/i.test(normalized)) return true;
	if (/^[x*._-]{6,}$/i.test(normalized)) return true;
	return false;
}

function pathSuggestsDocs(filePath) {
	return /(docs?|readme|examples?|samples?|fixtures?|mocks?|demo)/i.test(
		String(filePath || ""),
	);
}

function lineSuggestsExample(line) {
	return /(example|sample|placeholder|dummy|redacted|fake)/i.test(String(line || ""));
}

function isLikelyTextFile(filePath) {
	const ext = path.extname(String(filePath || "")).toLowerCase();
	if (!ext) return true;
	return ![
		".png",
		".jpg",
		".jpeg",
		".gif",
		".ico",
		".pdf",
		".zip",
		".tar",
		".gz",
		".exe",
		".dll",
		".so",
		".woff",
		".woff2",
		".ttf",
		".eot",
		".mp4",
		".mp3",
		".mov",
	].includes(ext);
}

function lineNumberForIndex(text, index) {
	let line = 1;
	for (let i = 0; i < index; i++) {
		if (text.charCodeAt(i) === 10) line++;
	}
	return line;
}

function buildRawFinding({
	filePath,
	line,
	detectorName,
	ruleId,
	rawSecret,
	detectorConfidence,
}) {
	const normalizedFilePath = normalizePath(filePath);
	return {
		DetectorName: detectorName,
		DetectorType: detectorName,
		Rule: ruleId,
		Raw: rawSecret,
		Secret: rawSecret,
		Provider: "custom",
		DetectorConfidence: detectorConfidence,
		SourceMetadata: {
			Data: {
				Filesystem: {
					file: normalizedFilePath,
					line,
				},
			},
		},
		ExtraData: {
			file: normalizedFilePath,
			line,
			provider: "custom",
		},
	};
}

function collectPrivateKeyFindings(text, relativePath) {
	const findings = [];
	if (!PRIVATE_KEY_HEADER_RE.test(text)) return findings;

	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const beginMatch = String(lines[index] || "").match(PRIVATE_KEY_BEGIN_RE);
		if (!beginMatch) continue;

		const keyType = beginMatch[1];
		let endIndex = index;
		for (let i = index + 1; i < Math.min(lines.length, index + 80); i++) {
			const endMatch = String(lines[i] || "").match(PRIVATE_KEY_END_RE);
			if (endMatch && endMatch[1] === keyType) {
				endIndex = i;
				break;
			}
		}

		const block = lines.slice(index, endIndex + 1).join("\n").trim();
		if (!block) continue;

		findings.push(
			buildRawFinding({
				filePath: relativePath,
				line: index + 1,
				detectorName: "PrivateKey",
				ruleId: "privatekey",
				rawSecret: block,
				detectorConfidence: 1,
			}),
		);
	}

	return findings;
}

function collectDbUrlFindings(text, relativePath) {
	const findings = [];
	DB_URL_RE.lastIndex = 0;
	let match;
	while ((match = DB_URL_RE.exec(text)) !== null) {
		const raw = String(match[0] || "").trim();
		const username = String(match[1] || "").trim();
		const password = String(match[2] || "").trim();
		if (!raw || isPlaceholderValue(username) || isPlaceholderValue(password)) continue;
		const line = lineNumberForIndex(text, match.index);
		findings.push(
			buildRawFinding({
				filePath: relativePath,
				line,
				detectorName: "Database URL",
				ruleId: "db_url_with_password",
				rawSecret: raw,
				detectorConfidence: 0.98,
			}),
		);
	}
	return findings;
}

function hasQuotedLiteralSignal(rawValue, wasQuoted) {
	if (!wasQuoted) return false;
	const value = String(rawValue || "").trim();
	if (!value || isPlaceholderValue(value)) return false;
	return hasLiteralSecretEvidence({ rawSecret: value });
}

function shouldSkipAssignmentMatch(relativePath, lineText, variableName, value, wasQuoted) {
	if (!value || value.length < 8) return true;
	if (isPlaceholderValue(value)) return true;
	if (lineSuggestsExample(lineText) && pathSuggestsDocs(relativePath)) return true;
	if (/^(true|false|null|undefined)$/i.test(String(value).trim())) return true;
	if (
		isPrivateKey({ rawSecret: value }) ||
		isDatabaseUrlWithPassword({ rawSecret: value }) ||
		hasStrongProviderPrefix({ rawSecret: value })
	) {
		return true;
	}
	DB_URL_RE.lastIndex = 0;
	if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(variableName || "").trim()) && isReferenceLike(value)) {
		return true;
	}
	if (isReferenceLike(value) || isIndirectExpression(value)) return true;
	if (
		/(?:process\.env\.|process\.env\[|os\.getenv\s*\(|System\.getenv\s*\()/i.test(
			String(value),
		)
	) {
		return true;
	}
	if (!wasQuoted) return true;
	return !hasQuotedLiteralSignal(value, wasQuoted);
}

function collectAssignmentFindings(text, relativePath) {
	const findings = [];
	const lines = text.split(/\r?\n/);
	ASSIGNMENT_RE.lastIndex = 0;
	let match;
	while ((match = ASSIGNMENT_RE.exec(text)) !== null) {
		const variableName = String(match[1] || "").trim();
		const quote = String(match[2] || "");
		const wasQuoted = Boolean(quote);
		const rawValue = String(match[3] || "").trim();
		const line = lineNumberForIndex(text, match.index);
		const lineText = String(lines[line - 1] || "");
		if (
			shouldSkipAssignmentMatch(
				relativePath,
				lineText,
				variableName,
				rawValue,
				wasQuoted,
			)
		) {
			continue;
		}
		findings.push(
			buildRawFinding({
				filePath: relativePath,
				line,
				detectorName: `Assigned ${variableName}`,
				ruleId: `assigned_${variableName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
				rawSecret: rawValue,
				detectorConfidence: 0.82,
			}),
		);
	}
	return findings;
}

function collectProviderTokenFindings(text, relativePath) {
	const findings = [];
	if (pathSuggestsDocs(relativePath)) return findings;
	for (const pattern of PROVIDER_TOKEN_PATTERNS) {
		pattern.regex.lastIndex = 0;
		let match;
		while ((match = pattern.regex.exec(text)) !== null) {
			const raw = String(match[0] || "").trim();
			if (!raw || isPlaceholderValue(raw)) continue;
			const line = lineNumberForIndex(text, match.index);
			const lineText = String(text.split(/\r?\n/)[line - 1] || "");
			if (lineSuggestsExample(lineText)) continue;
			findings.push(
				buildRawFinding({
					filePath: relativePath,
					line,
					detectorName: pattern.detectorName,
					ruleId: pattern.ruleId,
					rawSecret: raw,
					detectorConfidence: pattern.confidence,
				}),
			);
		}
	}
	return findings;
}

function collectFileFindings(text, relativePath) {
	return [
		...collectPrivateKeyFindings(text, relativePath),
		...collectDbUrlFindings(text, relativePath),
		...collectAssignmentFindings(text, relativePath),
		...collectProviderTokenFindings(text, relativePath),
	];
}

function walkWorkspace(rootPath, onFile) {
	let filesVisited = 0;

	function walk(dirPath) {
		if (filesVisited >= MAX_TOTAL_FILES) return;
		let entries = [];
		try {
			entries = fs.readdirSync(dirPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (filesVisited >= MAX_TOTAL_FILES) return;
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				if (shouldSkipDir(entry.name)) continue;
				walk(fullPath);
				continue;
			}
			if (!entry.isFile()) continue;
			filesVisited++;
			onFile(fullPath);
		}
	}

	walk(rootPath);
}

async function runCustomDetectors(scanPath) {
	const findings = [];
	const rootPath = path.resolve(scanPath);

	walkWorkspace(rootPath, (fullPath) => {
		const relativePath = normalizePath(path.relative(rootPath, fullPath));
		if (!relativePath || relativePath.startsWith("..")) return;
		if (!isLikelyTextFile(relativePath)) return;

		let stat;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			return;
		}
		if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;

		let buffer;
		try {
			buffer = fs.readFileSync(fullPath);
		} catch {
			return;
		}
		if (looksBinary(buffer)) return;

		const text = buffer.toString("utf8");
		findings.push(...collectFileFindings(text, relativePath));
	});

	return findings;
}

module.exports = {
	runCustomDetectors,
};
