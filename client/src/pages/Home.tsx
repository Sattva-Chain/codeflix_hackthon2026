import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Zap,
  Users,
  GitBranch,
  ScanSearch,
  ScrollText,
} from "lucide-react";
import { AuroraBackground } from "@/components/ui/animated-background";

const Home: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: "Continuous Secret Detection",
      description:
        "Scan repositories and archives for API keys, credentials, and high-risk leak patterns in real-time.",
      icon: ScanSearch,
    },
    {
      title: "Automated Remediation",
      description:
        "Generate patch suggestions, apply fixes, and verify that vulnerabilities are removed before shipping.",
      icon: GitBranch,
    },
    {
      title: "Team Assignment Workflow",
      description:
        "Track ownership with commit metadata and assign remediation tasks directly to contributors.",
      icon: Users,
    },
    {
      title: "Audit-Ready Reporting",
      description:
        "Keep a complete remediation trail with branch context, scan timelines, and compliance-friendly summaries.",
      icon: ScrollText,
    },
  ];

  return (
    <div className="bg-black text-white">
      <AuroraBackground>
        <header className="w-full px-6 md:px-12 py-6 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/auth/login")}
              className="px-4 py-2 text-sm rounded-full border border-white/25 bg-white/10 hover:bg-white/20 transition"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="px-4 py-2 text-sm rounded-full bg-blue-500/90 hover:bg-blue-500 transition"
            >
              Get Started
            </button>
          </div>
        </header>

        <section className="min-h-[78vh] px-6 md:px-12 flex flex-col items-center justify-center text-center">
          <p className="font-['Space_Grotesk'] text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-none font-bold tracking-[0.12em] uppercase text-transparent bg-clip-text bg-gradient-to-b from-white via-blue-100 to-slate-300 drop-shadow-[0_0_28px_rgba(96,165,250,0.45)] mb-5">
            SecureScan
          </p>
          <div className="inline-flex items-center gap-2 mb-5 rounded-full border border-white/25 bg-black/35 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-200">
            <Zap className="h-3.5 w-3.5 text-blue-300" />
            AI-powered repository defense
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-[1.08] max-w-5xl">
            Stop Secret Leaks Before They Become Breaches
          </h1>
          <p className="mt-5 max-w-2xl text-slate-200/90 text-sm md:text-base leading-relaxed">
            SecureScan helps engineering teams detect, assign, and remediate credential leaks with speed.
            Scan faster, patch smarter, and ship secure code with confidence.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => navigate("/auth/login")}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-white text-black font-semibold hover:bg-slate-100 transition"
            >
              Start Scanning
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-white/35 bg-white/10 text-white font-semibold hover:bg-white/20 transition"
            >
              Explore Features
            </button>
          </div>
        </section>
      </AuroraBackground>

      <section id="features" className="relative py-20 md:py-28 px-6 md:px-12 bg-gradient-to-b from-black to-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-xs uppercase tracking-[0.22em] text-blue-300">Core Capabilities</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-bold">Everything Your Security Workflow Needs</h2>
            <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
              Move from detection to remediation in one place with visibility for developers, managers, and security teams.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 md:p-7 hover:bg-white/[0.08] transition"
              >
                <div className="h-11 w-11 rounded-lg bg-blue-500/20 border border-blue-300/20 flex items-center justify-center mb-5">
                  <feature.icon className="h-5 w-5 text-blue-300" />
                </div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-slate-300 leading-relaxed">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 md:px-12 bg-zinc-950 border-t border-white/10">
        <div className="max-w-6xl mx-auto text-center">
          <h3 className="text-2xl md:text-4xl font-bold">Secure code is a release requirement</h3>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            Bring secret detection, patching, and verification into one continuous engineering flow.
          </p>
          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="mt-8 px-8 py-3 rounded-full bg-blue-500 hover:bg-blue-400 text-white font-semibold transition"
          >
            Open SecureScan
          </button>
        </div>
      </section>
    </div>
  );
};

export default Home;
