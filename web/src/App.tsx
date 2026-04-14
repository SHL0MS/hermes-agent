import { useState, useEffect, useRef } from "react";
import { Activity, BarChart3, Clock, FileText, KeyRound, MessageCircle, MessageSquare, MoreHorizontal, Package, Settings, X } from "lucide-react";
import StatusPage from "@/pages/StatusPage";
import ConfigPage from "@/pages/ConfigPage";
import EnvPage from "@/pages/EnvPage";
import SessionsPage from "@/pages/SessionsPage";
import LogsPage from "@/pages/LogsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import CronPage from "@/pages/CronPage";
import SkillsPage from "@/pages/SkillsPage";
import ChatPage from "@/pages/ChatPage";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n";

const NAV_ITEMS = [
  { id: "status", labelKey: "status" as const, icon: Activity },
  { id: "chat", labelKey: "chat" as const, icon: MessageCircle },
  { id: "sessions", labelKey: "sessions" as const, icon: MessageSquare },
  { id: "analytics", labelKey: "analytics" as const, icon: BarChart3 },
  { id: "logs", labelKey: "logs" as const, icon: FileText },
  { id: "cron", labelKey: "cron" as const, icon: Clock },
  { id: "skills", labelKey: "skills" as const, icon: Package },
  { id: "config", labelKey: "config" as const, icon: Settings },
  { id: "env", labelKey: "keys" as const, icon: KeyRound },
] as const;

type PageId = (typeof NAV_ITEMS)[number]["id"];

// Bottom tab bar on mobile: show these 4 + "More"
const MOBILE_TAB_IDS: PageId[] = ["status", "chat", "sessions", "config"];
const MOBILE_TABS = NAV_ITEMS.filter((n) => MOBILE_TAB_IDS.includes(n.id as PageId));
const MOBILE_MORE = NAV_ITEMS.filter((n) => !MOBILE_TAB_IDS.includes(n.id as PageId));

const PAGE_COMPONENTS: Record<PageId, React.FC> = {
  status: StatusPage,
  chat: ChatPage,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const initialRef = useRef(true);
  const { t } = useI18n();

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    setAnimKey((k) => k + 1);
  }, [page]);

  const navigateTo = (id: PageId) => {
    setPage(id);
    setMoreOpen(false);
  };

  const PageComponent = PAGE_COMPONENTS[page];
  const isMorePage = MOBILE_MORE.some((n) => n.id === page);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-hidden">
      <div className="noise-overlay" />
      <div className="warm-glow" />

      {/* ---- Desktop header (hidden on mobile) ---- */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1400px] items-stretch">
          {/* Brand */}
          <div className="flex items-center border-r border-border px-3 sm:px-5 shrink-0">
            <span className="font-collapse text-lg sm:text-xl font-bold tracking-wider uppercase blend-lighter">
              H<span className="hidden sm:inline">ermes </span>A<span className="hidden sm:inline">gent</span>
            </span>
          </div>

          {/* Desktop nav (hidden below sm) */}
          <nav className="hidden sm:flex items-stretch overflow-x-auto scrollbar-none">
            {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                className={`group relative inline-flex items-center gap-1.5 border-r border-border px-4 py-2 font-display text-[0.8rem] tracking-[0.12em] uppercase whitespace-nowrap transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  page === id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.app.nav[labelKey]}
                <span className="absolute inset-0 bg-foreground pointer-events-none transition-opacity duration-150 group-hover:opacity-5 opacity-0" />
                {page === id && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 px-2 sm:px-4">
            <LanguageSwitcher />
            <span className="hidden sm:inline font-display text-[0.7rem] tracking-[0.15em] uppercase opacity-50">
              {t.app.webUi}
            </span>
          </div>
        </div>
      </header>

      {/* ---- Main content ---- */}
      <main
        key={animKey}
        className="relative z-2 mx-auto w-full max-w-[1400px] flex-1 px-3 sm:px-6 py-4 sm:py-8 pb-20 sm:pb-8"
        style={{ animation: "fade-in 150ms ease-out" }}
      >
        <PageComponent />
      </main>

      {/* ---- Desktop footer (hidden on mobile) ---- */}
      <footer className="relative z-2 border-t border-border hidden sm:block">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <span className="font-display text-[0.8rem] tracking-[0.12em] uppercase opacity-50">
            {t.app.footer.name}
          </span>
          <span className="font-display text-[0.7rem] tracking-[0.15em] uppercase text-foreground/40">
            {t.app.footer.org}
          </span>
        </div>
      </footer>

      {/* ---- Mobile bottom tab bar (visible below sm) ---- */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm sm:hidden safe-bottom">
        <div className="flex items-stretch h-14">
          {MOBILE_TABS.map(({ id, labelKey, icon: Icon }) => {
            const active = page === id && !isMorePage;
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground/60"
                }`}
              >
                {active && <span className="absolute top-0 left-3 right-3 h-[2px] bg-foreground" />}
                <Icon className="h-5 w-5" />
                <span className="text-[0.55rem] font-display tracking-[0.1em] uppercase">
                  {t.app.nav[labelKey]}
                </span>
              </button>
            );
          })}
          {/* More button */}
          <button
            type="button"
            onClick={() => setMoreOpen(!moreOpen)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
              isMorePage || moreOpen ? "text-foreground" : "text-muted-foreground/60"
            }`}
          >
            {(isMorePage || moreOpen) && <span className="absolute top-0 left-3 right-3 h-[2px] bg-foreground" />}
            {moreOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
            <span className="text-[0.55rem] font-display tracking-[0.1em] uppercase">
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ---- Mobile "More" drawer ---- */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 sm:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="absolute bottom-14 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {MOBILE_MORE.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                className={`flex items-center gap-3 w-full px-5 py-3.5 min-h-[48px] cursor-pointer transition-colors border-b border-border/50 ${
                  page === id
                    ? "text-foreground bg-foreground/5"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="font-display text-[0.8rem] tracking-[0.12em] uppercase">
                  {t.app.nav[labelKey]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
