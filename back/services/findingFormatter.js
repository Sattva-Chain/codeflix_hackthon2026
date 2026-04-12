const { sanitizeForStorage } = require("./findingStorage");

function sortLocations(finding) {
	return [...(finding.locations || [])].sort((a, b) => {
		if (a.filePath === b.filePath) {
			return (a.lineStart || 0) - (b.lineStart || 0);
		}
		return String(a.filePath || "").localeCompare(String(b.filePath || ""));
	});
}

function formatLegacyResults(findings = []) {
	const vulnerabilities = {};
	const fileSet = new Set();

	for (const finding of findings) {
		for (const [index, location] of sortLocations(finding).entries()) {
			const filePath = location.filePath || finding.filePath || "unknown";
			if (!vulnerabilities[filePath]) vulnerabilities[filePath] = [];
			vulnerabilities[filePath].push({
				findingId: finding.id,
				fingerprint: finding.fingerprint,
				occurrenceCount: finding.occurrenceCount,
				secret: finding.rawSecret,
				type: finding.secretType,
				line: location.lineStart ?? finding.lineStart ?? "N/A",
				commit: location.git?.commit || finding.git?.commit || "N/A",
				branch: location.git?.branch || finding.git?.branch || "N/A",
				snippet: location.snippet || null,
				severity: finding.severity,
				confidence: finding.confidence,
				ignored: !!location.ignored,
				ignoreScope: location.ignoreScope || null,
				locationIndex: index,
				locations: finding.locations.map((item) => ({
					filePath: item.filePath,
					lineStart: item.lineStart,
					lineEnd: item.lineEnd,
					ignored: !!item.ignored,
					ignoreScope: item.ignoreScope || null,
				})),
				git: location.git || finding.git,
				aiAnalysis: finding.aiAnalysis || null,
				aiSource: finding.aiSource || null,
				aiCandidate: finding.aiCandidate || null,
			});
			fileSet.add(filePath);
		}
	}

	return {
		summary: {
			secretsFound: findings.length,
			filesWithSecrets: fileSet.size,
			occurrencesFound: Object.values(vulnerabilities).reduce(
				(total, entries) => total + entries.length,
				0,
			),
		},
		vulnerabilities,
		findings,
		storageFindings: findings.map((finding) => sanitizeForStorage(finding)),
	};
}

module.exports = {
	formatLegacyResults,
};
