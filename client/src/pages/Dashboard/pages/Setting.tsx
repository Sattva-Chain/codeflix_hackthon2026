"use client";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userAuth } from "../../../context/Auth";

// --- ADDED INTERFACES TO FIX TS ERRORS ---
interface CompanyData {
  companyName: string;
  emailId: string;
  CompanyURL: string;
  totalEmployees?: string | number;
  loggedInCount?: string | number;
  totalRepositories?: string | number;
  totalVerified?: string | number;
  totalUnverified?: string | number;
  vulnerableCount?: string | number;
}

interface UserData {
  email: string;
  role: string;
  Branch: string;
  userType: string;
  LastScanned?: string;
  VerifiedRepositories?: string | number;
  UnverifiedRepositories?: string | number;
  TotalRepositories?: string | number;
  companyId?: string | {
    companyName: string;
    CompanyURL: string;
  };
}

const Settings: React.FC = () => {
  const auth = userAuth();
  const { user, company, setUser, setCompany, logout } = auth! as unknown as {
    user: UserData | null;
    company: CompanyData | null;
    setUser: (u: any) => void;
    setCompany: (c: any) => void;
    logout: () => Promise<void>;
  };

  const [activeTab, setActiveTab] = useState("Profile");
  const [userType, setUserType] = useState<"organization" | "developer">("developer");

  useEffect(() => {
    if (company?.companyName || user?.userType === "organization") {
      setUserType("organization");
    } else {
      setUserType("developer");
    }
  }, [user, company]);

  const logoutHandler = async () => {
    await logout();
  };

  return (
    <div className="text-gray-200 min-h-screen p-8 bg-[#0B1120]">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-wide">
              Settings <span className="text-[#0ae8f0]">⚙️</span>
            </h2>
            <p className="text-gray-400 text-sm mt-1">Manage your account and preferences</p>
          </div>
          <button
            onClick={logoutHandler}
            className="px-5 py-2.5 bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white rounded-lg text-sm font-semibold transition-all duration-300"
          >
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-[#1E293B]">
          {["Profile", "Security", "Notifications"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold tracking-wide transition-all uppercase ${
                activeTab === tab
                  ? "border-b-2 border-[#0ae8f0] text-[#0ae8f0]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Profile Content */}
        <div className="pt-4">
          {activeTab === "Profile" && (
            <div className="space-y-6">
              {/* Organization Profile */}
              {userType === "organization" && company && (
                <ProfileCard title="Organization Overview">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <ProfileItem title="Company Name" value={company.companyName} />
                    <ProfileItem title="Email" value={company.emailId} />
                    <ProfileItem title="Company URL" value={company.CompanyURL} isLink />
                    <ProfileItem title="Total Employees" value={company.totalEmployees} />
                    <ProfileItem title="Active Employees" value={company.loggedInCount} />
                    <ProfileItem title="Total Repositories" value={company.totalRepositories} />
                    <ProfileItem title="Verified Repositories" value={company.totalVerified} />
                    <ProfileItem title="Unverified Repositories" value={company.totalUnverified} />
                    <ProfileItem title="Vulnerable Employees" value={company.vulnerableCount} isAlert />
                  </div>
                </ProfileCard>
              )}

              {/* Developer Profile */}
              {userType === "developer" && user && (
                <ProfileCard title="Developer Identity">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <ProfileItem title="Email" value={user.email} />
                    <ProfileItem title="Role" value={user.role} />
                    <ProfileItem title="Branch" value={user.Branch} />
                    <ProfileItem
                      title="Last Scanned"
                      value={user.LastScanned ? new Date(user.LastScanned).toLocaleString() : "Not scanned yet"}
                    />
                    <ProfileItem title="Verified Repositories" value={user.VerifiedRepositories} />
                    <ProfileItem title="Unverified Repositories" value={user.UnverifiedRepositories} />
                    <ProfileItem title="Total Repositories" value={user.TotalRepositories} />
                  </div>

                  {user.companyId && typeof user.companyId !== "string" && (
                    <div className="mt-8 p-5 bg-[#0B1120] rounded-lg border border-[#1E293B]">
                      <h4 className="text-[#0ae8f0] font-bold text-xs uppercase tracking-widest mb-3">
                        Associated Organization
                      </h4>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <p className="text-white text-lg font-semibold">{user.companyId.companyName}</p>
                        <a
                          href={user.companyId.CompanyURL}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 bg-[#1E293B] hover:bg-[#2A374A] text-gray-300 rounded-md text-sm transition-colors border border-gray-700"
                        >
                          Visit Website ↗
                        </a>
                      </div>
                    </div>
                  )}
                </ProfileCard>
              )}
            </div>
          )}

          {(activeTab === "Security" || activeTab === "Notifications") && (
            <div className="flex flex-col items-center justify-center p-16 bg-[#111827] border border-dashed border-[#1E293B] rounded-xl">
              <span className="text-4xl mb-4">🚧</span>
              <h3 className="text-xl text-gray-300 font-semibold mb-2">{activeTab} Settings</h3>
              <p className="text-gray-500 text-sm">This module is currently under active development.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProfileCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="p-8 rounded-xl bg-[#111827] border border-[#1E293B] shadow-2xl">
    <h3 className="font-bold text-lg text-white mb-6 flex items-center gap-2">
      <span className="w-2 h-6 bg-[#0ae8f0] rounded-sm block"></span>
      {title}
    </h3>
    {children}
  </div>
);

const ProfileItem: React.FC<{ title: string; value: any; isLink?: boolean; isAlert?: boolean }> = ({ title, value, isLink, isAlert }) => (
  <div className="flex flex-col gap-1">
    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
    {isLink ? (
      <a href={value} target="_blank" rel="noreferrer" className="text-[#0ae8f0] hover:text-white transition-colors break-all text-base font-medium">
        {value || "Not provided"}
      </a>
    ) : (
      <p className={`text-base font-semibold ${isAlert && Number(value) > 0 ? "text-red-400" : "text-gray-100"}`}>
        {value ?? "Not provided"}
      </p>
    )}
  </div>
);

export default Settings;
