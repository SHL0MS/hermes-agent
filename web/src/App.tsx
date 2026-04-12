import { useState, useRef, useEffect } from "react";
import { Activity, BarChart3, Clock, FileText, KeyRound, MessageSquare, Package, Settings } from "lucide-react";
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
  { id: "env", label: "API Keys", icon: KeyRound },
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
  const [animKey, setAnimKey] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Trigger fade-in animation on page change
    setAnimKey((k) => k + 1);
  }, [page]);

  const PageComponent = PAGE_COMPONENTS[page];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <span className="text-lg font-bold tracking-tight shrink-0">Hermes Agent</span>

          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  page === id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main
        ref={mainRef}
        key={animKey}
        className="mx-auto w-full max-w-5xl flex-1 px-6 py-8"
        style={{ animation: "fade-in 150ms ease-out" }}
      >
        <PageComponent />
      </main>
    </div>
  );
}
