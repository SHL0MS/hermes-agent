import { useState, useEffect, useRef } from "react";
import { Activity, BarChart3, Clock, FileText, KeyRound, MessageSquare, Moon, Package, Settings, Sun } from "lucide-react";
import { HoverBg, Small, applyLens, LENS_DARK, LENS_LIGHT } from "@/nous";
import StatusPage from "@/pages/StatusPage";
import ConfigPage from "@/pages/ConfigPage";
import EnvPage from "@/pages/EnvPage";
import SessionsPage from "@/pages/SessionsPage";
import LogsPage from "@/pages/LogsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import CronPage from "@/pages/CronPage";
import SkillsPage from "@/pages/SkillsPage";

const NAV_ITEMS = [
  { id: "status", label: "Status", icon: Activity },
  { id: "sessions", label: "Sessions", icon: MessageSquare },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "cron", label: "Cron", icon: Clock },
  { id: "skills", label: "Skills", icon: Package },
  { id: "config", label: "Config", icon: Settings },
  { id: "env", label: "Keys", icon: KeyRound },
] as const;

type PageId = (typeof NAV_ITEMS)[number]["id"];

const PAGE_COMPONENTS: Record<PageId, React.FC> = {
  status: StatusPage,
  sessions: SessionsPage,
  analytics: AnalyticsPage,
  logs: LogsPage,
  cron: CronPage,
  skills: SkillsPage,
  config: ConfigPage,
  env: EnvPage,
};

export default function App() {
  const [page, setPage] = useState<PageId>("status");
  const mainRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("hermes-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    // Apply Lens preset + CSS class for Tailwind overrides
    applyLens(theme === "dark" ? LENS_DARK : LENS_LIGHT);
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("hermes-theme", theme);
  }, [theme]);

  // Subtle fade on page change without remounting (no key change)
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(3px)";
    void el.offsetHeight;
    el.style.transition = "opacity 120ms ease-out, transform 120ms ease-out";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  }, [page]);

  const PageComponent = PAGE_COMPONENTS[page];

  const isDemo = typeof window !== "undefined" && (
    location.hostname.includes("github.io") ||
    new URLSearchParams(location.search).has("demo")
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Global grain + warm glow (CSS approximation of design-language overlays) */}
      <div className="noise-overlay" />
      <div className="warm-glow" />

      {/* Demo banner */}
      {isDemo && (
        <div className="relative z-50 bg-warning/90 text-background text-center py-1 font-compressed text-xs tracking-[0.2em] uppercase">
          Dummy page for testing purposes only
        </div>
      )}

      {/* ---- Header: flex layout with design-language styling ---- */}
      <header className="sticky top-0 z-40 border-b border-current/20 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1400px] items-stretch border-l border-current/20">
          {/* Brand */}
          <div className="flex items-center border-r border-current/20 px-5 shrink-0">
            <span className="font-collapse text-xl font-bold tracking-wider uppercase blend-lighter">
              Hermes<br className="hidden sm:inline" /><span className="sm:hidden"> </span>Agent
            </span>
          </div>

          {/* Nav items */}
          <nav className="flex items-stretch overflow-x-auto scrollbar-none">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`group relative inline-flex items-center border-r border-current/20 px-4 py-2 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  page === id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Small className="flex items-center gap-1.5 whitespace-nowrap">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Small>
                <HoverBg />
                {page === id && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </nav>

          {/* Theme toggle + label */}
          <div className="ml-auto flex items-center gap-2 border-r border-current/20 px-4">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Small className="opacity-50">Web UI</Small>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className="relative z-2 mx-auto w-full max-w-[1400px] flex-1 px-6 py-8"
      >
        <PageComponent />
      </main>

      {/* ---- Footer ---- */}
      <footer className="relative z-2 border-t border-current/20">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <Small className="opacity-50">Hermes Agent</Small>
          <Small className="text-foreground/40">Nous Research</Small>
        </div>
      </footer>
    </div>
  );
}
