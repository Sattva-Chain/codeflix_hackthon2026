import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import { userAuth } from "../../../context/Auth";
import type { OrganizationMember } from "../../../context/Auth";

const API_BASE_URL = "http://localhost:3000";

export default function OrganizationTeam() {
  const { token, organization, role, refreshUser } = userAuth()!;
  const [members, setMembers] = useState<OrganizationMember[]>(organization?.members || []);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

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
      setEmail("");
      await refreshUser();
      const membersRes = await axios.get(`${API_BASE_URL}/api/organizations/${organization._id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (membersRes.data?.success) {
        setMembers(membersRes.data.members || []);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to send invite.");
    } finally {
      setSending(false);
    }
  };

  if (role !== "ORG_OWNER") {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">
        Team management is available only to organization owners.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 text-zinc-200 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Team Members</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Invite employees and review current organization membership without leaving the dashboard.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6">
        <form className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4" onSubmit={handleInvite}>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">Invite employee</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee@company.com"
              className="w-full mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="self-end inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold"
          >
            <Send size={16} />
            {sending ? "Sending invite..." : "Send invite"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Current members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950/40">
              <tr>
                <th className="px-6 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Name</th>
                <th className="px-6 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Email</th>
                <th className="px-6 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Role</th>
                <th className="px-6 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {members.map((member) => (
                <tr key={member._id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-zinc-200">{member.name || "Pending member"}</td>
                  <td className="px-6 py-4 text-sm text-zinc-400 font-mono">{member.email}</td>
                  <td className="px-6 py-4 text-sm text-zinc-300">{member.role}</td>
                  <td className="px-6 py-4 text-sm text-zinc-400">{member.status}</td>
                </tr>
              ))}
              {!members.length && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-zinc-500">
                    No team members found.
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
