import { createContext, useState, useEffect, useContext, useCallback, useMemo, type ReactNode } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = "http://localhost:3000";
const AUTH_TOKEN_KEY = "leakshield.auth.token";

export type AuthRole = "SOLO_DEVELOPER" | "ORG_OWNER" | "EMPLOYEE" | string;

export interface SessionUser {
  _id: string;
  email: string;
  role?: AuthRole;
  organizationId?: string | null;
  companyId?: string | null;
  gitUrl?: string[];
  Branch?: string;
  LastScanned?: string;
  userType?: string;
  name?: string | null;
  number?: string;
  empId?: string;
  isActive?: boolean;
  TotalRepositories?: number;
  VerifiedRepositories?: number;
  UnverifiedRepositories?: number;
}

export interface Repository {
  _id: string;
  userId: string;
  gitUrl: string;
  repoName?: string | null;
  Branch: string;
  LastScanned: string;
  Status: "Vulnerable" | "Safe" | "Pending" | "Clean" | "Error";
  createdAt: string;
  updatedAt: string;
}

export interface OrgDashboardStats {
  totalRepositories: number;
  verifiedRepositories: number;
  unverifiedRepositories: number;
  vulnerableAccounts: number;
  scannedMembersCount: number;
}

export interface OrganizationOwner {
  _id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface OrganizationMember {
  _id: string;
  name?: string | null;
  email: string;
  role: string;
  status: string;
  invitedAt?: string | null;
  joinedAt?: string | null;
}

export interface OrganizationInvite {
  _id?: string;
  email: string;
  role: "EMPLOYEE";
  token?: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED";
  invitedAt?: string;
  acceptedAt?: string | null;
}

export interface OrganizationData {
  _id: string;
  name: string;
  slug: string;
  owner?: OrganizationOwner | null;
  members: OrganizationMember[];
  invites: OrganizationInvite[];
  totalMembers?: number;
  summary?: {
    totalVulnerabilities: number;
    open: number;
    fixed: number;
    ignored: number;
    repos: number;
  };
}

export interface CompanyData {
  _id: string;
  companyName: string;
  CompanyURL?: string;
  emailId?: string;
  totalRepositories?: string | number;
  totalEmployees: string | number;
  loggedInCount?: number;
  employees?: Record<string, unknown>[];
  allEmployees?: Record<string, unknown>[];
  developersCount?: number;
  vulnerableCount?: number;
  dashboardStats?: OrgDashboardStats;
}

interface PersistedSession {
  token: string | null;
  user: SessionUser | null;
  organization: OrganizationData | null;
  company: CompanyData | null;
  repo: Repository[] | null;
}

interface AuthContextType {
  token: string | null;
  user: SessionUser | null;
  repo: Repository[] | null;
  company: CompanyData | null;
  organization: OrganizationData | null;
  role: AuthRole | null;
  isLegacyCompanySession: boolean;
  sessionHydrated: boolean;
  authReady: boolean;
  setUser: React.Dispatch<React.SetStateAction<SessionUser | null>>;
  setRepo: React.Dispatch<React.SetStateAction<Repository[] | null>>;
  setCompany: React.Dispatch<React.SetStateAction<CompanyData | null>>;
  setOrganization: React.Dispatch<React.SetStateAction<OrganizationData | null>>;
  setToken: (token: string | null) => Promise<void>;
  setSession: (session: PersistedSession) => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

function mergeUserWithRepos(user: SessionUser, repos: Repository[]): SessionUser {
  const times = repos
    .map((repo) => repo.LastScanned)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  const maxTs = times.length ? Math.max(...times) : 0;
  const safeRepos = repos.filter((repo) => repo.Status === "Safe" || repo.Status === "Clean").length;
  const vulnRepos = repos.filter((repo) => repo.Status === "Vulnerable").length;
  const otherRepos = repos.length - safeRepos - vulnRepos;

  return {
    ...user,
    LastScanned: maxTs ? new Date(maxTs).toISOString() : user.LastScanned,
    TotalRepositories: repos.length || user.TotalRepositories || 0,
    VerifiedRepositories: safeRepos,
    UnverifiedRepositories: vulnRepos + Math.max(0, otherRepos),
  };
}

function normalizeLegacyCompany(payload: CompanyData): CompanyData {
  const { allEmployees, employees, ...rest } = payload || ({} as CompanyData);
  const memberList = (employees ?? allEmployees ?? []) as Record<string, unknown>[];
  return {
    ...rest,
    employees: memberList,
    totalEmployees: payload?.totalEmployees ?? memberList.length,
  };
}

function normalizeOrganizationAsCompany(organization: OrganizationData): CompanyData {
  return {
    _id: organization._id,
    companyName: organization.name,
    CompanyURL: undefined,
    emailId: organization.owner?.email || "",
    totalEmployees: organization.totalMembers ?? organization.members.length,
    employees: organization.members as unknown as Record<string, unknown>[],
    developersCount: organization.members.filter((member) => member.role === "EMPLOYEE").length,
    vulnerableCount: organization.summary?.open ?? 0,
    dashboardStats: {
      totalRepositories: organization.summary?.repos ?? 0,
      verifiedRepositories: organization.summary?.fixed ?? 0,
      unverifiedRepositories: organization.summary?.open ?? 0,
      vulnerableAccounts: organization.summary?.open ?? 0,
      scannedMembersCount: organization.members.filter((member) => member.status === "ACTIVE").length,
    },
  };
}

async function persistElectronSession(session: PersistedSession) {
  try {
    if (session.token) {
      await window.electronAPI?.setSession?.(session);
    } else {
      await window.electronAPI?.clearSession?.();
    }
  } catch {
    // optional in web context
  }
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [repo, setRepo] = useState<Repository[] | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const navigate = useNavigate();

  const buildSessionSnapshot = useCallback(
    (next: Partial<PersistedSession> = {}): PersistedSession => ({
      token: next.token !== undefined ? next.token : token,
      user: next.user !== undefined ? next.user : user,
      organization: next.organization !== undefined ? next.organization : organization,
      company: next.company !== undefined ? next.company : company,
      repo: next.repo !== undefined ? next.repo : repo,
    }),
    [token, user, organization, company, repo]
  );

  const setSession = useCallback(
    async (session: PersistedSession) => {
      setTokenState(session.token);
      setUser(session.user);
      setOrganization(session.organization);
      setCompany(session.company);
      setRepo(session.repo);

      if (typeof localStorage !== "undefined") {
        if (session.token) localStorage.setItem(AUTH_TOKEN_KEY, session.token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
      }

      await persistElectronSession(session);
    },
    []
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        let savedSession: PersistedSession | null = null;

        try {
          savedSession = ((await window.electronAPI?.getSession?.()) ?? null) as PersistedSession | null;
        } catch {
          savedSession = null;
        }

        if (alive && savedSession?.token) {
          setTokenState(savedSession.token);
          setUser(savedSession.user || null);
          setOrganization(savedSession.organization || null);
          setCompany(savedSession.company || null);
          setRepo(savedSession.repo || null);
        } else {
          let savedToken: string | null = null;
          try {
            savedToken = (await window.electronAPI?.getToken?.()) ?? null;
          } catch {
            savedToken = null;
          }
          if (!savedToken && typeof localStorage !== "undefined") {
            savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
          }
          if (alive && savedToken) {
            setTokenState(savedToken);
          }
        }
      } finally {
        if (alive) setSessionHydrated(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const clearSessionState = useCallback(async () => {
    await setSession({
      token: null,
      user: null,
      organization: null,
      company: null,
      repo: null,
    });
  }, [setSession]);

  const setToken = async (newToken: string | null) => {
    if (newToken) setAuthReady(false);
    await setSession(
      buildSessionSnapshot({
        token: newToken,
      })
    );
  };

  const login = async (authToken: string) => {
    await setToken(authToken);
  };

  const logout = async () => {
    await clearSessionState();
    setAuthReady(true);
    navigate("/", { replace: true });
  };

  const refreshUser = useCallback(async () => {
    if (!token) {
      setAuthReady(true);
      return;
    }

    setAuthReady(false);

    try {
      const meRes = await axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (meRes.data?.success) {
        const repositories: Repository[] = meRes.data.repositories || [];
        const nextUser: SessionUser = mergeUserWithRepos(meRes.data.user, repositories);
        const nextOrganization: OrganizationData | null = meRes.data.organization || null;
        const nextCompany = nextOrganization ? normalizeOrganizationAsCompany(nextOrganization) : null;

        await setSession({
          token,
          user: nextUser,
          organization: nextOrganization,
          company: nextCompany,
          repo: repositories,
        });
        setAuthReady(true);
        return;
      }
    } catch {
      // fall through to legacy auth refresh
    }

    try {
      const userRes = await axios.post(`${API_BASE_URL}/api/authsss`, { token });
      if (userRes.data.success) {
        const repositories: Repository[] = userRes.data.repositories || [];
        const raw = userRes.data.userDatas as SessionUser;
        await setSession({
          token,
          user: mergeUserWithRepos(raw, repositories),
          organization: null,
          company: null,
          repo: repositories,
        });
        setAuthReady(true);
        return;
      }

      const companyRes = await axios.post(`${API_BASE_URL}/api/auths`, { token });
      if (companyRes.data.success) {
        const payload = normalizeLegacyCompany(companyRes.data.compnaydatas as CompanyData);
        await setSession({
          token,
          user: null,
          organization: null,
          company: payload,
          repo: null,
        });
        setAuthReady(true);
        return;
      }
    } catch (error) {
      console.error("Auth refresh failed:", error);
    }

    await clearSessionState();
    setAuthReady(true);
    navigate("/", { replace: true });
  }, [token, navigate, setSession, clearSessionState]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const role = useMemo<AuthRole | null>(() => {
    if (user?.role) return user.role;
    if (company) return "ORG_OWNER";
    return null;
  }, [user, company]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      user,
      repo,
      company,
      organization,
      role,
      isLegacyCompanySession: !!company && !organization && !user,
      sessionHydrated,
      authReady,
      setUser,
      setRepo,
      setCompany,
      setOrganization,
      setToken,
      setSession,
      login,
      logout,
      refreshUser,
    }),
    [
      token,
      user,
      repo,
      company,
      organization,
      role,
      sessionHydrated,
      authReady,
      setToken,
      setSession,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const userAuth = () => useContext(AuthContext);
