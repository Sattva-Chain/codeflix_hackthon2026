import { createContext, useState, useEffect, useContext, type ReactNode } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom"; // Fixed: Added useNavigate import

const TOKEN_STORAGE_KEY = "secure-scan-token";

// 1. Expanded UserData to include fields used in Dashboard/Report
interface UserData {
  _id: string;
  email: string;
  role?: string;
  gitUrl?: string[];
  Branch?: string;
  LastScanned?: string;
  userType?: string;
  name?: string;     // Add this
  number?: string;   // Add this
  empId?: string;    // Add this
  // Missing fields fixed here:
  TotalRepositories?: number;
  VerifiedRepositories?: number;
  UnverifiedRepositories?: number;
}

// 2. Updated Repository to be used as an Array in most places
interface Repository {
  _id: string;
  userId: string;
  gitUrl: string;
  Branch: string;
  LastScanned: string;
  Status: "Vulnerable" | "Safe" | "Pending";
  createdAt: string;
  updatedAt: string;
}

// 3. Expanded CompanyData
interface CompanyData {
  _id: string;
  companyName: string;
  CompanyURL: string;
  emailId: string;
  totalRepositories?: string;
  totalEmployees: string;
  loggedInCount?: number;
  // Missing fields fixed here:
  employees?: any[]; 
  developersCount?: number;
  vulnerableCount?: number;
}

interface AuthContextType {
  token: string | null;
  user: UserData | null;
  repo: Repository[] | null; // Fixed: Changed from single object to Array
  company: CompanyData | null;
  setUser: React.Dispatch<React.SetStateAction<UserData | null>>;
  setRepo: React.Dispatch<React.SetStateAction<Repository[] | null>>;
  setCompany: React.Dispatch<React.SetStateAction<CompanyData | null>>;
  setToken: (token: string | null) => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [repo, setRepo] = useState<Repository[] | null>(null); // Fixed: Array state
  const [company, setCompany] = useState<CompanyData | null>(null);
  
  const navigate = useNavigate(); // Fixed: Defined navigate

  const readStoredToken = async () => {
    const electronToken = await window.electronAPI?.getToken?.();
    if (electronToken) return electronToken;

    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  // ✅ Load token initially
  useEffect(() => {
    const loadToken = async () => {
      const savedToken = await readStoredToken();
      if (savedToken) setTokenState(savedToken);
    };
    loadToken();
  }, []);

  // Fixed: window.electronAPI mapping (using storeToken as seen in errors)
  const setToken = async (newToken: string | null) => {
    setTokenState(newToken);
    try {
      if (newToken) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors in restricted contexts.
    }

    if (newToken) {
      await window.electronAPI?.storeToken?.(newToken);
    } else {
      await window.electronAPI?.clearToken?.();
    }
  };

  const refreshUserByToken = async (activeToken: string | null) => {
    if (!activeToken) return;

    try {
      const userRes = await axios.post("http://localhost:3000/api/authsss", { token: activeToken });
      if (userRes.data.success) {
        setRepo(userRes.data.repositories || []);
        setUser(userRes.data.userDatas);
        setCompany(null);
        return;
      }

      const companyRes = await axios.post("http://localhost:3000/api/auths", { token: activeToken });
      if (companyRes.data.success) {
        setCompany(companyRes.data.compnaydatas);
        setRepo(null);
        setUser(null);
      }
    } catch (error) {
      console.error("âŒ Auth Refresh Failed:", error);
    }
  };

  const login = async (nextToken: string) => {
    await setToken(nextToken);
    await refreshUserByToken(nextToken);
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
    setCompany(null);
    setRepo(null);
    navigate("/");
  };

  const refreshUser = async () => {
    await refreshUserByToken(token);
    return;

    try {
      // ✅ Fetch User/Staff Data
      const userRes = await axios.post("http://localhost:3000/api/authsss", { token });
      if (userRes.data.success) {
        setRepo(userRes.data.repositories || []);
        setUser(userRes.data.userDatas);
        setCompany(null);
        return;
      }

      // ✅ Fetch Org Data
      const companyRes = await axios.post("http://localhost:3000/api/auths", { token });
      if (companyRes.data.success) {
        setCompany(companyRes.data.compnaydatas);
        setRepo(null);
        setUser(null);
        return;
      }

      await logout();
    } catch (error) {
      console.error("❌ Auth Refresh Failed:", error);
      // Don't logout on simple network error, only on 401/403
    }
  };

  // ✅ Token change → Validate user
  useEffect(() => {
    if (token) refreshUser();
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        repo,
        company,
        setUser,
        setRepo,
        setCompany,
        setToken,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const userAuth = () => useContext(AuthContext);
