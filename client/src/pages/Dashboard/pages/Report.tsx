"use client";
import React, { useState, useEffect, useRef } from "react";
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
import { FiDatabase, FiCheckCircle, FiAlertTriangle, FiKey, FiExternalLink } from "react-icons/fi";
import { userAuth } from "../../../context/Auth";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const CARD_STYLE = "p-8 rounded-xl bg-[#111827] border border-[#1E293B] shadow-2xl";
const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
  high: "border-red-500/30 bg-red-500/10 text-red-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const normalizeSeverity = (severity?: string | null) =>
  String(severity || "low").trim().toLowerCase() || "low";

const formatConfidence = (confidence?: number | null) => {
  if (confidence === undefined || confidence === null) return "N/A";
  if (confidence <= 1) return `${Math.round(confidence * 100)}%`;
  return String(confidence);
};

const formatIgnoreScope = (scope?: string | null) => {
  if (!scope) return "Ignored";
  if (scope === "shared") return "Ignored in project";
  if (scope === "local") return "Ignored locally";
  return `Ignored (${scope})`;
};

const formatGitNote = (note?: string | null) => {
  if (note === "uncommitted") return "Introduced in this commit";
  return note || null;
};

const SeverityBadge = ({ severity }: { severity?: string | null }) => {
  const level = normalizeSeverity(severity);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_STYLES[level] || SEVERITY_STYLES.low}`}>
      {level}
    </span>
  );
};

const Report = () => {
  const { user, repo, company } = userAuth() || {};
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [repoSecrets, setRepoSecrets] = useState<any[]>([]);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Close modal on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedRepo(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close modal on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!selectedRepo) return;
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setSelectedRepo(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [selectedRepo]);

  if (company && !user) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1120] text-center p-6 text-[#0ae8f0] font-semibold text-xl">
        <div className="bg-[#111827] border border-[#1E293B] p-10 rounded-xl shadow-2xl">
          <span className="text-4xl mb-4 block">👔</span>
          Organization Account Detected
          <p className="text-gray-400 mt-2 text-sm font-normal">
            Security reports are only available for developer accounts.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1120] text-center p-6">
        <div className="bg-[#111827] border border-red-900/50 p-10 rounded-xl text-lg font-medium text-red-500 shadow-2xl">
          ⚠ No User Logged In!
        </div>
      </div>
    );
  }

  const handleRepoClick = (r: any) => {
    setSelectedRepo(r);
    if (r.vulnerabilities) {
      const secretsFlat = Object.values(r.vulnerabilities).flat();
      setRepoSecrets(secretsFlat);
    } else if (Array.isArray(r.LastScanFindings) && r.LastScanFindings.length) {
      const secretsFlat = r.LastScanFindings.flatMap((finding: any) => {
        const locations = Array.isArray(finding.locations) && finding.locations.length
          ? finding.locations
          : [{ filePath: finding.filePath }];
        return locations.map((location: any) => ({
          id: finding.id || null,
          fingerprint: finding.fingerprint || null,
          type: finding.secretType || finding.type || "Secret",
          file: location.filePath || finding.filePath || "unknown",
          preview: location.preview || finding.preview || "Hidden",
          severity: finding.severity || "low",
          confidence:
            typeof finding.confidence === "number" ? finding.confidence : null,
          ignored:
            location.ignored !== undefined ? !!location.ignored : !!finding.ignored,
          ignoreScope: location.ignoreScope || finding.ignoreScope || null,
          occurrenceCount:
            typeof finding.occurrenceCount === "number" ? finding.occurrenceCount : 1,
          lineStart:
            typeof location.lineStart === "number"
              ? location.lineStart
              : typeof finding.lineStart === "number"
                ? finding.lineStart
                : null,
          git: location.git || finding.git || null,
        }));
      });
      setRepoSecrets(secretsFlat);
    } else {
      setRepoSecrets([]);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return "N/A";
    const date = new Date(d);
    return isNaN(date.getTime()) ? String(d) : date.toLocaleString();
  };

  const uniqueSecretCount = selectedRepo?.TotalSecrets ?? repoSecrets.length;
  const totalOccurrences = repoSecrets.reduce(
    (total, secret) => total + (typeof secret.occurrenceCount === "number" ? secret.occurrenceCount : 1),
    0,
  );

  // --- Chart Configurations for Dark Mode ---
  const commonOptions = {
    color: '#9ca3af',
    plugins: { legend: { labels: { color: '#e5e7eb' } } }
  };

  const barOptions = {
    ...commonOptions,
    scales: {
      x: { ticks: { color: '#9ca3af' }, grid: { color: '#1E293B' } },
      y: { ticks: { color: '#9ca3af' }, grid: { color: '#1E293B' } }
    }
  };

  // --- Chart Data ---
  const pieData = {
    labels: ["Verified", "Unverified"],
    datasets: [
      {
        data: [user.VerifiedRepositories ?? 0, user.UnverifiedRepositories ?? 0],
        backgroundColor: ["#10b981", "#ef4444"],
        borderColor: "#111827",
        borderWidth: 2,
      },
    ],
  };

  const barData = {
    labels: ["Repositories"],
    datasets: [
      { label: "Verified", data: [user.VerifiedRepositories ?? 0], backgroundColor: "#10b981", borderRadius: 4 },
      { label: "Unverified", data: [user.UnverifiedRepositories ?? 0], backgroundColor: "#ef4444", borderRadius: 4 },
    ],
  };

  const secretsPieData = {
    labels: Array.from(new Set(repoSecrets.map((s) => s.type))),
    datasets: [
      {
        data: Array.from(new Set(repoSecrets.map((s) => s.type))).map(
          (type) => repoSecrets.filter((s) => s.type === type).length
        ),
        backgroundColor: ["#0ae8f0", "#3b82f6", "#ef4444", "#eab308", "#10b981"],
        borderColor: "#111827",
        borderWidth: 2,
      },
    ],
  };

  const secretsBarData = {
    labels: Array.from(new Set(repoSecrets.map((s) => s.file))),
    datasets: [
      {
        label: "Secrets Count",
        data: Array.from(new Set(repoSecrets.map((s) => s.file))).map(
          (file) => repoSecrets.filter((s) => s.file === file).length
        ),
        backgroundColor: "#0ae8f0",
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="min-h-screen text-gray-200 p-8 bg-[#0B1120]">
      <style>{`
        @keyframes fadeInScale { from { opacity: 0; transform: translateY(-6px) scale(.98);} to { opacity: 1; transform: translateY(0) scale(1);} }
        .animate-fadeInScale { animation: fadeInScale 160ms ease-out; }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-wide">
              Security Report <span className="text-[#0ae8f0]">🔍</span>
            </h2>
            <p className="text-gray-400 text-sm mt-1 font-mono">{user.email?.split("@")[0]}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
          {[
            { title: "Total Repositories", val: user.TotalRepositories, color: "text-[#0ae8f0]", icon: <FiDatabase size={24} /> },
            { title: "Verified", val: user.VerifiedRepositories, color: "text-green-500", icon: <FiCheckCircle size={24} /> },
            { title: "Unverified", val: user.UnverifiedRepositories, color: "text-red-500", icon: <FiAlertTriangle size={24} /> },
          ].map((item, i) => (
            <div key={i} className={`${CARD_STYLE} flex items-center gap-5`}>
              <div className={`p-4 rounded-lg bg-[#0B1120] border border-[#1E293B] ${item.color}`}>
                {item.icon}
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{item.title}</p>
                <p className={`text-4xl font-bold mt-1 ${item.color}`}>{item.val ?? 0}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid sm:grid-cols-2 gap-6">
          <div className={CARD_STYLE}>
            <h3 className="font-bold text-sm text-white mb-6 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-4 bg-blue-500 rounded-sm block"></span>
              Verification Status
            </h3>
            <div className="h-64 flex justify-center">
              <Pie data={pieData} options={commonOptions} />
            </div>
          </div>
          <div className={CARD_STYLE}>
            <h3 className="font-bold text-sm text-white mb-6 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-4 bg-green-500 rounded-sm block"></span>
              Verified vs Unverified
            </h3>
            <div className="h-64">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
        </div>

        {/* Repo List */}
        <div className={CARD_STYLE}>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1E293B]">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <span className="w-2 h-6 bg-yellow-500 rounded-sm block"></span>
              Tracked Git Repositories
            </h3>
            <div className="text-xs font-bold text-gray-500 bg-[#0B1120] px-3 py-1 rounded-md border border-[#1E293B]">
              TOTAL: {repo?.length ?? 0}
            </div>
          </div>

          {repo?.length ? (
            <div className="space-y-3">
              {repo.map((r, index) => (
                <div key={r._id || index} className="p-5 bg-[#0B1120] rounded-lg border border-[#1E293B] hover:border-[#0ae8f0]/50 transition-colors group">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <a href={r.gitUrl} target="_blank" rel="noreferrer" className="text-[#0ae8f0] hover:text-white font-mono text-sm break-all transition-colors inline-flex items-center gap-2">
                        {r.gitUrl} <FiExternalLink size={12} />
                      </a>
                      <div className="text-xs text-gray-500 mt-2 font-mono uppercase">
                        Branch: <span className="text-gray-300">{r.Branch ?? "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <span className={`px-3 py-1 rounded border text-xs font-bold tracking-wider uppercase ${r.Status === "Vulnerable" ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-green-400 bg-green-500/10 border-green-500/20"}`}>
                        {r.Status ?? "Unknown"}
                      </span>
                      <button 
                        onClick={() => handleRepoClick(r)} 
                        className="px-4 py-2 rounded-lg bg-[#0ae8f0]/10 text-[#0ae8f0] border border-[#0ae8f0]/30 hover:bg-[#0ae8f0] hover:text-[#0B1120] text-sm font-semibold transition-all duration-300 flex items-center gap-2"
                      >
                        <FiKey size={14} /> Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 py-8 text-center text-sm italic">No repositories found in the database.</p>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedRepo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" />
          <div
            ref={modalRef}
            className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#111827] border border-[#1E293B] p-8 rounded-xl shadow-2xl animate-fadeInScale scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
          >
            {/* Header */}
            <div className="flex justify-between items-start gap-4 mb-6 pb-6 border-b border-[#1E293B]">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                  <span className="w-2 h-6 bg-[#0ae8f0] rounded-sm block"></span>
                  Repository Analysis
                </h3>
                <p className="text-sm font-mono text-[#0ae8f0] break-all">{selectedRepo.gitUrl}</p>
              </div>
              <button 
                onClick={() => setSelectedRepo(null)} 
                className="text-gray-500 hover:text-white p-2 bg-[#0B1120] rounded-lg border border-[#1E293B] transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Repo Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-[#1E293B]/50 pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Status</span> 
                  <span className={`font-bold ${selectedRepo.Status === "Vulnerable" ? "text-red-400" : "text-green-400"}`}>{selectedRepo.Status ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b border-[#1E293B]/50 pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Branch</span> 
                  <span className="text-white font-mono">{selectedRepo.Branch ?? "N/A"}</span>
                </div>
                <div className="flex justify-between border-b border-[#1E293B]/50 pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Verified</span> 
                  <span className="text-white">{selectedRepo.VerifiedRepositories ?? 0}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Unverified</span> 
                  <span className="text-white">{selectedRepo.UnverifiedRepositories ?? 0}</span>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-[#1E293B]/50 pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Last Scanned</span> 
                  <span className="text-white text-right">{formatDate(selectedRepo.LastScanned)}</span>
                </div>
                <div className="flex justify-between border-b border-[#1E293B]/50 pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Added On</span> 
                  <span className="text-white text-right">{formatDate(selectedRepo.createdAt)}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-gray-500 uppercase text-xs tracking-wider">Updated</span> 
                  <span className="text-white text-right">{formatDate(selectedRepo.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Total Secrets Alert */}
            <div className={`mb-8 p-5 rounded-lg border flex justify-between items-center ${repoSecrets.length > 0 ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
              <div className="flex items-center gap-3">
                {repoSecrets.length > 0 ? <FiAlertTriangle className="text-red-400" size={24}/> : <FiCheckCircle className="text-green-400" size={24} />}
                <span className={`text-lg font-bold ${repoSecrets.length > 0 ? "text-red-400" : "text-green-400"}`}>
                  Exposed Secrets / Tokens Detected
                </span>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-black ${repoSecrets.length > 0 ? "text-red-500" : "text-green-500"}`}>
                  {uniqueSecretCount}
                </p>
                <p className="text-[11px] text-gray-400">
                  {totalOccurrences} total occurrence{totalOccurrences === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {/* Secrets Badges & Charts */}
            {repoSecrets.length > 0 && (
              <>
                <div className="mb-6">
                  <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Detected Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {repoSecrets.map((s, idx) => (
                      <span key={idx} className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-md bg-[#0B1120] border border-[#1E293B] text-gray-300">
                        <FiKey className="text-[#0ae8f0]" size={12} /> {s.type}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-6 bg-[#0B1120] p-6 rounded-xl border border-[#1E293B]">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Distribution by Type</h5>
                    <Pie data={secretsPieData} options={commonOptions} />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Distribution by File</h5>
                    <Bar data={secretsBarData} options={barOptions} />
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sanitized Finding History</h4>
                  <div className="space-y-3">
                    {repoSecrets.slice(0, 12).map((secret, idx) => (
                      <div key={`${secret.id || secret.fingerprint || secret.file}-${idx}`} className="rounded-lg border border-[#1E293B] bg-[#0B1120] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md border border-[#1E293B] bg-[#111827] px-2 py-1 text-xs font-mono text-gray-200">
                                <FiKey className="text-[#0ae8f0]" size={12} /> {secret.type}
                              </span>
                              <SeverityBadge severity={secret.severity} />
                              {secret.ignored ? (
                                <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                  {formatIgnoreScope(secret.ignoreScope)}
                                </span>
                              ) : null}
                            </div>
                            <p className="font-mono text-sm text-[#0ae8f0] break-all">{secret.file}</p>
                            <div className="rounded-md border border-[#1E293B] bg-[#111827] px-3 py-2 font-mono text-xs text-rose-300">
                              {secret.preview || "Hidden"}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                              <span>Line: {secret.lineStart ?? "N/A"}</span>
                              <span>Confidence: {formatConfidence(secret.confidence)}</span>
                              <span>Occurrences: {secret.occurrenceCount ?? 1}</span>
                              <span>Commit: {secret.git?.note === "uncommitted" ? "Working tree" : secret.git?.commit?.slice(0, 12) || "Unknown"}</span>
                            </div>
                            {(secret.git?.firstSeenDate || secret.git?.note) && (
                              <p className="text-[11px] text-gray-500">
                                {formatGitNote(secret.git?.note) || ""}
                                {secret.git?.firstSeenDate
                                  ? `${secret.git?.note ? " • " : ""}First seen ${formatDate(secret.git.firstSeenDate)}`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 sm:text-right">
                            <p>Branch</p>
                            <p className="mt-1 font-mono text-gray-300">{secret.git?.branch || selectedRepo.Branch || "N/A"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-[#1E293B]">
              <button 
                className="px-5 py-2.5 rounded-lg bg-[#1E293B] hover:bg-[#2A374A] text-white text-sm font-semibold transition-colors" 
                onClick={() => setSelectedRepo(null)}
              >
                Close Panel
              </button>
              <button 
                className="px-5 py-2.5 rounded-lg bg-[#0ae8f0] text-[#0B1120] hover:bg-white text-sm font-bold transition-colors flex items-center gap-2" 
                onClick={() => window.open(selectedRepo.gitUrl, "_blank")}
              >
                Open in GitHub <FiExternalLink />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Report;
