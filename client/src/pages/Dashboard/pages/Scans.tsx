"use client";
import React, { useState, type FormEvent, useMemo, useEffect, Fragment } from "react";
import axios from "axios";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { userAuth } from "../../../context/Auth";

// --- PDF LIBRARIES IMPORT ---
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 🛑 MODIFIED IPC DECLARATION
type CodeSnippet = {
  lines: { num: number; text: string }[];
  highlightLine: number;
};

type Secret = {
  secret: string;
  type: string;
  line: number | string;
  commit: string;
  branch: string;
  author?: string | null;
  authorEmail?: string | null;
  email?: string | null;
  commitTime?: string | null;
  assignedTo?: string | null;
  snippet?: CodeSnippet | null;
  aiAnalysis?: {
    is_secret?: boolean;
    risk_score?: number;
    confidence?: number;
    reason?: string;
    service?: string;
  } | null;
  aiSource?: string | null;
  aiCandidate?: string | null;
};

type RemediationMeta = {
  sessionId: string;
  sourceType: "git" | "zip";
  patchable: boolean;
  canCommit: boolean;
  canPush: boolean;
  repoUrl?: string | null;
  lastCommitSha?: string | null;
  lastBranchName?: string | null;
  lastPreviewCount?: number;
  lastReadyPreviewCount?: number;
  lastAppliedCount?: number;
  lastOperation?: string;
  currentBranch?: string | null;
  pendingChanges?: boolean;
  changedFiles?: string[];
  changedFilesCount?: number;
  canCommitNow?: boolean;
  branchFiles?: string[];
  branchFilesCount?: number;
};

type PatchPreview = {
  file: string;
  line: number | string;
  type: string;
  secret: string;
  oldLine?: string;
  newLine?: string;
  envName?: string;
  reference?: string;
  status: "ready" | "error";
  reason?: string;
};

type ContributorSummary = {
  key: string;
  author: string;
  email: string | null;
  findingsCount: number;
  latestCommitTime: string | null;
  files: string[];
  findings: { file: string; line: number | string; type: string; commit?: string }[];
};

type CreatedTaskInfo = {
  taskId: string | null;
  taskUrl: string | null;
  dueOn: string | null;
  notificationDelivered: boolean;
  notificationNote: string | null;
};

export type ScanResults = {
  summary?: { secretsFound: number; filesWithSecrets: number };
  vulnerabilities?: Record<string, Secret[]>;
  error?: boolean;
  message?: string;
  clean?: boolean;
  remediation?: RemediationMeta;
  scanMeta?: {
    scannedAt?: string;
    mode?: string;
    sourceKind?: string;
    repoUrl?: string | null;
    branch?: string | null;
    analyzer?: {
      url?: string;
      reviewedCount?: number;
      confirmedCount?: number;
    };
    verification?: {
      performed?: boolean;
      scannedAt?: string;
      branch?: string | null;
      source?: string;
    };
  };
};

// --- Icons ---
const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

// --- CSS Animations ---
const styles = `
.radar-loader { width: 48px; height: 48px; border-radius: 50%; position: relative; display: inline-block; }
.radar-loader::before, .radar-loader::after { content: ""; position: absolute; inset: 0; border-radius: 50%; animation: radar 1.6s linear infinite; border: 2px solid rgba(37, 99, 235, 0.35); }
.radar-loader::after { animation-delay: .4s; transform: scale(.6); }
.radar-inner { width: 14px; height: 14px; background: #2563eb; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%; box-shadow: 0 0 10px rgba(37, 99, 235, 0.4); }
@keyframes radar { 0% { transform: scale(.2); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
`;

const mask = (s: string) => {
  if (!s) return "";
  if (s.length <= 10) return s.replace(/.(?=.{2})/g, "*");
  return s.slice(0, 4) + "..." + s.slice(-4);
};

const normalizeUiError = (message: string) => {
  if (!message) return "Unknown error";
  return message
    .replace(/https:\/\/x-access-token:[^@]+@github\.com\//gi, "https://x-access-token:[REDACTED]@github.com/")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]");
};

const stepState = (done: boolean, active: boolean) =>
  done ? "done" : active ? "active" : "idle";

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
};

/** Mask only the leaked substring inside a real source line (GitHub-style preview). */
const maskSecretInLine = (line: string, secret: string, reveal: boolean) => {
  if (reveal || !secret || secret === "Hidden") return line;
  if (!line.includes(secret)) return line;
  return line.split(secret).join(mask(secret));
};

/** When the scanner value does not exactly match the file text, still redact the leak line until Reveal. */
const displaySnippetLine = (
  line: string,
  secret: string,
  reveal: boolean,
  isLeakLine: boolean
) => {
  if (!isLeakLine) return maskSecretInLine(line, secret, reveal);
  if (reveal || !secret || secret === "Hidden") return line;
  const partial = maskSecretInLine(line, secret, false);
  if (partial !== line) return partial;
  return "/* REDACTED — source differs from detector match; use Reveal to show this line */";
};

/** VS Code–style editor chrome; inline styles so Electron + file:// always paints correctly. */
function SourceSnippetView({
  snippet,
  secret,
  reveal,
  fileTitle,
}: {
  snippet: CodeSnippet;
  secret: string;
  reveal: boolean;
  fileTitle?: string;
}) {
  const mono = "Consolas, 'Cascadia Code', 'Fira Code', ui-monospace, monospace";
  const title = fileTitle || "source";

  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #474747",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          height: 36,
          background: "#3c3c3c",
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          paddingRight: 12,
          gap: 10,
          borderBottom: "1px solid #252526",
        }}
      >
        <span style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: "#cccccc",
            fontFamily: "system-ui, Segoe UI, sans-serif",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={title}
        >
          Code — {title}
        </span>
        <span style={{ fontSize: 9, color: "#858585", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          VS Code
        </span>
      </div>
      <div
        style={{
          background: "#1e1e1e",
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {snippet.lines.map((row) => {
          const isLeak = row.num === snippet.highlightLine;
          const display = displaySnippetLine(row.text, secret, reveal, isLeak);
          const text = display || "\u00a0";
          return (
            <div
              key={row.num}
              style={{
                display: "flex",
                minHeight: "1.55em",
                background: isLeak ? "rgba(241, 76, 76, 0.14)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 48,
                  flexShrink: 0,
                  textAlign: "right",
                  paddingRight: 8,
                  paddingLeft: 4,
                  fontFamily: mono,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: isLeak ? "#f48771" : "#858585",
                  borderRight: "1px solid #2d2d2d",
                  background: isLeak ? "rgba(45, 31, 31, 0.85)" : "#1e1e1e",
                  userSelect: "none",
                }}
              >
                {row.num}
              </span>
              <span
                style={{
                  flex: 1,
                  paddingLeft: 12,
                  paddingRight: 12,
                  fontFamily: mono,
                  fontSize: 12,
                  lineHeight: 1.55,
                  whiteSpace: "pre",
                  overflowX: "auto",
                  color: isLeak ? "#f3e8e8" : "#d4d4d4",
                }}
              >
                {text}
              </span>
              {isLeak ? (
                <span
                  style={{ width: 3, flexShrink: 0, background: "#f14c4c" }}
                  title="Secret on this line"
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const isClean = (r: ScanResults | null) => {
  if (!r) return false;
  if (r.clean !== undefined) return !!r.clean;
  return (r.summary?.secretsFound ?? 0) === 0 && (r.summary?.filesWithSecrets ?? 0) === 0;
};

const formatCommitTime = (value?: string | null) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

function UnifiedDiffLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => {
        const isAdd = line.startsWith("+") && !line.startsWith("+++");
        const isRemove = line.startsWith("-") && !line.startsWith("---");
        const isHunk = line.startsWith("@@");
        const isMeta =
          line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");
        const bgClass = isAdd
          ? "bg-emerald-500/10"
          : isRemove
            ? "bg-rose-500/10"
            : isHunk
              ? "bg-blue-500/10"
              : "bg-transparent";
        const textClass = isAdd
          ? "text-emerald-300"
          : isRemove
            ? "text-rose-300"
            : isHunk
              ? "text-blue-300"
              : isMeta
                ? "text-slate-400"
                : "text-slate-200";
        const markerClass = isAdd
          ? "text-emerald-400"
          : isRemove
            ? "text-rose-400"
            : isHunk
              ? "text-blue-400"
              : "text-slate-600";

        return (
          <div
            key={`d-${index}-${String(line).slice(0, 24)}`}
            className={`grid grid-cols-[56px_1fr] border-b border-zinc-800/60 ${bgClass}`}
          >
            <div className={`px-3 py-1.5 text-right select-none ${markerClass}`}>{index + 1}</div>
            <div className={`px-3 py-1.5 whitespace-pre-wrap break-words ${textClass}`}>{line || " "}</div>
          </div>
        );
      })}
    </>
  );
}

export default function Analysis() {
  const { user, token, role, setUser, refreshUser } =
    userAuth() || { user: null, token: null, role: null, setUser: () => {}, refreshUser: async () => {} };
  const [gitUrl, setGitUrl] = useState<string>("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openCodeRowKey, setOpenCodeRowKey] = useState<string | null>(null);
  const [patchBusyKey, setPatchBusyKey] = useState<string | null>(null);
  const [patchPreviews, setPatchPreviews] = useState<PatchPreview[]>([]);
  const [patchDiff, setPatchDiff] = useState<string>("");
  const [branchName, setBranchName] = useState<string>(() => `secure/fix-secrets-${new Date().toISOString().slice(0, 10)}`);
  const [commitMessage, setCommitMessage] = useState<string>("fix(secrets): move hardcoded secrets to environment variables");
  const [githubToken, setGithubToken] = useState<string>("");
  const [saveGithubToken, setSaveGithubToken] = useState<boolean>(true);
  const [githubTokenLoaded, setGithubTokenLoaded] = useState<boolean>(false);
  const [showShipAdvanced, setShowShipAdvanced] = useState<boolean>(false);
  const [shipMode, setShipMode] = useState<"commit" | "push">("push");
  const [lastCommitSha, setLastCommitSha] = useState<string | null>(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [taskBusyContributorKey, setTaskBusyContributorKey] = useState<string | null>(null);
  const [createdTasksByContributor, setCreatedTasksByContributor] = useState<Record<string, CreatedTaskInfo>>({});
  const PAGE_SIZE = 6;

  const axiosInstance = useMemo(
    () =>
      axios.create({
        baseURL: "http://127.0.0.1:3000",
        timeout: 600000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [token]
  );

  const logToConsole = (text: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLines((s) => [...s, `[${timestamp}] ${text}`].slice(-300));
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI && window.electronAPI.onSavePDFSuccess) {
      const handleSuccess = (args: { message: string; filePath: string }) => {
        logToConsole(`PDF Save Confirmation: ${args.filePath}`);
        setToastMessage(`Download Complete: Report saved to ${args.filePath.split(/[\\/]/).pop()}`);
      };
      window.electronAPI.onSavePDFSuccess(handleSuccess);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadGithubToken = async () => {
      if (typeof window === "undefined" || !window.electronAPI?.getGithubToken) {
        setGithubTokenLoaded(true);
        return;
      }
      const saved = await window.electronAPI.getGithubToken();
      if (!active) return;
      if (typeof saved === "string" && saved.trim()) {
        setGithubToken(saved);
      }
      setGithubTokenLoaded(true);
    };
    loadGithubToken();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!githubTokenLoaded || typeof window === "undefined") return;
    if (!window.electronAPI?.storeGithubToken || !window.electronAPI?.clearGithubToken) return;

    const timeoutId = window.setTimeout(async () => {
      if (!saveGithubToken) {
        await window.electronAPI.clearGithubToken();
        return;
      }
      const trimmed = githubToken.trim();
      if (trimmed) {
        await window.electronAPI.storeGithubToken(trimmed);
      } else {
        await window.electronAPI.clearGithubToken();
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [githubToken, saveGithubToken, githubTokenLoaded]);

  useEffect(() => {
    setOpenCodeRowKey(null);
  }, [page]);

  useEffect(() => {
    if (!diffModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDiffModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diffModalOpen]);

  useEffect(() => {
    if (!patchDiff) setDiffModalOpen(false);
  }, [patchDiff]);

  const handleScan = async (scanType: "url" | "zip", payload: any) => {
    setLoading(true);
    setResults(null);
    setConsoleLines([]);
    setSelectedFile(null);
    setOpenCodeRowKey(null);
    setToastMessage(null);
    setPatchBusyKey(null);
    setPatchPreviews([]);
    setPatchDiff("");
    setLastCommitSha(null);
    setTaskBusyContributorKey(null);
    setCreatedTasksByContributor({});
    try {
      let response;
      if (scanType === "url") {
        logToConsole(`→ Initiating remote scan for: ${payload.url}`);
        response = await axiosInstance.post("/scan-url-remediation", payload);
      } else {
        logToConsole("→ Initiating local archive deep scan...");
        const headers = { "Content-Type": "multipart/form-data" } as any;
        response = await axiosInstance.post("/scan-zip-remediation", payload, { headers });
      }
      logToConsole("← Scan engine returned results.");

      const scanResults: ScanResults = response.data;
      setResults(scanResults);
      setLastCommitSha(scanResults.remediation?.lastCommitSha ?? null);
      await sendRepoDetails(scanResults);

      const secretsFound = scanResults.summary?.secretsFound ?? 0;
      const message = scanResults.error
        ? `Scan failed: ${scanResults.message}`
        : secretsFound === 0
        ? "✅ Scan Complete! Your repository appears safe and clean."
        : `⚠️ Detected ${secretsFound} vulnerabilities across ${scanResults.summary!.filesWithSecrets} files.`;

      setToastMessage(message);
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Unknown error";
      setResults({ error: true, message });
      logToConsole(`Error: ${message}`);
      setToastMessage(`Scan failed: ${message}`);
    } finally {
      setLoading(false);
      setPage(1);
    }
  };

  const handleUrlSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) return alert("Please enter a valid Git URL.");
    handleScan("url", { url: gitUrl });
  };

  const handleZipSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!zipFile) return alert("Please select a ZIP file to upload.");
    const formData = new FormData();
    formData.append("zipfile", zipFile);
    handleScan("zip", formData);
  };

  const chartData = useMemo(() => {
    const byType: Record<string, number> = {};
    const fileCounts: Record<string, number> = {};
    if (!results?.vulnerabilities) return { pie: [], bar: [] };

    Object.entries(results.vulnerabilities).forEach(([file, secrets]) => {
      fileCounts[file] = secrets.length;
      secrets.forEach((s) => {
        byType[s.type] = (byType[s.type] || 0) + 1;
      });
    });

    const pie = Object.entries(byType).map(([name, value]) => ({ name, value }));
    const bar = Object.entries(fileCounts).map(([file, value]) => ({ file: file.split("/").slice(-2).join("/"), value }));

    bar.sort((a, b) => b.value - a.value);
    return { pie, bar: bar.slice(0, 10) };
  }, [results]);

  const flatRows = useMemo(() => {
    if (!results?.vulnerabilities) return [];
    const arr: { file: string; secret: Secret; findingKey: string }[] = [];
    Object.entries(results.vulnerabilities).forEach(([file, secrets]) => {
      secrets.forEach((s, indexInFile) => arr.push({ file, secret: s, findingKey: `${file}#${indexInFile}` }));
    });
    return arr;
  }, [results]);

  const contributorSummaries = useMemo<ContributorSummary[]>(() => {
    const byContributor = new Map<string, ContributorSummary>();

    flatRows.forEach((row) => {
      const email = (row.secret.email || row.secret.authorEmail || null)?.trim() || null;
      const author = (row.secret.author || row.secret.assignedTo || "Unknown contributor").trim();
      const contributorKey = (email || author).toLowerCase();

      if (!byContributor.has(contributorKey)) {
        byContributor.set(contributorKey, {
          key: contributorKey,
          author,
          email,
          findingsCount: 0,
          latestCommitTime: null,
          files: [],
          findings: [],
        });
      }

      const entry = byContributor.get(contributorKey)!;
      entry.findingsCount += 1;
      if (!entry.files.includes(row.file)) {
        entry.files.push(row.file);
      }

      entry.findings.push({
        file: row.file,
        line: row.secret.line,
        type: row.secret.type,
        commit: row.secret.commit,
      });

      if (row.secret.commitTime) {
        const current = new Date(row.secret.commitTime).getTime();
        const previous = entry.latestCommitTime ? new Date(entry.latestCommitTime).getTime() : 0;
        if (!Number.isNaN(current) && current > previous) {
          entry.latestCommitTime = row.secret.commitTime;
        }
      }
    });

    return Array.from(byContributor.values()).sort((a, b) => b.findingsCount - a.findingsCount);
  }, [flatRows]);

  const authorSummary = useMemo(() => {
    const attributed = flatRows.filter((row) => row.secret.author || row.secret.email || row.secret.commitTime);
    if (!attributed.length) {
      return {
        count: 0,
        author: null as string | null,
        email: null as string | null,
        commitTime: null as string | null,
      };
    }

    const first = attributed[0].secret;
    return {
      count: attributed.length,
      author: first.author || first.assignedTo || null,
      email: first.email || null,
      commitTime: first.commitTime || null,
    };
  }, [flatRows]);

  const aiSummary = useMemo(() => {
    const scored = flatRows.filter((row) => row.secret.aiAnalysis?.confidence != null);
    const avgConfidence = scored.length
      ? Math.round(
          scored.reduce((sum, row) => sum + (row.secret.aiAnalysis?.confidence ?? 0), 0) / scored.length * 100
        )
      : 0;
    return {
      scoredCount: scored.length,
      avgConfidence,
    };
  }, [flatRows]);

  const pagedRows = flatRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(flatRows.length / PAGE_SIZE));
  const diffLines = useMemo(() => patchDiff.split(/\r?\n/).filter((line, index, arr) => !(index === arr.length - 1 && line === "")), [patchDiff]);

  const sendRepoDetails = async (data: ScanResults) => {
    if (!gitUrl || !user) return;

    const totalSecrets = data?.summary?.secretsFound ?? 0;
    const status = data?.error ? "Error" : totalSecrets > 0 ? "Vulnerable" : "Clean";

    const body = {
      userId: user._id,
      gitUrl: [gitUrl],
      Branch: "main",
      LastScanned: new Date().toISOString(),
      Status: status,
      VerifiedRepositories: status === "Clean" ? 1 : 0,
      UnverifiedRepositories: status === "Vulnerable" ? 1 : 0,
      TotalSecrets: totalSecrets,
      FilesWithSecrets: data?.summary?.filesWithSecrets ?? 0,
    };

    try {
      logToConsole("→ Syncing telemetry with security database...");
      const { data: res } = await axios.post("http://localhost:3000/api/numberkeys", body);
      logToConsole("✅ Telemetry sync complete.");
      if (res?.user) {
        setUser(res.user);
        refreshUser();
      }
    } catch (err: any) {
      logToConsole("❌ Telemetry sync failed: " + (err.message || err));
    }
  };

  const isOrganizationDeveloper = role === "ORG_OWNER" || role === "EMPLOYEE";

  const handleCreateAsanaTask = async (contributor: ContributorSummary) => {
    if (!isOrganizationDeveloper) {
      setToastMessage("This feature is available only for organization developers.");
      return;
    }

    if (!contributor.email) {
      setToastMessage("Contributor email is required to assign an Asana task.");
      return;
    }

    setTaskBusyContributorKey(contributor.key);
    try {
      const payload = {
        provider: "asana",
        contributorName: contributor.author,
        contributorEmail: contributor.email,
        repoUrl: scanMeta?.repoUrl || gitUrl || remediation?.repoUrl || null,
        branch:
          remediation?.lastBranchName ||
          remediation?.currentBranch ||
          scanMeta?.verification?.branch ||
          scanMeta?.branch ||
          "main",
        summary: {
          secretsFound: results?.summary?.secretsFound ?? contributor.findingsCount,
          filesWithSecrets: results?.summary?.filesWithSecrets ?? contributor.files.length,
        },
        findings: contributor.findings,
      };

      const response = await axiosInstance.post("/integrations/tasks", payload);
      const task = response.data?.task || {};
      const notification = response.data?.notification || task.notification || null;

      setCreatedTasksByContributor((prev) => ({
        ...prev,
        [contributor.key]: {
          taskId: task.taskId || null,
          taskUrl: task.taskUrl || null,
          dueOn: task.dueOn || null,
          notificationDelivered: !!notification?.delivered,
          notificationNote: notification?.delivered
            ? "Email notification sent"
            : notification?.reason || (notification?.skipped ? "Email notification skipped" : null),
        },
      }));

      logToConsole(`✅ Asana task created for ${contributor.email}.`);
      if (notification?.delivered) {
        setToastMessage("Asana task created and email notification sent.");
      } else if (notification?.skipped) {
        setToastMessage("Asana task created. Email notification skipped.");
      } else {
        setToastMessage(task.taskUrl ? "Asana task created and assigned." : "Asana task created.");
      }
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Unable to create Asana task.");
      logToConsole(`Error: ${message}`);
      setToastMessage(message);
    } finally {
      setTaskBusyContributorKey(null);
    }
  };

  const patchSessionId = results?.remediation?.sessionId ?? null;
  const canUsePatchAgent = !!patchSessionId && !results?.error;
  const remediation = results?.remediation;
  const scanMeta = results?.scanMeta;
  const previewReadyCount = remediation?.lastReadyPreviewCount ?? 0;
  const appliedCount = remediation?.lastAppliedCount ?? 0;
  const hasPendingChanges = !!remediation?.pendingChanges;
  const hasCommittedRemediation = !!remediation?.lastCommitSha || !!lastCommitSha;
  const canCommitNow = !!remediation?.canCommit && !!remediation?.canCommitNow;
  const canPushNow = !!remediation?.canPush && (hasPendingChanges || hasCommittedRemediation);
  const showShipPanel = hasPendingChanges || hasCommittedRemediation;
  const verificationPerformed = !!scanMeta?.verification?.performed;
  const verificationRemaining = results?.summary?.secretsFound ?? 0;
  const branchFiles = remediation?.branchFiles?.length ? remediation.branchFiles : remediation?.changedFiles ?? [];
  const branchFilesCount = remediation?.branchFilesCount ?? branchFiles.length;
  const effectiveShipMode: "commit" | "push" = hasPendingChanges ? shipMode : "push";
  const workflowSteps = [
    {
      label: "Preview",
      detail: previewReadyCount > 0 ? `${previewReadyCount} fixes ready` : "Generate patch suggestions",
      state: stepState(previewReadyCount > 0, remediation?.lastOperation === "preview"),
    },
    {
      label: "Apply",
      detail: appliedCount > 0 ? `${appliedCount} fixes applied` : "Write env-based changes",
      state: stepState(appliedCount > 0 || hasPendingChanges, remediation?.lastOperation === "apply"),
    },
    {
      label: "Commit",
      detail: remediation?.lastCommitSha ? "Remediation commit created" : hasPendingChanges ? "Ready to commit" : "Nothing to commit yet",
      state: stepState(!!remediation?.lastCommitSha, remediation?.lastOperation === "commit"),
    },
    {
      label: "Push",
      detail: remediation?.lastOperation === "push" ? "Branch pushed" : canPushNow ? "Ready to push" : "Needs commit first",
      state: stepState(remediation?.lastOperation === "push", remediation?.lastOperation === "push"),
    },
  ];

  const withRemediationMeta = (nextResults: ScanResults | null, remediation?: RemediationMeta) => {
    if (!nextResults) return nextResults;
    return {
      ...nextResults,
      remediation: remediation ?? nextResults.remediation,
    };
  };

  const buildFindingPayload = (row: { file: string; secret: Secret }) => ({
    file: row.file,
    secret: row.secret.secret,
    type: row.secret.type,
    line: row.secret.line,
  });

  const handlePatchPreview = async (applyAll = true) => {
    if (!patchSessionId) return;
    setPatchBusyKey("preview");
    try {
      logToConsole("→ Generating remediation preview...");
      const { data } = await axiosInstance.post("/patch/preview", {
        sessionId: patchSessionId,
        applyAll,
      });
      setPatchPreviews(data.previews ?? []);
      setResults((prev) => withRemediationMeta(prev, data.remediation));
      const readyCount = (data.previews ?? []).filter((p: PatchPreview) => p.status === "ready").length;
      setToastMessage(`Prepared ${readyCount} patch preview${readyCount === 1 ? "" : "s"}.`);
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Unable to preview patch.");
      setToastMessage(message);
      logToConsole(`Error: ${message}`);
    } finally {
      setPatchBusyKey(null);
    }
  };

  const handlePatchApply = async (row?: { file: string; secret: Secret; findingKey: string }) => {
    if (!patchSessionId) return;
    const busyKey = row?.findingKey ?? "all";
    setPatchBusyKey(busyKey);
    try {
      logToConsole(row ? `→ Applying patch for ${row.file}#${row.secret.line}` : "→ Applying remediation to all detected secrets...");
      const payload = row
        ? { sessionId: patchSessionId, finding: buildFindingPayload(row) }
        : { sessionId: patchSessionId, applyAll: true };
      const { data } = await axiosInstance.post("/patch/apply", payload);
      setPatchPreviews(data.previews ?? []);
      setPatchDiff(data.diff ?? "");
      if (data.results) {
        setResults(data.results);
        setLastCommitSha(data.results.remediation?.lastCommitSha ?? null);
      } else {
        setResults((prev) => withRemediationMeta(prev, data.remediation));
      }
      const changedCount = (data.changedFiles ?? []).length;
      setToastMessage(changedCount > 0 ? `Patch applied across ${changedCount} file${changedCount === 1 ? "" : "s"}.` : "Patch applied.");
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Patch failed.");
      setToastMessage(message);
      logToConsole(`Error: ${message}`);
    } finally {
      setPatchBusyKey(null);
    }
  };

  const handleRefreshDiff = async () => {
    if (!patchSessionId) return;
    setPatchBusyKey("diff");
    try {
      const { data } = await axiosInstance.post("/patch/diff", { sessionId: patchSessionId });
      setPatchDiff(data.diff ?? "");
      setResults((prev) => withRemediationMeta(prev, data.remediation));
      setToastMessage(data.diff ? "Latest remediation diff loaded." : "No uncommitted remediation diff found.");
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Unable to load diff.");
      setToastMessage(message);
      logToConsole(`Error: ${message}`);
    } finally {
      setPatchBusyKey(null);
    }
  };


  const handleCommitPatch = async (push: boolean) => {
    if (!patchSessionId) return;
    if (!hasPendingChanges && !(push && hasCommittedRemediation)) {
      setToastMessage("Apply a patch first. There are no remediation changes waiting to be committed.");
      return;
    }
    if (push && !githubToken.trim()) {
      setToastMessage("GitHub token is required before pushing a remediation branch.");
      return;
    }
    setPatchBusyKey(push ? "push" : "commit");
    try {
      logToConsole(push ? "→ Committing and pushing remediation branch..." : "→ Creating remediation commit...");
      const { data } = await axiosInstance.post("/patch/commit", {
        sessionId: patchSessionId,
        branchName,
        commitMessage,
        push,
        githubToken: githubToken.trim() || undefined,
      });
      setPatchDiff(data.diff ?? "");
      let nextResults = data.results ?? null;
      if (push && !nextResults) {
        logToConsole("→ Push completed. Triggering verification scan...");
        const verifyResponse = await axiosInstance.post("/patch/verify", {
          sessionId: patchSessionId,
          githubToken: githubToken.trim() || undefined,
        });
        nextResults = verifyResponse.data?.results ?? null;
      }

      if (nextResults) {
        setResults(nextResults);
        await sendRepoDetails(nextResults);
        const remaining = nextResults.summary?.secretsFound ?? 0;
        logToConsole(
          remaining === 0
            ? "✓ Post-push verification complete. No secrets remain in the pushed branch."
            : `⚠ Post-push verification complete. ${remaining} secret${remaining === 1 ? "" : "s"} still remain in the pushed branch.`
        );
      } else {
        setResults((prev) => withRemediationMeta(prev, data.remediation));
      }
      const nextSha = data.commit?.commitSha ?? data.remediation?.lastCommitSha ?? null;
      setLastCommitSha(nextSha);
      setToastMessage(
        data.commit?.pushed
          ? (() => {
              const remaining = nextResults?.summary?.secretsFound ?? null;
              if (remaining == null) return `Branch ${data.commit.branchName} pushed to GitHub.`;
              return remaining === 0
                ? `Branch ${data.commit.branchName} pushed. Post-push scan found no remaining secrets.`
                : `Branch ${data.commit.branchName} pushed. Post-push scan still found ${remaining} secret${remaining === 1 ? "" : "s"}.`;
            })()
          : `Commit created on ${data.commit?.branchName ?? branchName}.`
      );
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Commit failed.");
      setToastMessage(message);
      logToConsole(`Error: ${message}`);
    } finally {
      setPatchBusyKey(null);
    }
  };

  const handleRollbackPatch = async () => {
    if (!patchSessionId) return;
    setPatchBusyKey("rollback");
    try {
      logToConsole("→ Reverting the last remediation commit...");
      const { data } = await axiosInstance.post("/patch/rollback", {
        sessionId: patchSessionId,
        commitSha: lastCommitSha ?? undefined,
      });
      setPatchDiff(data.diff ?? "");
      setPatchPreviews([]);
      if (data.results) {
        setResults(data.results);
      } else {
        setResults((prev) => withRemediationMeta(prev, data.remediation));
      }
      setLastCommitSha(null);
      setToastMessage("Remediation rollback commit created.");
    } catch (error: any) {
      const message = normalizeUiError(error.response?.data?.message || error.message || "Rollback failed.");
      setToastMessage(message);
      logToConsole(`Error: ${message}`);
    } finally {
      setPatchBusyKey(null);
    }
  };

  const generatePDFReport = () => {
    if (!results || results.error) return;
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const repoSource = gitUrl || (zipFile ? zipFile.name : "ZIP Upload");

    doc.setFontSize(22); doc.text("SecureScan Vulnerability Report", 14, 22);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Target Source: ${repoSource}`, 14, 32); 
    doc.text(`Generated On: ${now}`, 14, 38);

    doc.setFontSize(14); doc.setTextColor(0); doc.text("Executive Summary", 14, 50);
    doc.setFontSize(12); doc.setTextColor(50);
    doc.text(`Total Secrets Exposed: ${results.summary?.secretsFound ?? 0}`, 14, 60);
    doc.text(`Files Compromised: ${results.summary?.filesWithSecrets ?? 0}`, 14, 68);
    doc.text(`Security Posture: ${isClean(results) ? "Clean" : "Vulnerable"}`, 14, 76);

    if (flatRows.length > 0) {
      autoTable(doc, {
        startY: 85,
        head: [["File Path", "Secret (Masked)", "Category", "Line", "Commit Hash", "Branch"]],
        body: flatRows.map(r => [r.file, mask(r.secret.secret), r.secret.type, r.secret.line, r.secret.commit?.substring(0, 8) ?? "N/A", r.secret.branch ?? "N/A"]),
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8, cellPadding: 3 }
      });
    }

    const filename = `SecureScan_Audit_${Date.now()}.pdf`;

    if (window.electronAPI?.savePDF) {
      window.electronAPI.savePDF(doc.output("datauristring"), filename);
    } else {
      doc.save(filename);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-blue-500/20 pb-16">
      <style>{styles}</style>

      {/* Top Header Navigation */}
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-1">
                {workflowSteps.map((step, idx) => {
                  const isDone = step.state === "done";
                  const isActive = step.state === "active";
                  return (
                    <React.Fragment key={step.label}>
                      <div className="flex flex-col items-center" title={`${step.label}: ${step.detail}`}>
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${
                            isDone
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.25)]"
                              : isActive
                              ? "border-blue-400 bg-blue-500/20 text-blue-300 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.25)]"
                              : "border-zinc-600 bg-zinc-800/50 text-zinc-500"
                          }`}
                        >
                          {isDone ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span className={`text-[9px] mt-1 font-semibold uppercase tracking-wider ${
                          isDone ? "text-emerald-400" : isActive ? "text-blue-400" : "text-zinc-500"
                        }`}>
                          {step.label}
                        </span>
                      </div>
                      {idx < workflowSteps.length - 1 && (
                        <div
                          className={`h-0.5 w-8 mb-4 rounded-full transition-all duration-300 ${
                            workflowSteps[idx + 1].state === "done" || workflowSteps[idx].state === "done"
                              ? "bg-emerald-500/50"
                              : "bg-zinc-700"
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 min-w-[180px]">
                    <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wide">Engine status</p>
                    <div className="flex items-center gap-2 mt-2">
                      {loading && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />}
                      {!loading && <div className={`w-2.5 h-2.5 rounded-full ${results?.error ? 'bg-rose-500' : isClean(results) ? 'bg-emerald-500' : results ? 'bg-amber-500' : 'bg-slate-600'}`} />}
                      <p className={`text-sm font-bold ${loading ? "text-blue-400" : results?.error ? "text-rose-400" : isClean(results) ? "text-emerald-400" : results ? "text-amber-400" : "text-slate-400"}`}>
                        {loading ? "Analyzing..." : results?.error ? "System Error" : isClean(results) ? "System Secure" : results ? "Vulnerabilities Found" : "Standby"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3 min-w-[150px]">
                    <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wide">Analyzer</p>
                    <p className="text-lg font-semibold text-blue-300 mt-2">
                      {aiSummary.scoredCount > 0 ? `${aiSummary.avgConfidence}% avg` : "Not scored"}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {aiSummary.scoredCount} key{aiSummary.scoredCount === 1 ? "" : "s"} scored by analyzer
                    </p>
                  </div>

                  {loading ? (
                    <div className="radar-loader" aria-hidden><div className="radar-inner" /></div>
                  ) : results && !results.error && !isClean(results) && (
                    <button onClick={generatePDFReport} className="px-4 py-2.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors flex items-center">
                      <DownloadIcon /> Export PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-6">
        
        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* URL Card */}
          <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl">
            <h2 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
              <LinkIcon /> Remote Repository Scan
            </h2>
            <form onSubmit={handleUrlSubmit} className="flex gap-3">
              <input
                type="url"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/organization/repo.git"
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-blue-500 text-sm outline-none transition-colors"
              />
              <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm transition-colors">
                Initialize Scan
              </button>
            </form>
          </div>

          {/* ZIP Card */}
          <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shadow-xl">
            <h2 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
              <UploadIcon /> Local Archive Upload
            </h2>
            <form onSubmit={handleZipSubmit} className="flex items-center gap-4 bg-zinc-950 border border-zinc-700 rounded-xl px-2 py-1.5 pl-4">
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files ? e.target.files[0] : null)}
                className="flex-1 text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-white hover:file:bg-slate-700 cursor-pointer"
              />
              <button type="submit" disabled={loading || !zipFile} className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-sm transition-colors">
                Upload
              </button>
            </form>
          </div>
        </div>

        {/* Secure Banner */}
        {results && isClean(results) && !loading && !results.error && (
          <div className="p-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.1)] flex items-center gap-4">
            <ShieldCheckIcon />
            <div>
              <h3 className="text-emerald-400 font-bold text-lg">System Secure: Zero Vulnerabilities Detected</h3>
              <p className="text-emerald-500/80 text-sm mt-0.5">{results.message ?? "Deep layer inspection completed. No exposed secrets found in this codebase."}</p>
            </div>
          </div>
        )}

        {results?.scanMeta && !results.error && (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Scan Timeline</p>
              <p className="text-lg font-semibold text-white mt-2">
                {formatTimestamp(scanMeta?.scannedAt)}
              </p>
              <p className="text-xs text-slate-500 mt-2 capitalize">{scanMeta?.mode?.replace(/-/g, " ") || "scan"}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">AI Validation</p>
              <p className="text-lg font-semibold text-blue-300 mt-2">
                {scanMeta?.analyzer?.reviewedCount ?? 0} reviewed
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {scanMeta?.analyzer?.confirmedCount ?? 0} scored as likely secrets before response
              </p>
              <p className="text-[11px] text-slate-500 mt-2 truncate" title={scanMeta?.analyzer?.url || "https://secure-scan-ai-risk.onrender.com/analyze"}>
                Source: {(scanMeta?.analyzer?.url || "https://secure-scan-ai-risk.onrender.com/analyze").replace(/^https?:\/\//, "")}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Branch Snapshot</p>
              <p className="text-lg font-semibold text-white mt-2 font-mono">
                {remediation?.lastBranchName || remediation?.currentBranch || "main"}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {branchFilesCount > 0
                  ? `${branchFilesCount} file${branchFilesCount === 1 ? "" : "s"} tracked in the remediation branch`
                  : "Branch will be created once a patch is committed"}
              </p>
            </div>
            <div className={`rounded-lg border p-4 ${verificationPerformed ? verificationRemaining === 0 ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/20 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/70"}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Verification Scan</p>
              <p className={`text-lg font-semibold mt-2 ${verificationPerformed ? verificationRemaining === 0 ? "text-emerald-300" : "text-amber-300" : "text-slate-300"}`}>
                {verificationPerformed ? verificationRemaining === 0 ? "No secrets remain" : `${verificationRemaining} still detected` : "Waiting for push"}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {verificationPerformed
                  ? `Auto-ran on ${formatTimestamp(scanMeta?.verification?.scannedAt || scanMeta?.scannedAt)} for ${scanMeta?.verification?.branch || remediation?.lastBranchName || "secure branch"}${scanMeta?.verification?.source === "fresh-remote-clone" ? " using a fresh remote clone" : ""}`
                  : "Runs automatically once the remediation branch is pushed."}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Author Trace</p>
              <p className="text-lg font-semibold text-white mt-2">
                {authorSummary.author || (scanMeta?.sourceKind === "git" ? "Not resolved" : "Git only")}
              </p>
              <p className="text-xs text-slate-500 mt-2 truncate" title={authorSummary.email || ""}>
                {authorSummary.email || (scanMeta?.sourceKind === "git" ? "Email unavailable" : "ZIP scans do not include blame")}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                {authorSummary.count > 0
                  ? `${authorSummary.count} finding${authorSummary.count === 1 ? "" : "s"} enriched • ${formatCommitTime(authorSummary.commitTime)}`
                  : scanMeta?.sourceKind === "git"
                    ? "Git blame metadata not attached to this response yet."
                    : "Use a Git repository scan to view author details."}
              </p>
            </div>
          </section>
        )}

        {!results?.error && contributorSummaries.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Contributor Remediation Queue</h3>
              <p className="text-xs text-slate-500">
                Assign Asana remediation tasks per contributor with deadlines and email notification.
                {!isOrganizationDeveloper ? " (Visible for all users; assignment requires organization role.)" : ""}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {contributorSummaries.map((contributor) => {
                const createdTask = createdTasksByContributor[contributor.key];
                return (
                  <div key={contributor.key} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{contributor.author}</p>
                        <p className="text-xs text-slate-500 truncate mt-1">{contributor.email || "Email unavailable"}</p>
                        <p className="text-[11px] text-slate-500 mt-2">
                          {contributor.findingsCount} finding{contributor.findingsCount === 1 ? "" : "s"} across {contributor.files.length} file{contributor.files.length === 1 ? "" : "s"}
                        </p>
                        {contributor.latestCommitTime && (
                          <p className="text-[11px] text-slate-500 mt-1">Latest commit: {formatCommitTime(contributor.latestCommitTime)}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-2">
                        <button
                          type="button"
                          disabled={!contributor.email || taskBusyContributorKey !== null}
                          onClick={() => handleCreateAsanaTask(contributor)}
                          className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {taskBusyContributorKey === contributor.key ? "Assigning..." : "Assign Asana Task"}
                        </button>

                        {createdTask?.taskUrl && (
                          <a
                            href={createdTask.taskUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-300 hover:text-blue-200 underline"
                          >
                            Open Task
                          </a>
                        )}
                        {createdTask?.dueOn && (
                          <p className="text-[11px] text-slate-500">Due: {createdTask.dueOn}</p>
                        )}
                        {createdTask?.notificationNote && (
                          <p className={`text-[11px] ${createdTask.notificationDelivered ? "text-emerald-400" : "text-amber-400"}`}>
                            {createdTask.notificationNote}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {results?.remediation && !results.error && (
          <section className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/50 space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">Patch Agent</h3>
                  <span className="px-2.5 py-1 rounded-full border border-blue-400/20 bg-blue-500/10 text-[10px] font-bold uppercase tracking-[0.22em] text-blue-300">
                    {results.remediation.sourceType === "git" ? "Live Git Workspace" : "Local ZIP Workspace"}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.22em] ${results.remediation.canPush ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-amber-400/20 bg-amber-500/10 text-amber-300"}`}>
                    {results.remediation.canPush ? "Push Ready" : "Preview Only"}
                  </span>
                </div>
                <p className="text-sm text-slate-300/90 mt-3 max-w-2xl leading-6">
                  Review patch previews, apply fixes, then commit or push the remediation branch after approval.
                </p>
                <p className="text-[11px] text-slate-500 mt-3 font-mono">
                  Session: {results.remediation.sessionId} • Source: {results.remediation.sourceType === "git" ? "Git repository" : "ZIP workspace"}
                </p>
              </div>
            </div>



            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Workspace Branch</p>
                <p className="text-base font-semibold text-white mt-2 font-mono">
                  {remediation?.currentBranch || remediation?.lastBranchName || "main"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Pending Changes</p>
                <p className={`text-base font-semibold mt-2 ${hasPendingChanges ? "text-amber-300" : "text-slate-400"}`}>
                  {hasPendingChanges ? `${remediation?.changedFilesCount ?? 0} files ready to commit` : "No uncommitted changes"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Last Action</p>
                <p className="text-base font-semibold text-blue-300 mt-2 capitalize">{remediation?.lastOperation || "scan"}</p>
              </div>
            </div>

            {branchFiles.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Branch Changes</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {hasPendingChanges
                        ? "Files currently changed in the remediation workspace."
                        : "Files preserved from the latest remediation commit or push."}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full border border-zinc-700 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                    {branchFilesCount} files
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {branchFiles.slice(0, 8).map((file) => (
                    <span key={file} className="px-3 py-1.5 rounded-full border border-zinc-800 bg-slate-950/50 text-[11px] font-mono text-slate-300">
                      {file}
                    </span>
                  ))}
                  {branchFiles.length > 8 && (
                    <span className="px-3 py-1.5 rounded-full border border-zinc-800 bg-slate-950/50 text-[11px] font-semibold text-slate-400">
                      +{branchFiles.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {showShipPanel && (
              <div className="rounded-lg border border-emerald-500/15 bg-[linear-gradient(180deg,rgba(16,185,129,0.07),rgba(2,6,23,0.92))] p-4">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-300 font-bold">Ship Fix</p>
                      <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.2em] ${hasPendingChanges ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-slate-900 text-slate-300"}`}>
                        {hasPendingChanges ? "Ready To Commit" : hasCommittedRemediation ? "Commit Created" : "Waiting"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-3 max-w-2xl leading-6">
                      After patching, ship the secure fix to GitHub from here. We keep this step separate so the first scan experience stays focused and clean.
                    </p>
                    {hasPendingChanges && (
                      <div className="mt-4 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                        <button
                          type="button"
                          onClick={() => setShipMode("commit")}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            shipMode === "commit"
                              ? "bg-slate-200 text-slate-950"
                              : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          Commit Only
                        </button>
                        <button
                          type="button"
                          onClick={() => setShipMode("push")}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            shipMode === "push"
                              ? "bg-emerald-400 text-slate-950"
                              : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          Commit & Push
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-3">
                      {effectiveShipMode === "push"
                        ? "After a successful push, the app automatically runs one more scan and shows whether any API keys or secrets still remain."
                        : "Choose commit only if you want to review the branch locally before pushing it to GitHub."}
                    </p>
                  </div>
                  <div className="w-full xl:w-[360px] rounded-lg border border-emerald-500/10 bg-black/15 p-3 space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Target Branch</label>
                      <input
                        type="text"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder="secure/fix-secrets-2026-04-12"
                        className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white outline-none focus:border-blue-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-2">
                        The remediation commit and push will use this branch name.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCommitPatch(effectiveShipMode === "push")}
                        disabled={(effectiveShipMode === "push" ? !canPushNow : !canCommitNow) || patchBusyKey !== null}
                        className="px-4 py-2 rounded-lg bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {patchBusyKey === "push"
                          ? "Shipping..."
                          : patchBusyKey === "commit"
                          ? "Committing..."
                          : hasPendingChanges
                          ? effectiveShipMode === "push"
                            ? "Commit & Push"
                            : "Create Commit"
                          : "Push Branch"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowShipAdvanced((v) => !v)}
                        className="px-4 py-2 rounded-lg border border-zinc-700 text-xs font-semibold text-slate-200 hover:border-blue-500/40 hover:bg-slate-800"
                      >
                        {showShipAdvanced ? "Hide Options" : "Advanced"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showShipPanel && showShipAdvanced && (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Commit Message</label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] gap-4 items-start">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">GitHub Token For Push</label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder={
                      results.remediation.canPush && effectiveShipMode === "push"
                        ? githubTokenLoaded
                          ? "Auto-loaded on this device if previously saved"
                          : "Loading saved token..."
                        : effectiveShipMode === "commit"
                        ? "Token not needed for commit-only mode"
                        : "Push disabled for ZIP workspace"
                    }
                    className="w-full px-4 py-3 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50 transition-shadow"
                    disabled={!results.remediation.canPush || !showShipPanel || effectiveShipMode !== "push"}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={saveGithubToken}
                        onChange={(e) => setSaveGithubToken(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-zinc-950 text-blue-500 focus:ring-blue-500"
                      />
                      Save token locally on this device
                    </label>
                    {githubToken && (
                      <button
                        type="button"
                        onClick={() => setGithubToken("")}
                        className="px-3 py-1.5 rounded-lg border border-zinc-700 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                      >
                        Clear token
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Patchable</p>
                    <p className="text-lg font-semibold text-white mt-2">{results.remediation.patchable ? "Yes" : "No"}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Saved Token</p>
                    <p className={`text-lg font-semibold mt-2 ${githubToken ? "text-emerald-300" : "text-slate-500"}`}>
                      {githubToken ? "Loaded" : githubTokenLoaded ? "Not saved" : "Checking"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 xl:col-span-1">
                  <p className="text-[10px] uppercase tracking-widest text-blue-300 font-bold">Push Token Needed</p>
                  <p className="text-xs text-slate-300 mt-2 leading-5">
                    Fine-grained token, this repo selected, <span className="font-mono text-white">Contents: Read and write</span>.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-slate-950/40 p-3 xl:col-span-1">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Workflow</p>
                  <p className="text-xs text-slate-300 mt-2 leading-5">
                    Preview, patch, review diff, then commit or push only after approval.
                  </p>
                </div>
                <div className={`rounded-xl border p-3 xl:col-span-1 ${showShipPanel ? hasPendingChanges ? "border-emerald-500/20 bg-emerald-500/8" : "border-blue-500/20 bg-blue-500/8" : "border-amber-500/20 bg-amber-500/8"}`}>
                  <p className={`text-[10px] uppercase tracking-widest font-bold ${showShipPanel ? hasPendingChanges ? "text-emerald-300" : "text-blue-300" : "text-amber-300"}`}>
                    {showShipPanel ? hasPendingChanges ? "Ready To Commit" : "Ready To Push" : "Commit Disabled"}
                  </p>
                  <p className="text-xs text-slate-300 mt-2 leading-5">
                    {showShipPanel
                      ? hasPendingChanges
                        ? `${remediation?.changedFilesCount ?? 0} changed files are waiting in the remediation workspace.`
                        : "Patching is complete. Commit has been created, and the next step is pushing the branch."
                      : hasPendingChanges
                      ? `${remediation?.changedFilesCount ?? 0} changed files are waiting in the remediation workspace.`
                      : "Apply a patch first. Commit and push unlock only when real file changes exist."}
                  </p>
                </div>
              </div>

              {lastCommitSha && (
                <p className="text-xs text-emerald-400 font-mono">Last remediation commit: {lastCommitSha}</p>
              )}
            </div>

            {(patchPreviews.length > 0 || patchDiff) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 max-h-80 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Patch Preview</p>
                  {patchPreviews.length === 0 ? (
                    <p className="text-sm text-slate-500">No preview generated yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {patchPreviews.map((preview, index) => (
                        <div key={`${preview.file}-${preview.line}-${index}`} className="rounded-lg border border-zinc-800 bg-slate-950/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-mono text-blue-300 break-all">{preview.file}</p>
                            <span className={`text-[10px] font-bold uppercase ${preview.status === "ready" ? "text-emerald-400" : "text-rose-400"}`}>
                              {preview.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2">Line {preview.line} • {preview.envName ?? "No env name"}</p>
                          {preview.reason && <p className="text-xs text-rose-400 mt-2">{preview.reason}</p>}
                          {preview.oldLine && <p className="text-xs text-rose-300 font-mono mt-3 break-all">- {preview.oldLine}</p>}
                          {preview.newLine && <p className="text-xs text-emerald-300 font-mono mt-1 break-all">+ {preview.newLine}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col min-h-[200px]">
                  <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current Diff</p>
                      <p className="text-xs text-slate-500 mt-1">GitHub-style unified diff preview for the current remediation workspace.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {diffLines.length > 0 && (
                        <span className="px-2.5 py-1 rounded-md border border-zinc-700 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                          {diffLines.length} lines
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={diffLines.length === 0}
                        onClick={() => setDiffModalOpen(true)}
                        className="px-3 py-1.5 rounded-md border border-blue-600/50 bg-blue-600/15 text-xs font-semibold text-blue-300 hover:bg-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {diffLines.length === 0 ? "No diff to expand" : "View diff in popup"}
                      </button>
                    </div>
                  </div>
                  {patchDiff ? (
                    <div className="max-h-96 overflow-auto font-mono text-[11px] flex-1">
                      <UnifiedDiffLines lines={diffLines} />
                    </div>
                  ) : (
                    <div className="p-4 flex-1 flex flex-col justify-center">
                      <p className="text-sm text-slate-500">No diff loaded yet. Use <span className="text-slate-400 font-medium">Review Diff</span> after preview or patch.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Analytics Dashboard */}
        {results && !isClean(results) && !results.error && (
          <>
            {/* Top Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/60 flex flex-col justify-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Exposures</p>
                <div className="flex items-end gap-3 mt-2">
                  <p className="text-5xl font-black text-rose-500">{results?.summary?.secretsFound ?? 0}</p>
                  <p className="text-sm text-slate-500 mb-1">Secrets</p>
                </div>
                <div className="mt-4 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, ((results?.summary?.secretsFound ?? 0) / 20) * 100)}%` }} />
                </div>
              </div>

              <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/60">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Risk by File</p>
                <div className="h-28">
                  {chartData.bar.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.bar} margin={{ left: -25, bottom: -10 }}>
                        <XAxis dataKey="file" hide />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: '#27272a' }} contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }} />
                        <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                          {chartData.bar.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#f43f5e" : "#2563eb"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-slate-500">Insufficient data</p>}
                </div>
              </div>

              <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/60">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Threat Classification</p>
                <div className="h-28">
                  {chartData.pie.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie dataKey="value" data={chartData.pie} cx="50%" cy="50%" outerRadius={50} innerRadius={35} paddingAngle={5}>
                          {chartData.pie.map((entry, idx) => (
                            <Cell key={idx} fill={["#2563eb", "#3b82f6", "#10b981", "#f59e0b", "#f43f5e"][idx % 5]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-slate-500">Insufficient data</p>}
                </div>
              </div>
            </div>

            {/* Data Table Area */}
            <div className="grid grid-cols-1 gap-6">
              
              {/* File selector */}
              <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/60 flex flex-col">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">Compromised Files</h3>
                <div className="space-y-2 overflow-y-auto max-h-[450px] pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                  {Object.entries(results!.vulnerabilities || {}).map(([file, secrets]) => {
                    const risk = secrets.length;
                    const active = selectedFile === file;
                    return (
                      <button
                        key={file}
                        onClick={() => setSelectedFile(file === selectedFile ? null : file)}
                        className={`w-full text-left p-3 rounded-md border transition-all duration-200 active:scale-[0.99] ${
                          active ? "border-blue-600/50 bg-blue-600/10 ring-1 ring-blue-600/20" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900/80"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="truncate flex-1">
                            <p className="text-xs font-medium text-slate-200 truncate" title={file}>{file.split('/').pop()}</p>
                            <p className="text-[10px] text-slate-500 truncate mt-1">{file}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${risk > 3 ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"}`}>
                            {risk} {risk === 1 ? 'Alert' : 'Alerts'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Details Table */}
              <div className="p-0 rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Secret Telemetry</h3>
                  <span className="text-xs text-slate-500">Showing page {page} of {totalPages}</span>
                </div>
                
                <div className="overflow-x-auto flex-1 p-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-zinc-800/50">
                        <th className="px-4 py-3 font-semibold">File</th>
                        <th className="px-4 py-3 font-semibold">Exposed Secret</th>
                        <th className="px-4 py-3 font-semibold">Classification</th>
                        <th className="px-4 py-3 font-semibold">Confidence</th>
                        <th className="px-4 py-3 font-semibold">Line</th>
                        <th className="px-4 py-3 font-semibold">Source</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {pagedRows.map((r, idx) => {
                        const rowKey = `p${page}-i${idx}`;
                        const expanded = openCodeRowKey === rowKey;
                        const hasSnippet = !!(r.secret.snippet && r.secret.snippet.lines?.length);
                        const confidencePercent = r.secret.aiAnalysis?.confidence != null ? Math.round(r.secret.aiAnalysis.confidence * 100) : null;
                        const riskPercent = r.secret.aiAnalysis?.risk_score != null ? Math.round(r.secret.aiAnalysis.risk_score * 100) : null;
                        const aiServiceLabel =
                          r.secret.aiAnalysis?.service && r.secret.aiAnalysis.service !== "unknown"
                            ? r.secret.aiAnalysis.service
                            : null;
                        return (
                          <Fragment key={rowKey}>
                            <tr className="hover:bg-zinc-800/35 transition-colors duration-150 border-b border-zinc-800/30">
                              <td className="px-4 py-4 max-w-[220px]" title={r.file}>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-100 truncate">{r.file.split('/').pop()}</p>
                                  <p className="text-[11px] text-slate-500 truncate mt-1">{r.file}</p>
                                  {(r.secret.author || r.secret.email) && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[11px] text-slate-400 truncate">
                                        Author: <span className="text-slate-200">{r.secret.author || "Unknown"}</span>
                                      </p>
                                      <p className="text-[11px] text-slate-500 truncate">{r.secret.email || "No email"}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="inline-flex max-w-[220px] items-center rounded-xl border border-rose-500/15 bg-rose-500/8 px-3 py-2">
                                  <span className="font-mono text-xs text-rose-300 truncate">
                                    {revealSecrets[r.findingKey] ? r.secret.secret : mask(r.secret.secret)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col gap-2">
                                  <span className="text-sm font-semibold text-blue-300">{r.secret.type}</span>
                                  {r.secret.aiAnalysis?.is_secret && (
                                    <span className="inline-flex w-fit items-center px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                                      {aiServiceLabel ? `AI ${aiServiceLabel}` : "AI Verified"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 min-w-[160px]">
                                {confidencePercent != null ? (
                                  <div className="space-y-2">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-base font-semibold text-emerald-300">{confidencePercent}%</span>
                                      <span className="text-[11px] text-slate-500">confidence</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                                        style={{ width: `${confidencePercent}%` }}
                                      />
                                    </div>
                                    {riskPercent != null && (
                                      <p className="text-[11px] text-slate-500">Risk {riskPercent}%</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-zinc-800 bg-slate-950/70 text-[11px] text-slate-500">
                                    Not scored
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="space-y-2">
                                  <span className="inline-flex items-center rounded-full border border-zinc-800 bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300">#{r.secret.line}</span>
                                  {(r.secret.assignedTo || r.secret.commitTime) && (
                                    <div className="text-[11px] text-slate-500">
                                      <p>{r.secret.assignedTo ? `Assigned: ${r.secret.assignedTo}` : "Assigned: Unknown"}</p>
                                      <p>{r.secret.commitTime ? formatCommitTime(r.secret.commitTime) : "Commit time unavailable"}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <button
                                  type="button"
                                  disabled={!hasSnippet}
                                  onClick={() => setOpenCodeRowKey(expanded ? null : rowKey)}
                                  className={`px-3 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                                    hasSnippet
                                      ? expanded
                                        ? "border-blue-500 bg-blue-500/15 text-blue-300"
                                        : "border-slate-600 bg-slate-800/80 text-slate-200 hover:border-blue-500/50"
                                      : "border-zinc-800 bg-slate-950/50 text-slate-600 cursor-not-allowed opacity-60"
                                  }`}
                                  title={hasSnippet ? "Toggle VS Code–style code context" : "No snippet returned — restart backend after update and rescan"}
                                >
                                  {hasSnippet ? (expanded ? "Hide Preview" : "Show Preview") : "No preview"}
                                </button>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePatchApply(r)}
                                  disabled={!canUsePatchAgent || patchBusyKey !== null}
                                  className="px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-[11px] font-semibold text-blue-300 disabled:opacity-50"
                                >
                                  {patchBusyKey === r.findingKey ? "Patching..." : "Patch"}
                                </button>
                                <button type="button" onClick={() => setRevealSecrets((p) => ({ ...p, [r.findingKey]: !p[r.findingKey] }))} className="px-3 py-2 rounded-xl border border-zinc-700 hover:bg-slate-800 text-[11px] font-semibold text-slate-300">
                                  {revealSecrets[r.findingKey] ? 'Hide' : 'Reveal'}
                                </button>
                                <button type="button" onClick={() => setSelectedFile(r.file)} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-[11px] font-semibold">
                                  Inspect
                                </button>
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={7} className="p-0 border-t-0">
                                  <div className="px-4 py-4 bg-zinc-950 border-t border-zinc-800/80">
                                    {r.secret.aiAnalysis && (
                                      <div className="mb-4 rounded-lg border border-emerald-500/15 bg-emerald-500/8 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300 font-bold">AI Verdict</p>
                                            <p className="text-sm text-slate-200 mt-2">
                                              {r.secret.aiAnalysis.service || "Secret analyzer"} marked this candidate as{" "}
                                              <span className="font-semibold text-emerald-300">
                                                {r.secret.aiAnalysis.is_secret ? "likely secret" : "needs review"}
                                              </span>
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <span className="px-2.5 py-1 rounded-full border border-zinc-700 bg-slate-950/70 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                                              Risk {Math.round((r.secret.aiAnalysis.risk_score ?? 0) * 100)}%
                                            </span>
                                            <span className="px-2.5 py-1 rounded-full border border-zinc-700 bg-slate-950/70 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                                              Confidence {Math.round((r.secret.aiAnalysis.confidence ?? 0) * 100)}%
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-3 leading-5">
                                          {r.secret.aiAnalysis.reason || "Validated before the scan response was sent to the frontend."}
                                        </p>
                                      </div>
                                    )}
                                    {hasSnippet && r.secret.snippet ? (
                                      <SourceSnippetView
                                        snippet={r.secret.snippet}
                                        secret={r.secret.secret}
                                        reveal={!!revealSecrets[r.findingKey]}
                                        fileTitle={r.file.split("/").pop()}
                                      />
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 disabled:opacity-30 hover:bg-slate-700 text-white transition-all">Previous</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 disabled:opacity-30 hover:bg-slate-700 text-white transition-all">Next Page</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Console Window */}
        <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-950 mt-8 shadow-inner">
          <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span> System Terminal
            </h4>
          </div>
          <div className="font-mono text-[11px] text-emerald-400/80 min-h-[100px] max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
            {consoleLines.length === 0 ? (
              <span className="text-slate-600 italic">Awaiting operational command...</span>
            ) : (
              consoleLines.map((line, i) => <div key={i} className={line.includes("Error") || line.includes("failed") ? "text-rose-400" : ""}>{line}</div>)
            )}
            {loading && <div className="text-blue-400 animate-pulse mt-2">&gt; Analyzing repository structures...</div>}
          </div>
        </div>
      </main>

      {diffModalOpen && diffLines.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diff-modal-title"
          onClick={() => setDiffModalOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl ring-1 ring-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center gap-4 bg-zinc-950/80">
              <div>
                <h2 id="diff-modal-title" className="text-sm font-semibold text-zinc-100">
                  Current remediation diff
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {diffLines.length} lines · Press Esc or click outside to close
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDiffModalOpen(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto font-mono text-xs p-2 bg-zinc-950">
              <UnifiedDiffLines lines={diffLines} />
            </div>
          </div>
        </div>
      )}

      {/* Inspect Modal Overlay */}
      {selectedFile && results && results.vulnerabilities && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-4xl overflow-hidden shadow-xl shadow-black/40 ring-1 ring-zinc-800 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <div>
                <h3 className="text-sm font-bold text-white">File Inspection</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">{selectedFile}</p>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 bg-zinc-900">
              {(results.vulnerabilities[selectedFile] || []).map((s, i) => {
                const findingKey = `${selectedFile}#${i}`;
                return (
                <div key={findingKey} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-wider border border-rose-500/20">{s.type}</span>
                      <p className="text-xs text-slate-400 mt-3 font-mono">Line: <span className="text-blue-400">{s.line}</span> • Branch: {s.branch}</p>
                      {(s.author || s.email || s.commitTime) && (
                        <div className="mt-3 space-y-1 text-xs text-slate-400">
                          <p>Author: <span className="text-slate-200">{s.author || "Unknown"}</span></p>
                          <p>Email: <span className="text-slate-300">{s.email || "Unavailable"}</span></p>
                          <p>Commit Time: <span className="text-slate-300">{formatCommitTime(s.commitTime)}</span></p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setRevealSecrets((p) => ({ ...p, [findingKey]: !p[findingKey] }))} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-[10px] font-bold hover:bg-slate-800 text-white">
                      {revealSecrets[findingKey] ? 'Mask Secret' : 'Reveal Secret'}
                    </button>
                  </div>
                  
                  <div className="bg-black/50 p-3 rounded-lg border border-zinc-800 font-mono text-xs overflow-x-auto text-rose-300">
                    {revealSecrets[findingKey] ? s.secret : mask(s.secret)}
                  </div>

                  {s.aiAnalysis && (
                    <>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/8 p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Confidence</p>
                          <p className="text-lg font-semibold text-emerald-300 mt-2">
                            {Math.round((s.aiAnalysis.confidence ?? 0) * 100)}%
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-slate-950/70 p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Risk Score</p>
                          <p className="text-lg font-semibold text-amber-300 mt-2">
                            {Math.round((s.aiAnalysis.risk_score ?? 0) * 100)}%
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-slate-950/70 p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Analyzer Service</p>
                          <p className="text-sm font-semibold text-blue-300 mt-2">
                            {s.aiAnalysis.service || "Unknown"}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-slate-400 leading-5">
                        {s.aiAnalysis.reason || "Validated by the remote analyzer before this finding was shown in the UI."}
                      </p>
                    </>
                  )}

                  {s.snippet && s.snippet.lines?.length > 0 ? (
                    <div className="mt-4">
                      <SourceSnippetView
                        snippet={s.snippet}
                        secret={s.secret}
                        reveal={!!revealSecrets[findingKey]}
                        fileTitle={selectedFile.split("/").pop()}
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-[10px] text-slate-500">
                      No source preview. Use a ZIP or URL scan with the latest backend, ensure TruffleHog reports a file path and line, and restart <span className="font-mono text-slate-400">node server.js</span>.
                    </p>
                  )}
                  
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center text-[10px] text-slate-500">
                    <p>Commit Context</p>
                    <p className="font-mono bg-slate-900 px-2 py-1 rounded">{s.commit && s.commit !== "N/A" ? s.commit.substring(0, 12) : "Unknown Commit"}</p>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-700 shadow-lg rounded-lg px-4 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-5 ring-1 ring-zinc-800">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <p className="text-xs font-semibold text-white">{toastMessage}</p>
          <button onClick={() => setToastMessage(null)} className="text-slate-500 hover:text-white ml-2">×</button>
        </div>
      )}
    </div>
  );
}
