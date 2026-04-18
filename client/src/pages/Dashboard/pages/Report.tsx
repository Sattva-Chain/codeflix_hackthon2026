"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  FolderGit2,
  ShieldCheck,
  X,
} from "lucide-react";
import { userAuth } from "../../../context/Auth";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const CARD = "rounded-lg border border-zinc-800 bg-zinc-900/70 p-5";
const PANEL = "rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden";
const API_BASE_URL = "http://localhost:3000";

type RepoSecret = {
  _id?: string;
  type?: string;
  secretType?: string;
  file?: string;
  line?: number | string;
  author?: string | null;
  email?: string | null;
  authorEmail?: string | null;
  commitTime?: string | null;
  status?: string | null;
  severity?: string | null;
};

type RepoRecord = {
  _id?: string;
  gitUrl: string;
  Branch?: string;
  Status?: string;
  LastScanned?: string;
  createdAt?: string;
  updatedAt?: string;
  TotalSecrets?: number;
  VerifiedRepositories?: number;
  UnverifiedRepositories?: number;
  vulnerabilities?: Record<string, RepoSecret[]>;
};

export default function Report() {
  const { user, repo, company, role, organization, token } = userAuth() || {};
  const [selectedRepo, setSelectedRepo] = useState<RepoRecord | null>(null);
  const [repoSecrets, setRepoSecrets] = useState<RepoSecret[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRepo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!selectedRepo) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setSelectedRepo(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [selectedRepo]);

  const developerRepos = (repo || []) as RepoRecord[];
  const totalRepos = user?.TotalRepositories ?? developerRepos.length ?? 0;
  const verifiedRepos = user?.VerifiedRepositories ?? 0;
  const unverifiedRepos = user?.UnverifiedRepositories ?? 0;

  const openRepoDetails = async (record: RepoRecord) => {
    setSelectedRepo(record);
    setRepoSecrets([]);
    setDetailsLoading(true);

    try {
      if (token) {
        const { data } = await axios.get(`${API_BASE_URL}/api/auth/vulnerabilities`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            repo: record.gitUrl,
            branch: record.Branch || undefined,
          },
        });

        if (data?.success) {
          setRepoSecrets(
            (data.vulnerabilities || []).map((entry: any) => ({
              _id: entry._id,
              type: entry.secretType || "Secret",
              secretType: entry.secretType || "Secret",
              file: entry.file || undefined,
              line: entry.line ?? undefined,
              author: entry.author || null,
              email: entry.authorEmail || null,
              authorEmail: entry.authorEmail || null,
              commitTime: entry.commitTime || null,
              status: entry.status || "OPEN",
              severity: entry.severity || "MEDIUM",
            }))
          );
          return;
        }
      }

      if (record.vulnerabilities) {
        setRepoSecrets(
          Object.entries(record.vulnerabilities).flatMap(([file, findings]) =>
            findings.map((finding) => ({ ...finding, file }))
          )
        );
      }
    } catch {
      if (record.vulnerabilities) {
        setRepoSecrets(
          Object.entries(record.vulnerabilities).flatMap(([file, findings]) =>
            findings.map((finding) => ({ ...finding, file }))
          )
        );
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const formatDate = (value: unknown) => {
    if (!value) return "N/A";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  const commonOptions = useMemo(
    () => ({
      color: "#94a3b8",
      plugins: {
        legend: { labels: { color: "#e5e7eb" } },
      },
    }),
    []
  );

  const barOptions = useMemo(
    () => ({
      ...commonOptions,
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#27272a" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#27272a" } },
      },
    }),
    [commonOptions]
  );

  const verificationPieData = useMemo(
    () => ({
      labels: ["Verified", "Unverified"],
      datasets: [
        {
          data: [verifiedRepos, unverifiedRepos],
          backgroundColor: ["#2563eb", "#f97316"],
          borderColor: "#18181b",
          borderWidth: 2,
        },
      ],
    }),
    [verifiedRepos, unverifiedRepos]
  );

  const verificationBarData = useMemo(
    () => ({
      labels: ["Repositories"],
      datasets: [
        {
          label: "Verified",
          data: [verifiedRepos],
          backgroundColor: "#2563eb",
          borderRadius: 6,
        },
        {
          label: "Unverified",
          data: [unverifiedRepos],
          backgroundColor: "#f97316",
          borderRadius: 6,
        },
      ],
    }),
    [verifiedRepos, unverifiedRepos]
  );

  const secretTypes = Array.from(new Set(repoSecrets.map((secret) => secret.type).filter(Boolean)));
  const secretFiles = Array.from(new Set(repoSecrets.map((secret) => secret.file).filter(Boolean)));

  const secretsPieData = useMemo(
    () => ({
      labels: secretTypes,
      datasets: [
        {
          data: secretTypes.map((type) => repoSecrets.filter((secret) => secret.type === type).length),
          backgroundColor: ["#2563eb", "#0ea5e9", "#f97316", "#ef4444", "#10b981"],
          borderColor: "#18181b",
          borderWidth: 2,
        },
      ],
    }),
    [repoSecrets, secretTypes]
  );

  const secretsBarData = useMemo(
    () => ({
      labels: secretFiles,
      datasets: [
        {
          label: "Secrets",
          data: secretFiles.map((file) => repoSecrets.filter((secret) => secret.file === file).length),
          backgroundColor: "#2563eb",
          borderRadius: 6,
        },
      ],
    }),
    [repoSecrets, secretFiles]
  );

  const statCards = [
    {
      label: "Tracked repositories",
      value: totalRepos,
      icon: FolderGit2,
      tone: "text-blue-300",
    },
    {
      label: "Verified",
      value: verifiedRepos,
      icon: ShieldCheck,
      tone: "text-emerald-300",
    },
    {
      label: "Needs attention",
      value: unverifiedRepos,
      icon: AlertTriangle,
      tone: "text-orange-300",
    },
  ];

  const selectedRepoTotalSecrets = selectedRepo?.TotalSecrets ?? repoSecrets.length;
  const selectedRepoAffectedFiles = repoSecrets.length
    ? new Set(repoSecrets.map((secret) => secret.file).filter(Boolean)).size
    : selectedRepoTotalSecrets > 0
      ? 1
      : 0;

  if (role === "ORG_OWNER" && user) {
    return (
      <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Security Reports</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Owner repository drill-downs now live inside team management so you can inspect each employee separately.
            </p>
          </div>
        </header>

        <div className={`${CARD} min-h-[300px] flex flex-col items-center justify-center text-center`}>
          <BarChart3 className="w-10 h-10 text-blue-400 mb-4" />
          <h2 className="text-lg font-semibold text-zinc-100">Use Team Management for employee repos</h2>
          <p className="text-sm text-zinc-500 mt-3 max-w-lg leading-6">
            Open the team page and use the employee `View repos` action to inspect what each member has scanned and how many exposed keys are open.
          </p>
        </div>
      </div>
    );
  }

  if (company && !user) {
    return (
      <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Security Reports</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Developer reports are available on individual workspaces. Organization-wide risk lives in vulnerability management.
            </p>
          </div>
        </header>

        <div className={`${CARD} min-h-[300px] flex flex-col items-center justify-center text-center`}>
          <BarChart3 className="w-10 h-10 text-blue-400 mb-4" />
          <h2 className="text-lg font-semibold text-zinc-100">Organization session detected</h2>
          <p className="text-sm text-zinc-500 mt-3 max-w-lg leading-6">
            This page stays focused on personal repository reports. For organization owners, the richer cross-team view is now available under
            the vulnerability dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`${CARD} min-h-[320px] flex flex-col items-center justify-center text-center`}>
        <AlertTriangle className="w-10 h-10 text-orange-300 mb-4" />
        <h2 className="text-lg font-semibold text-zinc-100">No active developer session</h2>
        <p className="text-sm text-zinc-500 mt-3">Sign in as a developer to view repository-level reports.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Security Reports</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Repository verification metrics and drill-down details for your saved scan history.
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          {role === "EMPLOYEE" ? `${user.email} · employee workspace` : user.email}
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={CARD}>
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{card.label}</p>
                <Icon className={`w-4 h-4 ${card.tone}`} />
              </div>
              <div className={`text-3xl font-semibold tabular-nums ${card.tone}`}>{card.value ?? 0}</div>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={CARD}>
          <h2 className="text-sm font-medium text-zinc-200 mb-5">Verification mix</h2>
          <div className="h-72 flex justify-center items-center">
            <Pie data={verificationPieData} options={commonOptions} />
          </div>
        </div>
        <div className={CARD}>
          <h2 className="text-sm font-medium text-zinc-200 mb-5">Verification volume</h2>
          <div className="h-72">
            <Bar data={verificationBarData} options={barOptions} />
          </div>
        </div>
      </section>

      <section className={PANEL}>
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950/40">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Tracked repositories</h2>
            <p className="text-xs text-zinc-500 mt-1">Open a repository to inspect the stored secrets summary and metadata.</p>
          </div>
          <span className="px-2.5 py-1 rounded-full border border-zinc-700 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
            {developerRepos.length} repos
          </span>
        </div>

        {developerRepos.length ? (
          <div className="divide-y divide-zinc-800">
            {developerRepos.map((record, index) => {
              const risk = record.Status === "Vulnerable";
              return (
                <div key={record._id || index} className="px-5 py-5 hover:bg-zinc-800/20 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <a
                        href={record.gitUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 text-sm font-medium break-all"
                      >
                        {record.gitUrl}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-zinc-500">
                        <span>Branch: <span className="text-zinc-300">{record.Branch || "N/A"}</span></span>
                        <span>Last scanned: <span className="text-zinc-300">{formatDate(record.LastScanned)}</span></span>
                        <span>Open keys: <span className="text-orange-300 font-medium">{record.TotalSecrets ?? 0}</span></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          risk
                            ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
                            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {record.Status || "Unknown"}
                      </span>
                      <button
                        type="button"
                        onClick={() => openRepoDetails(record)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                      >
                        <FileWarning className="w-4 h-4" />
                        View details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">No repositories have been saved for this developer yet.</div>
        )}
      </section>

      {selectedRepo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            ref={modalRef}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
          >
            <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-4 bg-zinc-950/40">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Repository Analysis</h2>
                <p className="text-sm text-blue-300 mt-2 break-all">{selectedRepo.gitUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRepo(null)}
                className="p-2 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={CARD}>
                  <h3 className="text-sm font-medium text-zinc-200 mb-4">Repository metadata</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">Status</span>
                      <span className={selectedRepo.Status === "Vulnerable" ? "text-orange-300" : "text-emerald-300"}>
                        {selectedRepo.Status || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">Branch</span>
                      <span className="text-zinc-200">{selectedRepo.Branch || "N/A"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">Last scanned</span>
                      <span className="text-zinc-200">{formatDate(selectedRepo.LastScanned)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">Created</span>
                      <span className="text-zinc-200">{formatDate(selectedRepo.createdAt)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">Updated</span>
                      <span className="text-zinc-200">{formatDate(selectedRepo.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className={CARD}>
                    <h3 className="text-sm font-medium text-zinc-200 mb-4">Secret summary</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-orange-200/80 font-bold">Open exposed keys</p>
                      <p className="text-3xl font-semibold text-orange-300 mt-3">{selectedRepoTotalSecrets}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Affected files</p>
                      <p className="text-3xl font-semibold text-zinc-100 mt-3">{selectedRepoAffectedFiles}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Detail records</p>
                      <p className="text-3xl font-semibold text-blue-300 mt-3">{repoSecrets.length}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Exposure status</p>
                      <p className="text-sm text-zinc-400 mt-2 leading-6">
                        {detailsLoading
                          ? "Loading stored repository findings for this developer..."
                          : repoSecrets.length > 0
                          ? `${selectedRepoTotalSecrets} exposed keys are currently tracked for this repository.`
                          : selectedRepoTotalSecrets > 0
                            ? `${selectedRepoTotalSecrets} exposed keys were detected in the last scan, but the detailed per-file breakdown is not available in this saved report yet.`
                            : "No exposed keys are currently recorded for this repository."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {!detailsLoading && repoSecrets.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className={CARD}>
                    <h3 className="text-sm font-medium text-zinc-200 mb-4">By secret type</h3>
                    <div className="h-72 flex justify-center items-center">
                      <Pie data={secretsPieData} options={commonOptions} />
                    </div>
                  </div>
                  <div className={CARD}>
                    <h3 className="text-sm font-medium text-zinc-200 mb-4">By file</h3>
                    <div className="h-72">
                      <Bar data={secretsBarData} options={barOptions} />
                    </div>
                  </div>
                </div>
              )}

              {!detailsLoading && repoSecrets.length > 0 && (
                <div className={PANEL}>
                  <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40">
                    <h3 className="text-sm font-semibold text-zinc-100">Stored findings</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-950/30">
                        <tr>
                          {["Type", "File", "Line", "Author", "Email", "Severity", "Status", "Commit Time"].map((cell) => (
                            <th key={cell} className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {repoSecrets.map((secret, index) => (
                          <tr key={`${secret.file}-${secret.line}-${index}`} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-4 py-4 text-sm text-blue-300">{secret.secretType || secret.type || "Secret"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{secret.file || "N/A"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-400">{secret.line ?? "N/A"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{secret.author || "Unknown"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-400 font-mono">
                              {secret.authorEmail || secret.email || "N/A"}
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{secret.severity || "MEDIUM"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{secret.status || "OPEN"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-400">{formatDate(secret.commitTime)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detailsLoading && (
                <div className={`${CARD} text-sm text-zinc-400`}>
                  Loading repository findings...
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRepo(null)}
                  className="px-4 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.open(selectedRepo.gitUrl, "_blank")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Open Repository
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
