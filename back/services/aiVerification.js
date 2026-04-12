const http = require("http");
const https = require("https");
const {
	hasLiteralSecretEvidence,
	isReferenceLike,
	isIndirectExpression,
	isLikelyPlaceholder,
	hasStrongProviderPrefix,
	isDatabaseUrlWithPassword,
	isPrivateKey,
} = require("./findingScoring");

const AI_ANALYZE_URL =
	process.env.SECURE_SCAN_AI_URL ||
	"https://secure-scan-ai-risk.onrender.com/analyze";

function titleCaseWords(value) {
	return String(value || "")
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map(
			(part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
		)
		.join(" ");
}

function inferServiceFromFinding(finding, candidate) {
	const text = `${finding?.DetectorName || finding?.detectorName || finding?.DetectorType || finding?.detectorType || ""} ${candidate || ""}`.toLowerCase();
	if (text.includes("openai") || /^sk-[a-z0-9]/i.test(candidate || ""))
		return "OpenAI";
	if (
		text.includes("github") ||
		/^(ghp_|github_pat_|gho_|ghu_|ghs_)/i.test(candidate || "")
	)
		return "GitHub";
	if (text.includes("redis") || /^redis(s)?:\/\//i.test(candidate || ""))
		return "Redis";
	if (
		text.includes("mongo") ||
		/^mongodb(\+srv)?:\/\//i.test(candidate || "")
	)
		return "MongoDB";
	if (text.includes("firebase") || text.includes("google"))
		return "Google/Firebase";
	if (text.includes("aws") || /^akia/i.test(candidate || "")) return "AWS";
	if (text.includes("slack") || /^xox[baprs]-/i.test(candidate || ""))
		return "Slack";
	if (text.includes("stripe") || /^sk_(live|test)_/i.test(candidate || ""))
		return "Stripe";
	const detectorLabel =
		finding?.DetectorName ||
		finding?.detectorName ||
		finding?.DetectorType ||
		finding?.detectorType ||
		finding?.Reason ||
		finding?.reason ||
		"";
	return titleCaseWords(detectorLabel) || "Unknown";
}

function buildBackendConfidenceAnalysis(
	finding,
	candidate,
	{ entropyOnly = false } = {},
) {
	const text = String(candidate || "").trim();
	if (!text || text === "Hidden") return null;

	const service = inferServiceFromFinding(finding, text);
	const evaluationInput = {
		rawSecret: text,
		secretType:
			finding?.DetectorName ||
			finding?.detectorName ||
			finding?.DetectorType ||
			finding?.detectorType ||
			"",
		filePath:
			finding?.ExtraData?.file ||
			finding?.extraData?.file ||
			finding?.SourceMetadata?.Data?.Filesystem?.file ||
			"",
		contextText: "",
	};
	const deterministic =
		isPrivateKey(evaluationInput) ||
		isDatabaseUrlWithPassword(evaluationInput) ||
		hasStrongProviderPrefix(evaluationInput);
	const literalEvidence = hasLiteralSecretEvidence(evaluationInput);
	const ambiguous =
		!deterministic &&
		(!literalEvidence || isReferenceLike(text) || isIndirectExpression(text));

	let confidence = deterministic ? 0.97 : literalEvidence ? 0.74 : entropyOnly ? 0.24 : 0.18;
	let risk = deterministic ? 0.98 : literalEvidence ? 0.78 : entropyOnly ? 0.22 : 0.16;
	let reason = deterministic
		? "Backend heuristic matched a deterministic secret exposure pattern."
		: literalEvidence
			? "Backend heuristic found literal secret-like evidence, but not a deterministic pattern."
			: "Backend heuristic found ambiguous secret context without strong literal evidence.";

	if (/^(redis(s)?:\/\/|mongodb(\+srv)?:\/\/)/i.test(text)) {
		confidence += 0.16;
		risk += 0.18;
		reason = "Backend detected a credential-bearing connection string.";
	} else if (
		/^(sk-[a-z0-9]|ghp_|github_pat_|gho_|ghu_|ghs_|xox[baprs]-|akia)/i.test(
			text,
		)
	) {
		confidence += 0.18;
		risk += 0.16;
		reason = "Backend matched a strong provider-specific secret pattern.";
	} else if (literalEvidence && text.length >= 24) {
		confidence += 0.08;
		risk += 0.06;
	}

	const lower = text.toLowerCase();
	if (isLikelyPlaceholder(lower)) {
		confidence -= 0.28;
		risk -= 0.32;
		reason = "Backend found placeholder-style text, so the score was reduced.";
	}
	if (ambiguous) {
		confidence = Math.min(confidence, entropyOnly ? 0.3 : 0.24);
		risk = Math.min(risk, entropyOnly ? 0.28 : 0.22);
		reason = "Backend rejected this as ambiguous because it lacks actual literal secret evidence.";
	}

	confidence = Math.max(0.15, Math.min(0.99, confidence));
	risk = Math.max(0.1, Math.min(0.99, risk));

	return {
		aiAnalysis: {
			is_secret: deterministic || (literalEvidence && confidence >= 0.72),
			risk_score: Number(risk.toFixed(2)),
			confidence: Number(confidence.toFixed(2)),
			reason,
			service,
		},
		source: "backend-heuristic",
		candidate: text,
	};
}

async function analyzeCandidateWithAi(candidate) {
	const text = String(candidate || "").trim();
	if (!text || text === "Hidden" || text.length < 6) {
		return { result: null, transport: "skipped", error: null };
	}

	try {
		if (typeof fetch === "function") {
			const response = await fetch(AI_ANALYZE_URL, {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: text,
			});
			if (response.ok) {
				const data = await response.json();
				if (data && typeof data === "object") {
					return {
						result: {
							aiAnalysis: data.ai_analysis || null,
							source: data.source || "remote-analyzer",
							candidate: data.candidate || text,
						},
						transport: "remote",
						error: null,
					};
				}
			}
			return {
				result: null,
				transport: "remote-error",
				error: `Remote analyzer responded with status ${response.status}.`,
			};
		}
	} catch (error) {
		return {
			result: null,
			transport: "remote-error",
			error: error?.message || "Remote analyzer request failed.",
		};
	}

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
						if (
							(response.statusCode || 500) < 200 ||
							(response.statusCode || 500) >= 300
						) {
							resolve({
								result: null,
								transport: "remote-error",
								error: `Remote analyzer responded with status ${response.statusCode || 500}.`,
							});
							return;
						}
						try {
							const parsed = JSON.parse(body);
							resolve({
								result: {
									aiAnalysis: parsed.ai_analysis || null,
									source: parsed.source || "remote-analyzer",
									candidate: parsed.candidate || text,
								},
								transport: "remote",
								error: null,
							});
						} catch (error) {
							resolve({
								result: null,
								transport: "remote-error",
								error: error?.message || "Remote analyzer returned invalid JSON.",
							});
						}
					});
				},
			);
			request.on("error", (error) =>
				resolve({
					result: null,
					transport: "remote-error",
					error: error?.message || "Remote analyzer request failed.",
				}),
			);
			request.write(text);
			request.end();
		});
		return data;
	} catch (error) {
		return {
			result: null,
			transport: "remote-error",
			error: error?.message || "Remote analyzer request failed.",
		};
	}
}

async function enrichFindingsWithVerification(
	findings = [],
	{
		pickPrimarySecret,
		collectSecretNeedles,
		detectorIsEntropyOnly,
	} = {},
) {
	const meta = {
		analyzer: {
			url: AI_ANALYZE_URL,
			reviewedCount: 0,
			confirmedCount: 0,
			rejectedCount: 0,
			remoteCount: 0,
			heuristicCount: 0,
			fallbackUsed: false,
			note: null,
		},
	};

	if (!Array.isArray(findings) || !findings.length) {
		return { findings: [], meta };
	}

	const enriched = [];
	for (const finding of findings) {
		const needles = collectSecretNeedles ? collectSecretNeedles(finding) : [];
		const candidate = pickPrimarySecret
			? pickPrimarySecret(finding, needles)
			: needles[0] || "Hidden";
		const entropyOnly = detectorIsEntropyOnly
			? detectorIsEntropyOnly(finding)
			: false;

		const remote = await analyzeCandidateWithAi(candidate);
		let verification = remote.result;
		if (!verification) {
			verification = buildBackendConfidenceAnalysis(finding, candidate, {
				entropyOnly,
			});
			if (verification) {
				meta.analyzer.heuristicCount += 1;
				meta.analyzer.fallbackUsed = true;
				meta.analyzer.note =
					remote.error ||
					"Remote analyzer unavailable; backend heuristics were used.";
			}
		} else {
			meta.analyzer.remoteCount += 1;
		}

		if (verification?.aiAnalysis) {
			meta.analyzer.reviewedCount += 1;
			if (verification.aiAnalysis.is_secret) {
				meta.analyzer.confirmedCount += 1;
			} else {
				meta.analyzer.rejectedCount += 1;
			}
		}

		const candidateLooksAmbiguous =
			isReferenceLike(candidate) ||
			isIndirectExpression(candidate) ||
			isLikelyPlaceholder(candidate);
		const shouldDrop =
			(entropyOnly && verification?.aiAnalysis?.is_secret === false) ||
			(candidateLooksAmbiguous && verification?.aiAnalysis?.is_secret !== true);
		if (shouldDrop) continue;

		enriched.push(
			verification
				? {
						...finding,
						ai_analysis: verification.aiAnalysis || null,
						ai_source: verification.source || null,
						ai_candidate: verification.candidate || candidate,
				  }
				: finding,
		);
	}

	return { findings: enriched, meta };
}

module.exports = {
	AI_ANALYZE_URL,
	enrichFindingsWithVerification,
};
