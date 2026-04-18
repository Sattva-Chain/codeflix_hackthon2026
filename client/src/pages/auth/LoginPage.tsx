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
  const { setSession, setToken } = userAuth()!;
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
      });

      if (data?.success && data?.token) {
        await persistNewAuthSession(data);
        toast.success("Logged in successfully.");
        navigate("/Dashboard2", { replace: true });
        return;
      }
    } catch (error: any) {
      if (role === "ORG_OWNER" || role === "EMPLOYEE") {
        try {
          const fallbackRoute = role === "ORG_OWNER" ? "/api/orgLoginData" : "/api/loginStaff";
          const fallbackBody =
            role === "ORG_OWNER"
              ? { emailId: email, pass: password }
              : { emailId: email, pass: password };
          const { data } = await axios.post(`${API_BASE_URL}${fallbackRoute}`, fallbackBody);
          const token = data.tokens || data.tokenUser;
          if (data.success && token) {
            await setToken(token);
            toast.success(data.message || "Logged in successfully.");
            navigate("/Dashboard2", { replace: true });
            return;
          }
          toast.error(data.message || "Unable to log in.");
          return;
        } catch (fallbackError: any) {
          toast.error(
            fallbackError?.response?.data?.message ||
              error?.response?.data?.message ||
              "Unable to log in."
          );
          return;
        }
      }

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
        <div className="text-sm text-slate-400">
          New here?{" "}
          <Link to="/register" className="text-blue-300 hover:text-blue-200">
            Create an account
          </Link>
        </div>
      }
    >
      <div className="flex mb-6 border border-white/10 rounded-2xl overflow-hidden bg-white/5">
        {LOGIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setRole(tab.key)}
            className={`flex-1 py-2.5 text-xs md:text-sm font-medium transition ${
              role === tab.key ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="w-full mt-2 p-3 bg-white/10 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            className="w-full mt-2 p-3 bg-white/10 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400 leading-6">
          {role === "SOLO_DEVELOPER"
            ? "Use your own account to view only your repository scans and vulnerabilities."
            : role === "ORG_OWNER"
              ? "Owners can manage organizations, invite employees, and review all team vulnerabilities."
              : "Employees can access only their allowed organization data and developer-linked vulnerabilities."}
        </div>

        <button
          disabled={loading}
          type="submit"
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 text-white rounded-lg w-full font-semibold transition"
        >
          {buttonLabel}
        </button>
      </form>
    </AuthShell>
  );
}
