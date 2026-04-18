import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1724] via-[#101828] to-[#0f1724] p-6 text-gray-200">
      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 rounded-2xl p-2">
              <img src="/logo.png" className="w-10 h-10" alt="LeakShield" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">LeakShield</h1>
              <p className="text-sm text-gray-400">{subtitle}</p>
            </div>
          </div>
          <Link to="/" className="text-xs font-semibold text-blue-300 hover:text-blue-200">
            Go to Homepage
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 font-bold">Authentication</p>
            <h2 className="text-3xl font-semibold text-white mt-3">{title}</h2>
            <p className="text-sm text-slate-400 mt-3 leading-6 max-w-xl">
              Keep repository scanning, vulnerability visibility, and team ownership tied to a secure backend identity.
            </p>
            {footer ? <div className="mt-5">{footer}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1120]/80 p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
