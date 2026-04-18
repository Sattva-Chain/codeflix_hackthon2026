import React from "react";
import { Home } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";

function MainDashBoardLayout() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#050814] text-slate-200 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 left-1/4 h-[420px] w-[420px] rounded-full bg-blue-500/18 blur-[130px]" />
        <div className="absolute top-1/4 -right-20 h-[380px] w-[380px] rounded-full bg-purple-500/14 blur-[130px]" />
        <div className="absolute -bottom-24 left-10 h-[320px] w-[320px] rounded-full bg-indigo-500/12 blur-[130px]" />
      </div>

      <Sidebar />

      <div className="relative z-10 flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-slate-950/45 border-l border-blue-400/15 backdrop-blur-sm">
        <div className="sticky top-0 z-30 border-b border-blue-400/20 bg-slate-950/75 backdrop-blur px-6 md:px-10 py-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-300/30 bg-blue-500/15 px-4 py-2 text-xs md:text-sm font-semibold text-blue-100 hover:bg-blue-500/25 hover:text-white transition-colors"
          >
            <Home className="w-4 h-4" />
            Go to Homepage
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar max-w-[1600px] mx-auto w-full">
          
          {/* We let the Outlet take the full available width so the Scan terminal 
              and cards can match the wide layout in the images. */}
          <div className="w-full h-full flex flex-col">
            <Outlet />
          </div>
          
        </main>
        
      </div>
    </div>
  );
}

export default MainDashBoardLayout;