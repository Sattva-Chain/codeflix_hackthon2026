import React from "react";
import {
  ArrowRight,
  BellRing,
  Boxes,
  BriefcaseBusiness,
  ChevronRight,
  FolderGit2,
  LayoutDashboard,
  Mail,
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users2,
  Workflow,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { userAuth } from "../context/Auth";

const featureCards = [
  {
    icon: ScanSearch,
    title: "Secret scanning that fits dev flow",
    description:
      "Scan repositories, archives, and remediation workspaces for exposed API keys without disrupting your existing security workflow.",
  },
  {
    icon: Users2,
    title: "Role-based organization visibility",
    description:
      "Support solo developers, organization owners, and employees with clean access control and the right repo-level visibility.",
  },
  {
    icon: FolderGit2,
    title: "Developer attribution from Git",
    description:
      "Trace exposed secrets back to file, line, commit metadata, author email, and patch ownership using Git-based enrichment.",
  },
  {
    icon: LayoutDashboard,
    title: "Live dashboard operations",
    description:
      "Track scans, vulnerabilities, fix progress, team activity, and remediation state from one polished control center.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Remediation task orchestration",
    description:
      "Create remediation tasks directly from vulnerability records, assign them to developers, and track the outcome inside SecureScan.",
  },
  {
    icon: ShieldCheck,
    title: "Patch verification and audit trail",
    description:
      "See who fixed an issue, when it was fixed, and how the vulnerability moved from detection to verified remediation.",
  },
];

const integrations = [
  {
    icon: BriefcaseBusiness,
    title: "Asana Task Creation",
    description:
      "Create remediation tasks from vulnerability records and keep them linked to repository, branch, file, line, and severity context.",
  },
  {
    icon: Mail,
    title: "Email Notifications",
    description:
      "Notify developers immediately when issues are assigned, including due date, repository, file path, severity, and task reference.",
  },
  {
    icon: Sparkles,
    title: "Gmail OAuth2 / SMTP",
    description:
      "Use Gmail OAuth2 when configured, or fall back to SMTP for task notifications and invite delivery.",
  },
  {
    icon: Workflow,
    title: "Dashboard Workflows",
    description:
      "Connect scanning, remediation assignment, team visibility, and fix verification into one continuous operational workflow.",
  },
];

const workflowSteps = [
  {
    number: "01",
    title: "Scan and detect issues",
    description:
      "Run SecureScan against repositories or uploaded archives to detect exposed credentials and risky secrets.",
  },
  {
    number: "02",
    title: "Analyze rich vulnerability context",
    description:
      "Review repository, branch, file, line, severity, author metadata, and current remediation state.",
  },
  {
    number: "03",
    title: "Create remediation task",
    description:
      "Open Assign Task, prefill the context automatically, and launch a remediation task with due date and assignee details.",
  },
  {
    number: "04",
    title: "Notify through integrations",
    description:
      "Push tasks into Asana, email the responsible developer, and keep delivery status visible instead of hiding failures.",
  },
  {
    number: "05",
    title: "Track and verify fixes",
    description:
      "Monitor patch progress, verify the fix with follow-up scans, and keep a record of who fixed what and when.",
  },
];

const trustPoints = [
  "Built for security teams, engineering managers, and developers in one workflow",
  "Keeps scans, assignments, and verification inside the same product surface",
  "Supports organization, employee, and personal developer usage without separate tooling",
  "Turns raw secret detection into visible, accountable remediation work",
];

const heroQuickWins = [
  {
    title: "Git-aware attribution",
    description: "Author, email, commit time, and patch ownership stay attached to each finding.",
  },
  {
    title: "Task automation",
    description: "Asana, email delivery, and due dates move with the remediation workflow.",
  },
  {
    title: "Team visibility",
    description: "Owners, employees, and solo developers work from one shared security surface.",
  },
];

const commandRail = [
  ["Task automation", "Asana, due date, and ownership sync"],
  ["Assign Task", "Create remediation work instantly"],
  ["Notify Developer", "Deliver repo-aware email context"],
  ["Track Fix", "Verify remediation inside dashboard"],
];

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-300/75">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base">{subtitle}</p>
    </div>
  );
}

const Home: React.FC = () => {
  const { company, user, token, logout } = userAuth()!;
  const navigate = useNavigate();
  const signedIn = Boolean(company || user || token);

  const openDashboard = () => navigate("/Dashboard2");
  const openSignIn = () => navigate("/signin");

  const handleSignOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#06080d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_70%_20%,rgba(14,165,233,0.12),transparent_22%),linear-gradient(to_bottom,rgba(9,12,19,0.96),rgba(6,8,13,1))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:110px_110px] opacity-40" />
        <div className="absolute left-1/2 top-20 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[140px]" />
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-white/6 bg-[#06080d]/78 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
            <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/20 bg-zinc-900/90 shadow-[0_0_30px_rgba(37,99,235,0.18)]">
                <img
                  src="/Gemini_Generated_Image_3pferw3pferw3pfe-removebg-preview.png"
                  alt="SecureScan"
                  className="h-8 w-8 object-contain"
                />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">SecureScan</p>
                <p className="text-xs text-zinc-500">Detection, remediation, and workflow visibility</p>
              </div>
            </button>

            <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
              <a href="#home" className="transition hover:text-white">Home</a>
              <a href="#features" className="transition hover:text-white">Features</a>
              <a href="#integrations" className="transition hover:text-white">Integrations</a>
              <a href="#demo" className="transition hover:text-white">Demo</a>
              <a href="#contact" className="transition hover:text-white">Contact</a>
            </nav>

            <div className="flex flex-wrap items-center gap-3">
              {!signedIn ? (
                <>
                  <button
                    type="button"
                    onClick={openSignIn}
                    className="rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={openSignIn}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_40px_rgba(37,99,235,0.28)] transition hover:bg-blue-500"
                  >
                    Get Started
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openDashboard}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_40px_rgba(37,99,235,0.28)] transition hover:bg-blue-500"
                  >
                    Go to Dashboard
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <main>
          <section id="home" className="mx-auto max-w-7xl px-5 pb-20 pt-14 sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
            <div className="mx-auto max-w-5xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">
                <Sparkles size={14} />
                Developer-first remediation platform
              </div>

              <h1 className="mt-8 text-4xl font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl xl:text-[5.5rem]">
                Detect exposed secrets.
                <span className="block text-zinc-300">Assign fixes fast.</span>
                <span className="block text-white">
                  Track every{" "}
                  <span className="inline-block rounded-[0.18em] border border-blue-400/35 px-[0.18em] text-blue-300 shadow-[0_0_0_1px_rgba(96,165,250,0.08)]">
                    remediation.
                  </span>
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-3xl text-base leading-8 text-zinc-400 sm:text-xl">
                SecureScan helps engineering teams detect API key exposure, enrich findings with developer attribution,
                launch remediation tasks through Asana, notify owners by email, and verify fixes from one premium dashboard.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={signedIn ? openDashboard : openSignIn}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(37,99,235,0.28)] transition hover:bg-blue-500"
                >
                  {signedIn ? "Go to Dashboard" : "Get Started"}
                  <ArrowRight size={17} />
                </button>
                <a
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                >
                  <PlayCircle size={18} />
                  Watch Demo
                </a>
              </div>

              <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
                {heroQuickWins.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 backdrop-blur-sm text-left">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-xs leading-6 text-zinc-500">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-16">
              <div className="rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,26,0.95),rgba(7,10,17,0.98))] p-3 shadow-[0_30px_120px_rgba(0,0,0,0.42)]">
                <div className="rounded-[1.7rem] border border-white/8 bg-zinc-950/85 p-4">
                  <div className="mx-auto max-w-6xl">
                    <div className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-rose-400/90" />
                        <span className="h-3 w-3 rounded-full bg-amber-300/90" />
                        <span className="h-3 w-3 rounded-full bg-emerald-400/90" />
                      </div>
                      <div className="flex-1 px-4">
                        <div className="mx-auto max-w-3xl rounded-full border border-white/8 bg-zinc-900/90 px-4 py-2 text-center text-xs text-zinc-500">
                          secureScan workflow preview · detection · tasking · notification · verification
                        </div>
                      </div>
                      <div className="hidden text-xs text-zinc-500 md:block">Live product surface</div>
                    </div>

                    <div className="mt-4 rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.74),rgba(9,12,18,0.92))] p-6">
                      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
                        <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-5">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300/75">Workspace preview</p>
                          <h3 className="mt-3 text-2xl font-semibold leading-tight text-white sm:text-3xl">
                            Detect repository leaks. Trigger remediation. Verify fixes.
                          </h3>
                          <p className="mt-4 text-sm leading-7 text-zinc-400">
                            SecureScan turns secret detection into an accountable workflow with author attribution, task assignment,
                            delivery notifications, and visible remediation tracking.
                          </p>

                          <div className="mt-6 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-4">
                              <p className="text-sm font-semibold text-white">Git blame attribution</p>
                              <p className="mt-2 text-xs leading-6 text-zinc-500">Author, email, commit, and patch owner.</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-4">
                              <p className="text-sm font-semibold text-white">Task automation</p>
                              <p className="mt-2 text-xs leading-6 text-zinc-500">Asana, due date, and owner follow-up.</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-4">
                              <p className="text-sm font-semibold text-white">Team visibility</p>
                              <p className="mt-2 text-xs leading-6 text-zinc-500">Owner, employee, and solo access flow.</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[1.4rem] border border-white/8 bg-zinc-950/80 p-5">
                          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Active finding</p>
                                  <p className="mt-2 text-sm font-semibold text-white">Khanaval_ui/src/FIREBASE/getToken.ts</p>
                                </div>
                                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                                  Medium
                                </span>
                              </div>
                              <div className="mt-4 rounded-2xl border border-white/8 bg-zinc-900/80 p-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Code context</p>
                                <div className="mt-3 space-y-2 font-mono text-xs text-zinc-300">
                                  <p>const token = "AIzaSy...";</p>
                                  <p className="text-blue-300">author: kr551344@gmail.com</p>
                                  <p>line: 23 · branch: main</p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-2xl border border-blue-400/15 bg-blue-500/10 p-4">
                                <p className="text-sm font-semibold text-white">Assign in Asana</p>
                                <p className="mt-2 text-xs leading-6 text-zinc-400">Create remediation work directly from the finding with due date and developer context.</p>
                              </div>
                              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="text-sm font-semibold text-white">Notify developer</p>
                                <p className="mt-2 text-xs leading-6 text-zinc-400">Send task email with repo, file, severity, and task link.</p>
                              </div>
                              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="text-sm font-semibold text-white">Track task status</p>
                                <p className="mt-2 text-xs leading-6 text-zinc-400">Watch remediation progress from dashboard to final verification.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="features" className="border-t border-white/6 bg-[#070a11]/80 py-20">
            <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <SectionHeading
                eyebrow="Features"
                title="Security operations built around real remediation work"
                subtitle="SecureScan goes beyond scanning by connecting findings, developer attribution, tasks, notifications, and dashboard visibility into one polished workflow."
              />

              <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {featureCards.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="group rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-blue-400/20 hover:bg-white/[0.05] hover:shadow-[0_20px_70px_rgba(37,99,235,0.12)]"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-500/10 text-blue-300 transition group-hover:border-blue-400/30 group-hover:bg-blue-500/15">
                        <Icon size={22} />
                      </div>
                      <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-zinc-400">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="integrations" className="py-20">
            <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <SectionHeading
                eyebrow="Integrations"
                title="Integrated with the workflows teams already rely on"
                subtitle="Connect remediation work to tasks, email delivery, and team dashboards without forcing users to leave SecureScan after a finding appears."
              />

              <div className="mt-14 grid gap-5 lg:grid-cols-[0.94fr_1.06fr]">
                <div className="rounded-[1.8rem] border border-white/8 bg-[linear-gradient(180deg,rgba(24,24,27,0.94),rgba(7,10,17,0.96))] p-6">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300/75">Integration map</p>
                  <div className="mt-6 space-y-4">
                    {[
                      ["Repository scan", "Detection, blame metadata, and vulnerability persistence"],
                      ["Remediation task", "Asana task creation with repo, branch, file, line, and severity context"],
                      ["Developer alerting", "Email notifications through Gmail OAuth2 or SMTP fallback"],
                      ["Dashboard follow-up", "Track assigned tasks, fix progress, and verification state"],
                    ].map(([title, description]) => (
                      <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-300">
                            <Boxes size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{title}</p>
                            <p className="mt-1 text-xs leading-6 text-zinc-500">{description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {integrations.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm transition hover:border-blue-400/20 hover:shadow-[0_18px_60px_rgba(37,99,235,0.12)]"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80 text-blue-300">
                          <Icon size={20} />
                        </div>
                        <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-zinc-400">{item.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="border-y border-white/6 bg-[#070a11]/80 py-20">
            <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <SectionHeading
                eyebrow="How It Works"
                title="From exposed secret to verified fix in five steps"
                subtitle="SecureScan turns detection into a visible remediation program instead of leaving teams with raw scan output and manual follow-up."
              />

              <div className="mt-14 grid gap-5 lg:grid-cols-5">
                {workflowSteps.map((step) => (
                  <div
                    key={step.number}
                    className="relative overflow-hidden rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5"
                  >
                    <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-blue-500/8 blur-3xl" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300/75">{step.number}</p>
                    <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-zinc-400">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="demo" className="py-20">
            <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <SectionHeading
                eyebrow="Demo Preview"
                title="Show the full product story without leaving the landing page"
                subtitle="Use this section for a YouTube walkthrough, scan preview, vulnerability views, remediation tasks, and dashboard progress snapshots."
              />

              <div className="mt-14 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.9rem] border border-white/8 bg-[linear-gradient(180deg,rgba(24,24,27,0.95),rgba(10,12,18,0.97))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.4)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300/75">Primary demo</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">YouTube walkthrough placeholder</h3>
                    </div>
                    <button
                      type="button"
                      onClick={signedIn ? openDashboard : openSignIn}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:text-white"
                    >
                      Open product
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="mt-5 aspect-video rounded-[1.4rem] border border-dashed border-white/10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_38%),linear-gradient(180deg,rgba(12,16,24,0.95),rgba(9,12,18,1))] flex items-center justify-center">
                    <div className="text-center">
                      <PlayCircle size={58} className="mx-auto text-blue-300" />
                      <p className="mt-4 text-sm font-medium text-white">Demo video placeholder</p>
                      <p className="mt-2 text-xs text-zinc-500">Embed product tour, scan flow, and task workflow here.</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5">
                  <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Product snapshot</p>
                    <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-zinc-950/85 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          ["Open findings", "18"],
                          ["Tasks synced", "11"],
                          ["Fixes verified", "9"],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
                            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Workflow cards</p>
                    <div className="mt-4 space-y-3">
                      {[
                        { icon: Wrench, title: "Patch ownership", text: "See who fixed a vulnerability and when verification succeeded." },
                        { icon: BellRing, title: "Notification state", text: "Track if emails were delivered or if fallback handling was used." },
                        { icon: BriefcaseBusiness, title: "Asana linkage", text: "Open the linked remediation task directly from SecureScan." },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.title} className="flex items-start gap-4 rounded-xl border border-white/8 bg-zinc-950/80 p-4">
                            <div className="rounded-xl border border-blue-400/15 bg-blue-500/10 p-2 text-blue-300">
                              <Icon size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{item.title}</p>
                              <p className="mt-1 text-xs leading-6 text-zinc-500">{item.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-white/6 bg-[#070a11]/80 py-20">
            <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <SectionHeading
                eyebrow="Why SecureScan"
                title="Built for teams that need more than a one-time scan result"
                subtitle="SecureScan gives teams speed, visibility, and accountable remediation instead of leaving security findings disconnected from the people who need to fix them."
              />

              <div className="mt-14 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.03] p-6">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300/75">What makes it stronger</p>
                  <div className="mt-6 space-y-4">
                    {trustPoints.map((point) => (
                      <div key={point} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-zinc-950/70 px-4 py-4">
                        <div className="mt-0.5 rounded-full bg-blue-500/12 p-1.5 text-blue-300">
                          <ShieldCheck size={14} />
                        </div>
                        <p className="text-sm leading-7 text-zinc-300">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {[
                    {
                      title: "Fast operational clarity",
                      text: "Know what was found, who owns it, how severe it is, and what still needs to be fixed without bouncing between tools.",
                    },
                    {
                      title: "Workflow automation",
                      text: "Launch tasks, trigger notifications, and keep remediation state visible from the same dashboard your team already uses.",
                    },
                    {
                      title: "Team-aware visibility",
                      text: "Support solo developers, employees, and owners with scoped views instead of duplicating products across different personas.",
                    },
                    {
                      title: "Verification confidence",
                      text: "Track fixes through patch verification and audit-friendly status instead of assuming a task completion means the issue is truly gone.",
                    },
                  ].map((item) => (
                    <div key={item.title} className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-6">
                      <p className="text-lg font-semibold text-white">{item.title}</p>
                      <p className="mt-3 text-sm leading-7 text-zinc-400">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer id="contact" className="border-t border-white/6 bg-[#05070b]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr_0.85fr_0.85fr] lg:px-8">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/20 bg-zinc-900/90">
                  <img
                    src="/Gemini_Generated_Image_3pferw3pferw3pfe-removebg-preview.png"
                    alt="SecureScan"
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">SecureScan</p>
                  <p className="text-xs text-zinc-500">Detection, remediation, and fix tracking</p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-sm leading-7 text-zinc-500">
                Premium repository security operations for teams that want to detect exposed secrets, assign remediation quickly, and verify fixes without leaving one workflow.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">Quick Links</p>
              <div className="mt-4 space-y-3 text-sm text-zinc-500">
                <a href="#features" className="block transition hover:text-white">Features</a>
                <a href="#integrations" className="block transition hover:text-white">Integrations</a>
                <a href="#demo" className="block transition hover:text-white">Demo</a>
                <a href="#contact" className="block transition hover:text-white">Contact</a>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">Integrations</p>
              <div className="mt-4 space-y-3 text-sm text-zinc-500">
                <p>Asana task workflows</p>
                <p>Gmail OAuth2 notifications</p>
                <p>SMTP fallback delivery</p>
                <p>Dashboard remediation tracking</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">Access</p>
              <div className="mt-4 space-y-3 text-sm text-zinc-500">
                <button type="button" onClick={signedIn ? openDashboard : openSignIn} className="block text-left transition hover:text-white">
                  {signedIn ? "Go to Dashboard" : "Sign In"}
                </button>
                {!signedIn && (
                  <button type="button" onClick={() => navigate("/register")} className="block text-left transition hover:text-white">
                    Register
                  </button>
                )}
                {signedIn && (
                  <button type="button" onClick={handleSignOut} className="block text-left transition hover:text-white">
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Home;
