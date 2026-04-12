const http = require("http");
const https = require("https");

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
	let confidence = entropyOnly ? 0.62 : 0.9;
	let risk = entropyOnly ? 0.68 : 0.93;
	let reason = entropyOnly
		? "Backend heuristic scored this high-entropy string from detector metadata and secret shape."
		: "Backend heuristic scored this detector hit as a likely real secret.";

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
		aiAnalysis: {
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

		const shouldDrop = entropyOnly && verification?.aiAnalysis?.is_secret === false;
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
