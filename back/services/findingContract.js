const { computeFingerprint, normalizeSecretValue } = require("./findingFingerprint");
const { scoreFinding } = require("./findingScoring");

function createCanonicalFinding(input) {
	const normalizedSecretValue = normalizeSecretValue(input.rawSecret);
	const fingerprint = computeFingerprint({
		secretType: input.secretType,
		normalizedSecretValue,
		ruleId: input.ruleId,
	});
	const scoring = scoreFinding(input);
	const ignored = !!input.ignored;

	return {
		id: fingerprint,
		fingerprint,
		source: input.source,
		secretType: input.secretType,
		severity: input.severity || scoring.severity,
		confidence: input.confidence ?? scoring.confidence,
		decision: ignored ? "ignored" : "active",
		filePath: input.filePath,
		lineStart: input.lineStart ?? null,
		lineEnd: input.lineEnd ?? input.lineStart ?? null,
		preview: input.preview || scoring.preview,
		ruleId: input.ruleId,
		reason: input.reason,
		ignored,
		ignoreScope: input.ignoreScope || null,
		occurrenceCount: input.occurrenceCount ?? 1,
		locations: input.locations || [],
		detectors: input.detectors || [],
		git: input.git || { commit: null, branch: null, ageDays: null, firstSeenDate: null, note: null },
		remediation: input.remediation || { patchable: true },
		storage: input.storage || { sanitized: false, persisted: false },
		rawSecret: input.rawSecret,
		normalizedSecretValue,
		aiAnalysis: input.aiAnalysis || null,
		aiSource: input.aiSource || null,
		aiCandidate: input.aiCandidate || null,
	};
}

module.exports = {
	createCanonicalFinding,
};
