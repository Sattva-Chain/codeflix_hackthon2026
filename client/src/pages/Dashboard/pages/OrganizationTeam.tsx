import { useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Bot, Cloud, Copy, Database, FolderGit2, Github, KeyRound, Link2, Mail, Send, ShieldCheck, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { userAuth } from "../../../context/Auth";
import type { OrganizationMember } from "../../../context/Auth";

const API_BASE_URL = "http://localhost:3000";
const CARD = "rounded-lg border border-zinc-800 bg-zinc-900/70 p-5";
const PANEL = "rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden";

type MemberRepo = {
  _id: string;
  gitUrl: string;
  repoName?: string | null;
  Branch?: string | null;
  LastScanned?: string | null;
  Status?: string | null;
  TotalSecrets?: number;
};

type RepoVulnerability = {
  _id: string;
  file?: string | null;
  line?: number | null;
  secret?: string | null;
  maskedSecret?: string | null;
  secretType?: string | null;
  severity?: string | null;
  author?: string | null;
  authorEmail?: string | null;
  commitTime?: string | null;
  commitHash?: string | null;
  snippet?: {
    lines?: { num: number; text: string }[];
    highlightLine?: number | null;
  } | null;
  status?: string | null;
  fixedByEmail?: string | null;
  fixedAt?: string | null;
};

function getSecretTypeMeta(secretType?: string | null) {
  const value = String(secretType || "").toLowerCase();

  if (value.includes("redis")) {
    return { label: "Redis", tone: "text-rose-300 border-rose-500/20 bg-rose-500/10", icon: Database };
  }
  if (value.includes("mongo")) {
    return { label: "MongoDB", tone: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10", icon: Database };
  }
  if (value.includes("aws")) {
    return { label: "AWS", tone: "text-amber-300 border-amber-500/20 bg-amber-500/10", icon: Cloud };
  }
  if (value.includes("gcp") || value.includes("google")) {
    return { label: "GCP", tone: "text-sky-300 border-sky-500/20 bg-sky-500/10", icon: Cloud };
  }
  if (value.includes("gemini")) {
    return { label: "Gemini", tone: "text-violet-300 border-violet-500/20 bg-violet-500/10", icon: Sparkles };
  }
  if (value.includes("github")) {
    return { label: "GitHub", tone: "text-zinc-200 border-zinc-700 bg-zinc-800/60", icon: Github };
  }
  if (value.includes("openai")) {
    return { label: "OpenAI", tone: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10", icon: Bot };
  }

  return { label: "Credential", tone: "text-blue-300 border-blue-500/20 bg-blue-500/10", icon: KeyRound };
}

function getHighlightedSnippet(entry: RepoVulnerability) {
  const lines = entry.snippet?.lines || [];
  const highlightLine = entry.snippet?.highlightLine;
  if (!lines.length) return null;
  return lines.find((line) => line.num === highlightLine) || lines[0] || null;
}

export default function OrganizationTeam() {
  const { token, organization, role, refreshUser } = userAuth()!;
  const [members, setMembers] = useState<OrganizationMember[]>(organization?.members || []);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [repoModal, setRepoModal] = useState<{
    memberName: string;
    memberEmail: string;
    repositories: MemberRepo[];
  } | null>(null);
  const [repoDetailsModal, setRepoDetailsModal] = useState<{
    memberName: string;
    memberEmail: string;
    repository: MemberRepo;
    vulnerabilities: RepoVulnerability[];
  } | null>(null);
  const [repoLoadingId, setRepoLoadingId] = useState<string | null>(null);
  const [repoDetailsLoadingId, setRepoDetailsLoadingId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [lastInviteResult, setLastInviteResult] = useState<{
    email: string;
    inviteLink: string;
    delivered: boolean;
    skipped: boolean;
    message?: string;
    suggestion?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!token || !organization?._id) return;
      setLoading(true);
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (active && data?.success) {
          setMembers(data.members || []);
        }
      } catch (error: any) {
        toast.error(error?.response?.data?.message || "Unable to load team members.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, organization?._id]);

  const reloadMembers = async () => {
    if (!token || !organization?._id) return;
    const { data } = await axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) {
      setMembers(data.members || []);
    }
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization?._id || !email.trim()) {
      toast.error("Member email is required.");
      return;
    }

    setSending(true);
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/organizations/${organization._id}/invite`,
        { email, role: "EMPLOYEE" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(data.message || "Invite sent.");
      setLastInviteResult({
        email: data?.invite?.email || email,
        inviteLink: data?.invite?.inviteLink || "",
        delivered: Boolean(data?.delivery?.delivered),
        skipped: Boolean(data?.delivery?.skipped),
        message: data?.delivery?.message,
        suggestion: data?.delivery?.suggestion,
      });
      setEmail("");
      await refreshUser();
      await reloadMembers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to send invite.");
    } finally {
      setSending(false);
    }
  };

  const stats = useMemo(() => {
    const invited = members.filter((member) => member.status === "INVITED").length;
    const active = members.filter((member) => member.status === "ACTIVE").length;
    return {
      total: members.length,
      invited,
      active,
    };
  }, [members]);

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) {
      toast.error(`No ${label.toLowerCase()} available to copy.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch (_error) {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (!organization?._id || !token) return;

    const isInvite = String(member._id || "").startsWith("invite:");
    const confirmMessage = isInvite
      ? `Remove the pending invite for ${member.email}?`
      : `Delete ${member.email} and remove their related LeakShield data from the database?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setRemovingId(String(member._id));
    try {
      const { data } = await axios.delete(
        `${API_BASE_URL}/api/organizations/${organization._id}/members/${encodeURIComponent(String(member._id))}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success(data?.message || (isInvite ? "Invite removed." : "Employee removed."));
      await refreshUser();
      await reloadMembers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to remove team member.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleViewRepositories = async (member: OrganizationMember) => {
    if (!organization?._id || !token || String(member._id).startsWith("invite:")) return;

    setRepoLoadingId(String(member._id));
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/api/organizations/${organization._id}/members/${encodeURIComponent(String(member._id))}/repos`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (data?.success) {
        setRepoModal({
          memberName: data?.member?.name || member.name || member.email,
          memberEmail: data?.member?.email || member.email,
          repositories: data?.repositories || [],
        });
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to load employee repositories.");
    } finally {
      setRepoLoadingId(null);
    }
  };

  const handleViewRepositoryDetails = async (repository: MemberRepo) => {
    if (!organization?._id || !token || !repoModal) return;

    setRepoDetailsLoadingId(String(repository._id));
    try {
      const member = members.find((entry) => entry.email === repoModal.memberEmail);
      const memberId = member?._id;
      if (!memberId || String(memberId).startsWith("invite:")) {
        toast.error("Unable to resolve employee details for this repository.");
        return;
      }

      const { data } = await axios.get(
        `${API_BASE_URL}/api/organizations/${organization._id}/members/${encodeURIComponent(String(memberId))}/repos/${encodeURIComponent(String(repository._id))}/details`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (data?.success) {
        setRepoDetailsModal({
          memberName: data?.member?.name || repoModal.memberName,
          memberEmail: data?.member?.email || repoModal.memberEmail,
          repository: data?.repository || repository,
          vulnerabilities: data?.vulnerabilities || [],
        });
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to load repository details.");
    } finally {
      setRepoDetailsLoadingId(null);
    }
  };

  if (role !== "ORG_OWNER") {
    return (
      <div className={`${CARD} text-sm text-zinc-400`}>
        Team management is available only to organization owners.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Team Management</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Invite employees, review membership status, and keep organization access aligned with the rest of the dashboard.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total members", value: stats.total, icon: Users, tone: "text-blue-300" },
          { label: "Active", value: stats.active, icon: ShieldCheck, tone: "text-emerald-300" },
          { label: "Invited", value: stats.invited, icon: Mail, tone: "text-orange-300" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={CARD}>
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{item.label}</p>
                <Icon className={`w-4 h-4 ${item.tone}`} />
              </div>
              <div className={`text-3xl font-semibold tabular-nums ${item.tone}`}>{item.value}</div>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <div className={CARD}>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-blue-300" />
                <h2 className="text-sm font-semibold text-zinc-100">Invite employee</h2>
              </div>
              <p className="text-sm text-zinc-400 leading-6">
                Invite a developer into your organization workspace. The backend handles token validation,
                password setup, and organization membership automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-[140px] rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pending invites</p>
                <p className="mt-2 text-lg font-semibold text-orange-300">{stats.invited}</p>
              </div>
              <div className="min-w-[140px] rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Active employees</p>
                <p className="mt-2 text-lg font-semibold text-emerald-300">{stats.active}</p>
              </div>
            </div>
          </div>

          <form className="mt-6 grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr_auto] gap-4 items-end" onSubmit={handleInvite}>
            <div className="xl:col-span-1">
              <label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Employee email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="employee@company.com"
                className="w-full mt-2 p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400 leading-6">
              Employees receive organization access only. Invite links stay secure even if email delivery is unavailable.
            </div>

            <button
              type="submit"
              disabled={sending}
              className="inline-flex w-full xl:w-auto items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending invite..." : "Send invite"}
            </button>
          </form>

          {lastInviteResult && (
            <div
              className={`mt-5 rounded-lg border p-4 ${
                lastInviteResult.delivered
                  ? "border-emerald-500/20 bg-emerald-500/10"
                  : "border-orange-500/20 bg-orange-500/10"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {lastInviteResult.delivered ? "Invite email delivered" : "Invite ready to share"}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">{lastInviteResult.email}</p>
                </div>
                <span
                  className={`w-fit px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    lastInviteResult.delivered
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : "border-orange-500/20 bg-orange-500/10 text-orange-300"
                  }`}
                >
                  {lastInviteResult.delivered ? "Delivered" : "Manual share"}
                </span>
              </div>

              <p className="text-sm text-zinc-300 mt-3 leading-6">
                {lastInviteResult.delivered
                  ? "The employee will receive a secure set-password link by email."
                  : "Email was skipped or failed. You can still copy the invite link below and send it manually to the employee."}
              </p>

              {lastInviteResult.message && (
                <p className="text-xs text-zinc-400 mt-2">{lastInviteResult.message}</p>
              )}

              {lastInviteResult.suggestion && !lastInviteResult.delivered && (
                <p className="text-xs text-orange-200/90 mt-2">{lastInviteResult.suggestion}</p>
              )}

              <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">Invite link</p>
                <p className="text-xs text-blue-300 break-all">{lastInviteResult.inviteLink || "Unavailable"}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => copyToClipboard(lastInviteResult.inviteLink, "Invite link")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 hover:bg-zinc-800/70"
                >
                  <Copy className="w-4 h-4" />
                  Copy invite link
                </button>
                <button
                  type="button"
                  onClick={() => window.open(lastInviteResult.inviteLink, "_blank")}
                  disabled={!lastInviteResult.inviteLink}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white"
                >
                  <Link2 className="w-4 h-4" />
                  Open invite
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={PANEL}>
          <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Organization roster</h2>
              <p className="text-xs text-zinc-500 mt-1">Pending invites and active members are shown together.</p>
            </div>
            <span className="px-2.5 py-1 rounded-full border border-zinc-700 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
              {loading ? "Loading" : `${members.length} entries`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-950/30">
                <tr>
                  {["Name", "Email", "Role", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {members.map((member) => (
                  <tr key={member._id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-5 py-4 text-sm text-zinc-200">{member.name || "Pending member"}</td>
                    <td className="px-5 py-4 text-sm text-zinc-400 font-mono">{member.email}</td>
                    <td className="px-5 py-4 text-sm text-zinc-300">{member.role}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          member.status === "ACTIVE"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : member.status === "INVITED"
                              ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
                              : "border-zinc-700 bg-zinc-800/60 text-zinc-300"
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {member.role === "ORG_OWNER" ? (
                        <span className="text-xs text-zinc-500">Owner protected</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {member.status !== "INVITED" && (
                            <button
                              type="button"
                              onClick={() => handleViewRepositories(member)}
                              disabled={repoLoadingId === String(member._id)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-xs font-semibold uppercase tracking-[0.14em]"
                            >
                              <FolderGit2 className="w-3.5 h-3.5" />
                              {repoLoadingId === String(member._id) ? "Loading..." : "View repos"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            disabled={removingId === String(member._id)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-xs font-semibold uppercase tracking-[0.14em]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {removingId === String(member._id) ? "Removing..." : member.status === "INVITED" ? "Remove invite" : "Delete"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!members.length && !loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-500">
                      No team members found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {repoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/50 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Employee repositories</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {repoModal.memberName} · {repoModal.memberEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepoModal(null)}
                className="p-2 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {repoModal.repositories.length ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {repoModal.repositories.map((repository) => (
                    <div
                      key={repository._id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-100">
                          {repository.repoName || repository.gitUrl}
                        </p>
                        <p className="text-xs text-blue-300 mt-2 break-all">{repository.gitUrl}</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-zinc-500">
                          <span>Branch: <span className="text-zinc-300">{repository.Branch || "N/A"}</span></span>
                          <span>Last scanned: <span className="text-zinc-300">{repository.LastScanned ? new Date(repository.LastScanned).toLocaleString() : "N/A"}</span></span>
                          <span>Open keys: <span className="text-orange-300">{repository.TotalSecrets ?? 0}</span></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            repository.Status === "Vulnerable"
                              ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {repository.Status || "Unknown"}
                        </span>
                        <button
                          type="button"
                          onClick={() => window.open(repository.gitUrl, "_blank")}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                        >
                          Open repo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleViewRepositoryDetails(repository)}
                          disabled={repoDetailsLoadingId === String(repository._id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 text-sm font-medium transition-colors disabled:opacity-60"
                        >
                          {repoDetailsLoadingId === String(repository._id) ? "Loading..." : "View details"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-10 text-center text-sm text-zinc-500">
                  No repositories have been stored for this employee yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {repoDetailsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/60 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Repository security details</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {repoDetailsModal.memberName} · {repoDetailsModal.memberEmail}
                </p>
                <p className="text-xs text-blue-300 mt-2 break-all">
                  {repoDetailsModal.repository.repoName || repoDetailsModal.repository.gitUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepoDetailsModal(null)}
                className="p-2 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(88vh-80px)]">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Branch</p>
                  <p className="text-lg font-semibold text-zinc-100 mt-3">{repoDetailsModal.repository.Branch || "N/A"}</p>
                </div>
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-orange-200/80 font-bold">Open keys</p>
                  <p className="text-lg font-semibold text-orange-300 mt-3">{repoDetailsModal.repository.TotalSecrets ?? repoDetailsModal.vulnerabilities.length}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Status</p>
                  <p className="text-lg font-semibold text-zinc-100 mt-3">{repoDetailsModal.repository.Status || "Unknown"}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Last scanned</p>
                  <p className="text-sm font-semibold text-zinc-100 mt-3">
                    {repoDetailsModal.repository.LastScanned ? new Date(repoDetailsModal.repository.LastScanned).toLocaleString() : "N/A"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40">
                  <h3 className="text-sm font-semibold text-zinc-100">Detected keys and code context</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    File path, line, secret type, masked key, author, and commit metadata for this employee repository.
                  </p>
                </div>

                <div className="p-5 space-y-4">
                  {repoDetailsModal.vulnerabilities.map((entry) => {
                    const reveal = !!revealedSecrets[entry._id];
                    const displaySecret = reveal
                      ? entry.secret || entry.maskedSecret || "N/A"
                      : entry.maskedSecret || entry.secret || "N/A";
                    const snippetLine = getHighlightedSnippet(entry);
                    const serviceMeta = getSecretTypeMeta(entry.secretType);
                    const ServiceIcon = serviceMeta.icon;
                    const patchedByLabel =
                      entry.status === "FIXED"
                        ? entry.fixedByEmail
                          ? `${entry.fixedByEmail}${entry.fixedAt ? ` · ${new Date(entry.fixedAt).toLocaleString()}` : ""}`
                          : entry.fixedAt
                            ? `Recorded · ${new Date(entry.fixedAt).toLocaleString()}`
                            : "Recorded"
                        : "Still open";

                    return (
                      <div key={`card-${entry._id}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                        <div className="p-5">
                          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-semibold text-zinc-100 break-all">{entry.file || "Unknown file"}</h4>
                                <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
                                  {entry.line != null ? `Line #${entry.line}` : "Line unavailable"}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                    entry.status === "FIXED"
                                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                      : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                                  }`}
                                >
                                  {entry.status || "OPEN"}
                                </span>
                              </div>

                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Type / API</p>
                                  <div className="mt-3 flex flex-col gap-2">
                                    <span className="text-sm font-semibold text-blue-300">{entry.secretType || "Secret"}</span>
                                    <span className={`inline-flex w-fit items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.18em] ${serviceMeta.tone}`}>
                                      <ServiceIcon className="w-3.5 h-3.5" />
                                      {serviceMeta.label}
                                    </span>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Key exposure</p>
                                  <div className="mt-3 space-y-3">
                                    <div className="rounded-xl border border-rose-500/15 bg-rose-500/8 px-3 py-3">
                                      <p className="font-mono text-xs text-rose-300 break-all">{displaySecret}</p>
                                    </div>
                                    {(entry.secret || entry.maskedSecret) && (
                                      <button
                                        type="button"
                                        onClick={() => setRevealedSecrets((prev) => ({ ...prev, [entry._id]: !prev[entry._id] }))}
                                        className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                                      >
                                        {reveal ? "Hide key" : "Reveal key"}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Author trace</p>
                                  <div className="mt-3 space-y-1 text-sm">
                                    <p className="text-zinc-200">{entry.author || "Unknown"}</p>
                                    <p className="text-zinc-500 font-mono text-xs break-all">{entry.authorEmail || "N/A"}</p>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Commit + Fix</p>
                                  <div className="mt-3 space-y-2 text-sm text-zinc-400">
                                    <p>{entry.commitHash ? entry.commitHash.slice(0, 12) : "Commit N/A"}</p>
                                    <p>{entry.commitTime ? new Date(entry.commitTime).toLocaleString() : "Commit time N/A"}</p>
                                    <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-500">
                                      <p className="uppercase tracking-[0.18em] text-zinc-600 mb-1">Patched By</p>
                                      <p className="text-zinc-300 normal-case tracking-normal break-all">{patchedByLabel}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-zinc-800 bg-zinc-950/80 p-5">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Code Context</p>
                              <p className="text-xs text-zinc-500 mt-1">
                                {snippetLine
                                  ? "Last stored code line where the key was detected."
                                  : "Older stored finding without saved code context."}
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-blue-300">
                              {snippetLine?.num ? `L${snippetLine.num}` : entry.line != null ? `L${entry.line}` : "Line N/A"}
                            </span>
                          </div>

                          {snippetLine ? (
                            <div className="rounded-xl border border-zinc-800 bg-[#101317] overflow-hidden">
                              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950/90 text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">
                                Open code line
                              </div>
                              <pre className="px-4 py-4 text-[12px] leading-6 text-zinc-200 font-mono whitespace-pre-wrap break-words">
                                {snippetLine.text}
                              </pre>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 text-sm text-zinc-400 leading-6">
                              The saved record does not include a snippet for this older finding yet.
                              {entry.line != null
                                ? ` The last known flagged line is ${entry.line}.`
                                : " The line number was not stored for this older record."}
                              {" "}Run a fresh scan to store the full code context for future reviews.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!repoDetailsModal.vulnerabilities.length && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-10 text-center text-sm text-zinc-500">
                      No stored vulnerability details are available for this repository yet.
                    </div>
                  )}
                </div>

                <div className="hidden overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-950/30">
                      <tr>
                        {["File", "Line", "Type / API", "Key", "Severity", "Author", "Commit", "Status", "Patched By"].map((heading) => (
                          <th key={heading} className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {repoDetailsModal.vulnerabilities.map((entry) => {
                        const reveal = !!revealedSecrets[entry._id];
                        const displaySecret = reveal
                          ? entry.secret || entry.maskedSecret || "N/A"
                          : entry.maskedSecret || entry.secret || "N/A";
                        const snippetLine = getHighlightedSnippet(entry);
                        const serviceMeta = getSecretTypeMeta(entry.secretType);
                        const ServiceIcon = serviceMeta.icon;

                        return (
                          <tr key={entry._id} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-4 py-4 text-sm text-zinc-200">{entry.file || "N/A"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-400">{entry.line ?? "N/A"}</td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                <span className="text-sm font-semibold text-blue-300">{entry.secretType || "Secret"}</span>
                                <span className={`inline-flex w-fit items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.18em] ${serviceMeta.tone}`}>
                                  <ServiceIcon className="w-3.5 h-3.5" />
                                  {serviceMeta.label}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="space-y-2">
                                <p className="text-sm font-mono text-zinc-300 break-all">{displaySecret}</p>
                                {(entry.secret || entry.maskedSecret) && (
                                  <button
                                    type="button"
                                    onClick={() => setRevealedSecrets((prev) => ({ ...prev, [entry._id]: !prev[entry._id] }))}
                                    className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                                  >
                                    {reveal ? "Hide key" : "Reveal key"}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{entry.severity || "MEDIUM"}</td>
                            <td className="px-4 py-4">
                              <div className="space-y-1 text-sm">
                                <p className="text-zinc-200">{entry.author || "Unknown"}</p>
                                <p className="text-zinc-500 font-mono text-xs">{entry.authorEmail || "N/A"}</p>
                                {snippetLine && (
                                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 overflow-hidden">
                                    <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-3">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Open code line</p>
                                      <span className="text-[10px] font-mono text-blue-300">L{snippetLine.num}</span>
                                    </div>
                                    <pre className="px-3 py-3 text-[11px] leading-6 text-zinc-300 font-mono whitespace-pre-wrap break-words">
                                      {snippetLine.text}
                                    </pre>
                                  </div>
                                )}
                                {!snippetLine && (
                                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-500">
                                    Code context not stored for this older finding yet. The flagged location is line {entry.line ?? "N/A"}.
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="space-y-1 text-sm text-zinc-400">
                                <p>{entry.commitHash ? entry.commitHash.slice(0, 12) : "N/A"}</p>
                                <p>{entry.commitTime ? new Date(entry.commitTime).toLocaleString() : "N/A"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-300">{entry.status || "OPEN"}</td>
                            <td className="px-4 py-4 text-sm text-zinc-400">
                              {entry.status === "FIXED"
                                ? entry.fixedByEmail
                                  ? `${entry.fixedByEmail}${entry.fixedAt ? ` · ${new Date(entry.fixedAt).toLocaleString()}` : ""}`
                                  : entry.fixedAt
                                    ? new Date(entry.fixedAt).toLocaleString()
                                    : "Recorded"
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {!repoDetailsModal.vulnerabilities.length && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500">
                            No stored vulnerability details are available for this repository yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
