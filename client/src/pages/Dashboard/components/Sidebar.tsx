import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileSearch,
  BarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
} from "lucide-react";
import { userAuth } from "../../../context/Auth";

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, company, organization, role, logout, isLegacyCompanySession } = userAuth()!;

  const isOrgOwner = role === "ORG_OWNER" || isLegacyCompanySession;
  const isEmployee = role === "EMPLOYEE";
  const isSoloDeveloper = role === "SOLO_DEVELOPER" || (!!user && !organization && !isOrgOwner);

  const links: {
    name: string;
    icon: typeof LayoutDashboard;
    path: string;
    /** false = highlight on child routes (e.g. team member logs) */
    exact: boolean;
  }[] = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Dashboard2", exact: true },
    { name: "Scans", icon: FileSearch, path: "/Dashboard2/scans", exact: true },
    ...((isSoloDeveloper || isEmployee)
      ? [{ name: "Reports", icon: BarChart2, path: "/Dashboard2/reports", exact: true as const }]
      : []),
    ...((isOrgOwner || isEmployee)
      ? [{ name: "Vulnerabilities", icon: BarChart2, path: "/Dashboard2/vulnerabilities", exact: true as const }]
      : []),
    { name: "Settings", icon: Settings, path: "/Dashboard2/settings", exact: true },
    ...(isOrgOwner
      ? [{ name: "Team", icon: User, path: "/Dashboard2/team", exact: false as const }]
      : []),
  ];

  const isActive = (path: string, exact: boolean) => {
    if (exact) {
      return location.pathname === path || location.pathname === `${path}/`;
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <aside
      // flex-shrink-0 prevents the sidebar from being squished by main content
      // z-20 keeps it above other elements on smaller screens
      className={`relative flex-shrink-0 h-full flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-200 z-20 ${
        collapsed ? "w-20" : "w-60"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 p-1 rounded-md flex items-center justify-center transition-colors"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Header / Logo Section */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <img
          src="/Gemini_Generated_Image_3pferw3pferw3pfe-removebg-preview.png"
          className="w-8 h-8 object-contain opacity-90"
          alt=""
        />
        {!collapsed && (
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight whitespace-nowrap">
            SecureScan
          </h1>
        )}
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        {!collapsed && (
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3 px-2">
            Navigation
          </h2>
        )}
        <nav className="space-y-0.5">
          {links.map((link) => {
            const active = isActive(link.path, link.exact);
            const Icon = link.icon;

            return (
              <Link
                key={link.name}
                to={link.path}
                title={collapsed ? link.name : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors group ${
                  active
                    ? "bg-zinc-800 text-zinc-100 border-l-2 border-blue-600 -ml-px pl-[11px]"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border-l-2 border-transparent"
                }`}
              >
                <Icon
                  size={18}
                  className={active ? "text-zinc-200" : "text-zinc-500 group-hover:text-zinc-300"}
                />
                {!collapsed && <span className="whitespace-nowrap">{link.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile / Logout Section (from screenshot) */}
      <div className="p-3 border-t border-zinc-800 mt-auto">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-md transition-all ${collapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div className="bg-zinc-800 p-2 rounded-md flex-shrink-0 border border-zinc-700">
              <User size={16} className="text-zinc-400" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-zinc-200 truncate">
                  {user
                    ? user.name?.trim() || user.email.split("@")[0]
                    : organization?.name?.trim() || company?.companyName?.trim() || "Organization"}
                </span>
                <span className="text-xs text-zinc-500">
                  {isOrgOwner ? "Organization Owner" : isEmployee ? "Employee" : "Developer"}
                </span>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate("/", { replace: true });
              }}
              className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded-md hover:bg-zinc-800"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
