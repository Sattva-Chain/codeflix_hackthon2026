"use client";
import React, { useState, FormEvent } from "react";
import axios from "axios";
import { userAuth } from "../../context/Auth";

const maskSecret = (s: string) => {
  if (!s) return "";
  if (s.length <= 10) return s.replace(/.(?=.{2})/g, "*");
  return s.slice(0, 4) + "..." + s.slice(-4);
};

interface Secret {
  secret: string;
  type: string;
  isVerified: boolean;
  commit: string;
}

interface ScanResults {
  summary?: {
    secretsFound: number;
    filesWithSecrets: number;
  };
  vulnerabilities?: Record<string, Secret[]>;
  error?: boolean;
  message?: string;
}

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

const Analysis: React.FC = () => {
  const { user } = userAuth()!;
  const [gitUrl, setGitUrl] = useState<string>("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [revealByRow, setRevealByRow] = useState<Record<string, boolean>>({});

  const axiosInstance = axios.create({
    baseURL: "http://127.0.0.1:3000",
    timeout: 600000,
    headers: { "Content-Type": "application/json" },
  });

  const handleScan = async (scanType: "url" | "zip", payload: any) => {
    setLoading(true);
    setResults(null);
    setRevealByRow({});
    try {
      let response;
      if (scanType === "url") {
        response = await axiosInstance.post("/scan-url", payload);
      } else {
        const res = await fetch("http://127.0.0.1:3000/scan-zip", {
          method: "POST",
          body: payload,
        });
        response = { data: await res.json() };
      }
      setResults(response.data);
    } catch (error: any) {
      setResults({
        error: true,
        message: error.response?.data?.message || error.message || "An unknown error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) return alert("Please enter a Git URL!");
    handleScan("url", { url: gitUrl });
  };

  const handleZipSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!zipFile) return alert("Please select a ZIP file!");
    const formData = new FormData();
    formData.append("zipfile", zipFile);
    handleScan("zip", formData);
  };

  const getStatusCardStyle = () => {
    if (results?.error) return "bg-red-600 text-white";
    if (results?.summary?.secretsFound === 0) return "bg-green-500 text-white";
    return "bg-yellow-500 text-white";
  };

  return (
    <div className="bg-slate-50 min-h-screen antialiased text-slate-800">
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Secrets Scanner</h1>
          <p className="mt-1 text-sm sm:text-base text-slate-600">
            Analyze Git repositories and ZIP archives for exposed credentials.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3">Scan from Repository URL</h2>
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <input
                type="url"
                placeholder="https://github.com/user/repo.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center bg-gradient-to-r from-slate-700 to-slate-900 text-white font-bold py-2 px-4 rounded-md text-sm shadow hover:from-slate-800 hover:to-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Scanning..." : <><LinkIcon /> Scan URL</>}
              </button>
            </form>
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3">Scan from ZIP Archive</h2>
            <form onSubmit={handleZipSubmit} className="space-y-3">
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files ? e.target.files[0] : null)}
                required
                className="w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center bg-gradient-to-r from-slate-700 to-slate-900 text-white font-bold py-2 px-4 rounded-md text-sm shadow hover:from-slate-800 hover:to-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Scanning..." : <><UploadIcon /> Scan ZIP</>}
              </button>
            </form>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center items-center space-x-2 p-6">
            <div className="border-4 border-slate-200 w-8 h-8 rounded-full border-t-slate-700 animate-spin"></div>
            <span className="text-sm text-slate-600 font-medium">Analyzing Files...</span>
          </div>
        )}

        {results && !loading && (
          <div className="bg-white p-4 sm:p-6 rounded-lg border border-slate-200 shadow-sm space-y-6 animate-fade-in">
            <h2 className="text-2xl font-semibold text-slate-900">Scan Results</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { title: "Total Secrets Found", value: results.summary?.secretsFound ?? 0, color: "bg-slate-700 text-white" },
                { title: "Files With Secrets", value: results.summary?.filesWithSecrets ?? 0, color: "bg-slate-700 text-white" },
                { title: "Status", value: results.error ? "Error ❌" : results.summary?.secretsFound === 0 ? "Clean ✅" : "Vulnerable ⚠️", color: getStatusCardStyle() },
              ].map((card, idx) => (
                <div key={idx} className={`${card.color} p-3 rounded-lg shadow`}>
                  <p className="text-xs font-medium opacity-90">{card.title}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
              ))}
            </div>

            {results.error && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded-md text-sm">
                <p className="font-bold">An Error Occurred</p>
                <p>{results.message}</p>
              </div>
            )}

            {results.vulnerabilities && Object.keys(results.vulnerabilities).length > 0 ? (
              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left text-slate-500">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                    <tr>
                      <th className="px-4 py-2">File Path</th>
                      <th className="px-4 py-2">Secret</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2 text-center">Verified</th>
                      <th className="px-4 py-2">Commit</th>
                      <th className="px-4 py-2 text-right">Reveal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.entries(results.vulnerabilities).flatMap(([file, secrets]) =>
                      secrets.map((s, idx) => {
                        const rowKey = `${file}#${idx}`;
                        const show = !!revealByRow[rowKey];
                        return (
                        <tr key={rowKey} className="bg-white hover:bg-slate-50 transition">
                          <td className="px-4 py-2 font-medium text-slate-900 break-all">{file}</td>
                          <td className="px-4 py-2 font-mono text-red-600 break-all">{show ? s.secret : maskSecret(s.secret)}</td>
                          <td className="px-4 py-2">{s.type}</td>
                          <td className="px-4 py-2 text-center">{s.isVerified ? "✅" : "❌"}</td>
                          <td className="px-4 py-2 font-mono text-xs">{s.commit.substring(0, 10)}...</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setRevealByRow((p) => ({ ...p, [rowKey]: !p[rowKey] }))}
                              className="text-xs font-semibold text-slate-700 underline decoration-slate-400 hover:text-slate-900"
                            >
                              {show ? "Hide" : "Reveal"}
                            </button>
                          </td>
                        </tr>
                      );})
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              !results.error && results.summary?.secretsFound === 0 && (
                <div className="text-center py-6 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <p className="font-semibold text-green-700">No secrets found. Your code looks clean! 🎉</p>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Analysis;
