import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { userAuth } from "../../../context/Auth";

const API_BASE_URL = "http://localhost:3000";

type VulnerabilityRecord = {
  _id: string;
  repoName?: string | null;
  repoUrl?: string | null;
  branch?: string | null;
  file?: string | null;
  line?: number | null;
  secretType?: string | null;
  severity?: string | null;
  author?: string | null;
  authorEmail?: string | null;
  commitTime?: string | null;
  status?: string | null;
  fixedByEmail?: string | null;
  fixedAt?: string | null;
};

export default function OrganizationVulnerabilities() {
  const { token, organization, user, role } = userAuth()!;
  const [records, setRecords] = useState<VulnerabilityRecord[]>([]);
  const [repos, setRepos] = useState<{ _id: string; repoName?: string; total: number; open: number }[]>([]);
  const [branches, setBranches] = useState<{ _id: string; total: number; open: number }[]>([]);
  const [developers, setDevelopers] = useState<{ _id: string; author?: string; total: number; open: number }[]>([]);
  const [filters, setFilters] = useState({
    repo: "",
    branch: "",
    developerEmail: "",
    status: "",
    severity: "",
  });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      try {
        if (organization?._id) {
          const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
          const [recordsRes, reposRes, branchesRes, devsRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/vulnerabilities`, { headers, params }),
            axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/repos`, { headers }),
            axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/branches`, { headers }),
            axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/developers`, { headers }),
          ]);
          if (!active) return;
          setRecords(recordsRes.data?.vulnerabilities || []);
          setRepos(reposRes.data?.repos || []);
          setBranches(branchesRes.data?.branches || []);
          setDevelopers(devsRes.data?.developers || []);
          return;
        }

        const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
        const { data } = await axios.get(`${API_BASE_URL}/api/auth/vulnerabilities`, { headers, params });
        if (!active) return;
        setRecords(data?.vulnerabilities || []);
      } catch {
        if (!active) return;
        setRecords([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, organization?._id, filters]);

  const heading = useMemo(() => {
    if (role === "SOLO_DEVELOPER") return "My Vulnerabilities";
    if (role === "EMPLOYEE") return "Assigned & Visible Vulnerabilities";
    return "Organization Vulnerabilities";
  }, [role]);

  return (
    <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">{heading}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Filter by repository, branch, developer, status, and severity without changing the existing scan pipeline.
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          {organization?.name || user?.email || "LeakShield"}
        </div>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <select
            value={filters.repo}
            onChange={(event) => setFilters((prev) => ({ ...prev, repo: event.target.value }))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm"
          >
            <option value="">All repositories</option>
            {repos.map((repo) => (
              <option key={repo._id || repo.repoName} value={repo._id}>
                {repo.repoName || repo._id}
              </option>
            ))}
          </select>

          <select
            value={filters.branch}
            onChange={(event) => setFilters((prev) => ({ ...prev, branch: event.target.value }))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch._id || "branch"} value={branch._id || ""}>
                {branch._id || "Unknown"}
              </option>
            ))}
          </select>

          <select
            value={filters.developerEmail}
            onChange={(event) => setFilters((prev) => ({ ...prev, developerEmail: event.target.value }))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm"
          >
            <option value="">All developers</option>
            {developers.map((developer) => (
              <option key={developer._id || developer.author} value={developer._id || ""}>
                {developer.author || developer._id || "Unknown"}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="FIXED">Fixed</option>
            <option value="IGNORED">Ignored</option>
          </select>

          <select
            value={filters.severity}
            onChange={(event) => setFilters((prev) => ({ ...prev, severity: event.target.value }))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm"
          >
            <option value="">All severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950/40">
              <tr>
                {["Repository", "Branch", "File", "Line", "Type", "Severity", "Author", "Email", "Commit Time", "Status", "Patched By"].map((headingCell) => (
                  <th key={headingCell} className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {headingCell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {records.map((row) => (
                <tr key={row._id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-4 text-sm text-zinc-200">{row.repoName || row.repoUrl || "Unknown"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-400">{row.branch || "N/A"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-300">{row.file || "N/A"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-400">{row.line ?? "N/A"}</td>
                  <td className="px-4 py-4 text-sm text-blue-300">{row.secretType || "Secret"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-300">{row.severity || "MEDIUM"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-300">{row.author || "Unknown"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-400 font-mono">{row.authorEmail || "N/A"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-400">
                    {row.commitTime ? new Date(row.commitTime).toLocaleString() : "N/A"}
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-300">{row.status || "OPEN"}</td>
                  <td className="px-4 py-4 text-sm text-zinc-400">
                    {row.status === "FIXED"
                      ? row.fixedByEmail
                        ? `${row.fixedByEmail}${row.fixedAt ? ` · ${new Date(row.fixedAt).toLocaleString()}` : ""}`
                        : row.fixedAt
                          ? new Date(row.fixedAt).toLocaleString()
                          : "Recorded"
                      : "—"}
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-zinc-500">
                    No vulnerability records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
