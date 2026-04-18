import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, FolderGit2, ShieldCheck, Users, UserRound } from "lucide-react";
import { userAuth } from "../../../context/Auth";

const API_BASE_URL = "http://localhost:3000";
const CARD = "bg-zinc-900/80 border border-zinc-800 rounded-lg p-5 flex flex-col";

type Summary = {
  total: number;
  open: number;
  fixed: number;
  ignored: number;
  highSeverity: number;
  repos: number;
  developers: number;
};

export default function OrganizationOverview() {
  const { token, organization, role } = userAuth()!;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orgDetails, setOrgDetails] = useState(organization);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token || !organization?._id) return;
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [summaryRes, organizationRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/vulnerabilities/summary`, { headers }),
          axios.get(`${API_BASE_URL}/api/organizations/${organization._id}`, { headers }),
        ]);

        if (active && summaryRes.data?.success) {
          setSummary(summaryRes.data.summary);
        }
        if (active && organizationRes.data?.success) {
          setOrgDetails(organizationRes.data.organization || organization);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, organization]);

  const cards = useMemo(
    () => [
      {
        label: role === "EMPLOYEE" ? "Visible vulnerabilities" : "Total vulnerabilities",
        value: summary?.total ?? orgDetails?.summary?.totalVulnerabilities ?? 0,
        icon: AlertTriangle,
        color: "text-rose-300",
      },
      {
        label: "Open",
        value: summary?.open ?? orgDetails?.summary?.open ?? 0,
        icon: ShieldCheck,
        color: "text-amber-300",
      },
      {
        label: "Fixed",
        value: summary?.fixed ?? orgDetails?.summary?.fixed ?? 0,
        icon: ShieldCheck,
        color: "text-emerald-300",
      },
      {
        label: "Repositories",
        value: summary?.repos ?? orgDetails?.summary?.repos ?? 0,
        icon: FolderGit2,
        color: "text-blue-300",
      },
      {
        label: "Developers",
        value: summary?.developers ?? orgDetails?.summary?.developers ?? orgDetails?.members?.length ?? 0,
        icon: UserRound,
        color: "text-slate-200",
      },
    ],
    [summary, orgDetails, role]
  );

  const rosterStats = useMemo(() => {
    const members = orgDetails?.members || [];
    return {
      totalMembers: orgDetails?.totalMembers ?? members.length,
      activeMembers:
        orgDetails?.summary?.activeMembers ?? members.filter((member) => member.status === "ACTIVE").length,
      pendingInvites:
        orgDetails?.summary?.pendingInvites ?? (orgDetails?.invites || []).filter((invite) => invite.status === "PENDING").length,
    };
  }, [orgDetails]);

  return (
    <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            {orgDetails?.name || "Organization Overview"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {role === "ORG_OWNER"
              ? "Manage your team, invitations, and repository risk from one place."
              : "View the vulnerabilities and developer attribution relevant to your organization access."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {role === "ORG_OWNER" && (
            <Link
              to="/Dashboard2/team"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-sm font-medium"
            >
              <Users size={16} />
              Team members
            </Link>
          )}
          <Link
            to="/Dashboard2/vulnerabilities"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          >
            <AlertTriangle size={16} />
            Vulnerability management
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={CARD}>
              <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{card.label}</p>
                <Icon size={18} className={card.color} />
              </div>
              <div className={`text-3xl font-semibold tabular-nums ${card.color}`}>{card.value}</div>
              {loading && <p className="text-xs text-zinc-600 mt-3">Refreshing organization summary…</p>}
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className={`${CARD} min-h-[260px]`}>
          <h2 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-zinc-500" />
            Organization snapshot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-300">
            <div className="space-y-3">
              <p>
                <span className="text-zinc-500">Name:</span> {orgDetails?.name || "Unknown"}
              </p>
              <p>
                <span className="text-zinc-500">Owner:</span>{" "}
                {orgDetails?.owner?.name || orgDetails?.owner?.email || "Unknown"}
              </p>
              <p>
                <span className="text-zinc-500">Owner email:</span> {orgDetails?.owner?.email || "N/A"}
              </p>
              <p>
                <span className="text-zinc-500">Slug:</span> {orgDetails?.slug || "N/A"}
              </p>
            </div>
            <div className="space-y-3">
              <p>
                <span className="text-zinc-500">Members:</span> {rosterStats.totalMembers}
              </p>
              <p>
                <span className="text-zinc-500">Active members:</span> {rosterStats.activeMembers}
              </p>
              <p>
                <span className="text-zinc-500">Pending invites:</span> {rosterStats.pendingInvites}
              </p>
              <p>
                <span className="text-zinc-500">Created:</span>{" "}
                {orgDetails?.createdAt ? new Date(orgDetails.createdAt).toLocaleString() : "N/A"}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Open vulnerabilities</p>
              <p className="mt-2 text-lg font-semibold text-amber-300">{summary?.open ?? orgDetails?.summary?.open ?? 0}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Repos tracked</p>
              <p className="mt-2 text-lg font-semibold text-blue-300">{summary?.repos ?? orgDetails?.summary?.repos ?? 0}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Developers involved</p>
              <p className="mt-2 text-lg font-semibold text-zinc-100">{summary?.developers ?? orgDetails?.summary?.developers ?? 0}</p>
            </div>
          </div>
        </div>

        <div className={`${CARD} min-h-[260px]`}>
          <h2 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2">
            <Users size={16} className="text-zinc-500" />
            Team activity
          </h2>
          <div className="space-y-3">
            {(orgDetails?.members || []).slice(0, 6).map((member) => (
              <div
                key={member._id}
                className="rounded-md border border-zinc-800 bg-zinc-950/50 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{member.name || member.email}</p>
                  <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">{member.status}</span>
              </div>
            ))}
            {!orgDetails?.members?.length && (
              <p className="text-sm text-zinc-500">No organization members are loaded yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
