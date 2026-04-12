const { maskSecretValue } = require("./findingStorage");

const PROVIDER_PATTERNS = [
	/^gh[pousr]_/i,
	/^github_pat_/i,
	/^sk_(live|test|proj)_/i,
	/^xox[baprs]-/i,
	/^AKIA[0-9A-Z]{16}$/i,
	/^ASIA[0-9A-Z]{16}$/i,
	/^AIza[0-9A-Za-z\-_]{20,}$/i,
	/^ya29\./i,
	/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,
];

function normalizeSecret(value) {
	return String(value || "").trim();
}

function isDocsOrExample(input) {
	const haystack = `${input.filePath || ""}\n${input.contextText || ""}\n${input.rawSecret || ""}`.toLowerCase();
	return /(docs?|readme|example|sample|fixture|mock|test|spec|demo)/.test(haystack);
}

function isPrivateKey(input) {
	return /BEGIN [A-Z0-9 ]*PRIVATE KEY/.test(String(input.rawSecret || ""));
}

function isDatabaseUrlWithPassword(input) {
	return /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(
		String(input.rawSecret || "").trim(),
	);
}

function hasStrongProviderPrefix(input) {
	const value = normalizeSecret(input.rawSecret);
	return PROVIDER_PATTERNS.some((pattern) => pattern.test(value));
}

function hasBearerToken(input) {
	return /^bearer\s+[a-z0-9._-]{16,}$/i.test(String(input.contextText || "").trim());
}

function hasSecretAssignmentContext(input) {
	const haystack = `${input.contextText || ""}\n${input.filePath || ""}\n${input.secretType || ""}`.toLowerCase();
	return /(secret|token|password|passwd|pwd|apikey|api_key|auth|credential|private_key|connectionstring|mongodb_uri)/.test(
		haystack,
	);
}

function stripWrappingQuotes(value) {
	const text = normalizeSecret(value);
	if (!text) return "";
	const first = text[0];
	const last = text[text.length - 1];
	if ((first === `"` || first === `'` || first === "`") && first === last) {
		return text.slice(1, -1).trim();
	}
	return text;
}

function isEnvAccessor(value) {
	return /(?:process\.env\.[A-Za-z_][A-Za-z0-9_]*|process\.env\[[^\]]+\]|os\.getenv\s*\(|System\.getenv\s*\(|env(?:iron)?\s*\[)/.test(
		normalizeSecret(value),
	);
}

function isIdentifierOnly(value) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(normalizeSecret(value));
}

function isReferenceLike(value) {
	const text = normalizeSecret(value);
	if (!text) return true;
	if (isIdentifierOnly(text) || isEnvAccessor(text)) return true;
	if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^\]]+\])+$/.test(text)) {
		return true;
	}
	return false;
}

function isIndirectExpression(value) {
	const text = normalizeSecret(value);
	if (!text) return true;
	if (isReferenceLike(text)) return true;
	if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(text)) return true;
	if (/[+|]{2}|&&|\|\||\?/.test(text)) return true;
	if (/\$\{/.test(text)) return true;
	if (/(?:^|[^A-Za-z0-9_])(?:await|new)\s+[A-Za-z_$]/.test(text)) return true;
	return false;
}

function isLikelyPlaceholder(value) {
	const lower = stripWrappingQuotes(value).toLowerCase();
	if (!lower) return true;
	return /(example|sample|dummy|placeholder|redacted|changeme|fake|mock|test(?:ing)?|localhost)/.test(
		lower,
	);
}

function hasLongDenseSecretShape(value) {
	const text = stripWrappingQuotes(value);
	if (text.length < 16 || /\s/.test(text)) return false;
	if (/^[A-Za-z_$][A-Za-z0-9_$-]{0,31}$/.test(text)) return false;
	const classes = [
		/[a-z]/.test(text),
		/[A-Z]/.test(text),
		/[0-9]/.test(text),
		/[^A-Za-z0-9]/.test(text),
	].filter(Boolean).length;
	if (classes >= 3) return true;
	if (text.length >= 24 && /^[A-Za-z0-9+/_=-]+$/.test(text)) return true;
	return false;
}

function hasLiteralSecretEvidence(input) {
	const raw = normalizeSecret(input.rawSecret);
	if (!raw) return false;
	if (isPrivateKey(input) || isDatabaseUrlWithPassword(input) || hasStrongProviderPrefix(input)) {
		return true;
	}
	if (isLikelyPlaceholder(raw)) return false;
	if (isReferenceLike(raw) || isIndirectExpression(raw)) return false;
	return hasLongDenseSecretShape(raw);
}

function isConfigOrSourcePath(input) {
	const file = String(input.filePath || "").toLowerCase();
	return /\.(env|json|ya?ml|toml|ini|conf|config|ts|tsx|js|jsx|py|go|java|rb|php|cs)$/.test(
		file,
	);
}

function scoreConfidence(input) {
	let score = 8;
	const literalEvidence = hasLiteralSecretEvidence(input);

	if (hasStrongProviderPrefix(input)) score += 35;
	if (literalEvidence) score += 38;
	if (hasSecretAssignmentContext(input) && literalEvidence) score += 10;
	if (isConfigOrSourcePath(input)) score += 10;
	if (!/entropy/i.test(String(input.secretType || ""))) score += 10;
	if (typeof input.detectorConfidence === "number") {
		score += Math.round(Math.max(0, Math.min(1, input.detectorConfidence)) * 10);
	}
	if (isReferenceLike(input.rawSecret) || isIndirectExpression(input.rawSecret)) score -= 28;
	if (isDocsOrExample(input)) score -= 30;
	if (isLikelyPlaceholder(input.rawSecret)) {
		score -= 25;
	}

	return Math.max(5, Math.min(99, score));
}

function evaluateSeverity(input, confidence) {
	if (isPrivateKey(input) || isDatabaseUrlWithPassword(input)) return "critical";
	if (hasStrongProviderPrefix(input) && isConfigOrSourcePath(input) && !isDocsOrExample(input)) {
		return "critical";
	}
	if (!hasLiteralSecretEvidence(input)) return "low";
	if (hasStrongProviderPrefix(input) || hasBearerToken(input)) return "high";
	if (isDocsOrExample(input) || confidence < 35) return "low";
	if (
		confidence >= 70 &&
		(!/entropy/i.test(String(input.secretType || "")) || hasSecretAssignmentContext(input))
	) {
		return "medium";
	}
	return "low";
}

function scoreFinding(input) {
	const confidence = scoreConfidence(input);
	const severity = evaluateSeverity(input, confidence);
	return {
		severity,
		confidence,
		preview: maskSecretValue(input.rawSecret),
	};
}

module.exports = {
	scoreFinding,
	hasLiteralSecretEvidence,
	isReferenceLike,
	isIndirectExpression,
	isLikelyPlaceholder,
	hasStrongProviderPrefix,
	isDatabaseUrlWithPassword,
	isPrivateKey,
};
