import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
import logoUrl from "/Gemini_Generated_Image_3pferw3pferw3pfe-removebg-preview.png";

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = userAuth()!;

  const links = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/Dashboard2" },
    { name: "Scans", icon: FileSearch, path: "/Dashboard2/scans" },
    // Show Reports only if user exists
    ...(user
      ? [{ name: "Reports", icon: BarChart2, path: "/Dashboard2/reports" }]
      : []),
    { name: "Settings", icon: Settings, path: "/Dashboard2/settings" },
    // Show ManageEmploy only if no user (organization view)
    ...(!user
      ? [{ name: "Manage Employ", icon: User, path: "/Dashboard2/manegEmploy" }]
      : []),
  ];

  return (
    <aside
      // flex-shrink-0 prevents the sidebar from being squished by main content
      // z-20 keeps it above other elements on smaller screens
      className={`relative flex-shrink-0 h-full flex flex-col bg-[#0B1120] border-r border-[#1E293B] transition-all duration-300 z-20 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Absolute positioned toggle button (Matches screenshot style) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-7 bg-[#151B28] border border-[#1E293B] text-slate-400 hover:text-cyan-400 p-1 rounded-full flex items-center justify-center transition-colors shadow-lg"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Header / Logo Section */}
      <div className="flex items-center gap-3 px-6 pt-8 pb-6">
        <img
          src={logoUrl}
          className="w-8 h-8 object-contain"
          alt="SecureScan Logo"
        />
        {!collapsed && (
          <h1 className="text-xl font-bold text-[#39B3F7] tracking-wide whitespace-nowrap">
            SecureScan
          </h1>
        )}
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        {!collapsed && (
          <h2 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-4 px-2">
            Main Menu
          </h2>
        )}
        <nav className="space-y-1.5">
          {links.map((link) => {
            const active = location.pathname === link.path;
            const Icon = link.icon;
            
            return (
              <Link
                key={link.name}
                to={link.path}
                title={collapsed ? link.name : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  active
                    ? "bg-cyan-950/30 text-[#39B3F7]" // Subtle dark teal active background
                    : "text-slate-400 hover:bg-[#151B28] hover:text-slate-200"
                }`}
              >
                <Icon 
                  size={20} 
                  className={active ? "text-[#39B3F7]" : "text-slate-500 group-hover:text-slate-300"} 
                />
                {!collapsed && <span className="whitespace-nowrap">{link.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile / Logout Section (from screenshot) */}
      <div className="p-4 border-t border-[#1E293B]">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-all ${collapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-[#1E293B] p-2 rounded-full flex-shrink-0">
              <User size={18} className="text-slate-300" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-200 truncate">
                  {user ? "User Name" : "Organization"}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Management
                </span>
              </div>
            )}
          </div>
          
          {!collapsed && (
            <button className="text-slate-500 hover:text-cyan-400 transition-colors">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
