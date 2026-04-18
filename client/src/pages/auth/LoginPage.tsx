import { useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { userAuth } from "../../context/Auth";

const API_BASE_URL = "http://localhost:3000";
const LOGIN_TABS = [
  { key: "SOLO_DEVELOPER", label: "Solo Developer" },
  { key: "ORG_OWNER", label: "Organization Owner" },
  { key: "EMPLOYEE", label: "Employee" },
] as const;

type LoginRole = (typeof LOGIN_TABS)[number]["key"];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setSession } = userAuth()!;
  const [role, setRole] = useState<LoginRole>("SOLO_DEVELOPER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const buttonLabel = useMemo(() => {
    if (loading) return "Signing in...";
    if (role === "ORG_OWNER") return "Sign in as owner";
    if (role === "EMPLOYEE") return "Sign in as employee";
    return "Sign in";
  }, [loading, role]);

  const persistNewAuthSession = async (data: any) => {
    await setSession({
      token: data.token,
      user: data.user || null,
      organization: data.organization || null,
      company: data.organization
        ? {
            _id: data.organization._id,
            companyName: data.organization.name,
            emailId: data.organization.owner?.email || "",
            totalEmployees: data.organization.totalMembers ?? data.organization.members?.length ?? 0,
            employees: data.organization.members ?? [],
            dashboardStats: {
              totalRepositories: data.organization.summary?.repos ?? 0,
              verifiedRepositories: data.organization.summary?.fixed ?? 0,
              unverifiedRepositories: data.organization.summary?.open ?? 0,
              vulnerableAccounts: data.organization.summary?.open ?? 0,
              scannedMembersCount: data.organization.members?.length ?? 0,
            },
          }
        : null,
      repo: data.repositories || null,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password,
        role,
      });

      if (data?.success && data?.token) {
        await persistNewAuthSession(data);
        toast.success("Logged in successfully.");
        navigate("/Dashboard2", { replace: true });
        return;
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to log in.");
      return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Role-based access"
      subtitle="Sign in to personal, owner, or employee workspaces"
      footer={
        <div className="text-sm text-zinc-400">
          New here?{" "}
          <Link to="/register" className="text-blue-300 hover:text-blue-200 font-medium transition-colors">
            Create an account
          </Link>
        </div>
      }
    >
      <div className="flex mb-6 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/70 p-1">
        {LOGIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setRole(tab.key)}
            className={`flex-1 rounded-xl py-2.5 text-xs md:text-sm font-semibold transition ${
              role === tab.key ? "bg-blue-600 text-white shadow-sm" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="w-full mt-2 p-3.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 transition"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            className="w-full mt-2 p-3.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/40 transition"
          />
        </div>

        <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400 leading-6">
          {role === "SOLO_DEVELOPER"
            ? "Use your own account to view only your repository scans and vulnerabilities."
            : role === "ORG_OWNER"
              ? "Owners can manage organizations, invite employees, and review all team vulnerabilities."
              : "Employees can access only their allowed organization data and developer-linked vulnerabilities."}
        </div>

        <button
          disabled={loading}
          type="submit"
          className="md:col-span-2 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-white font-semibold hover:bg-blue-500 disabled:bg-blue-800 transition shadow-[0_10px_30px_rgba(37,99,235,0.25)]"
        >
          {buttonLabel}
        </button>
      </form>
    </AuthShell>
  );
}
