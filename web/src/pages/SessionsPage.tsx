import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageSquare,
  Search,
  Trash2,
  Clock,
  Terminal,
  Globe,
  MessageCircle,
  Hash,
  FileSearch,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SessionInfo, SessionMessage } from "@/lib/api";
import { useAPI, mutateCache } from "@/hooks/useAPI";
import { timeAgo } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  user: { bg: "bg-primary/10", text: "text-primary", label: "User" },
  assistant: { bg: "bg-success/10", text: "text-success", label: "Assistant" },
  system: { bg: "bg-muted", text: "text-muted-foreground", label: "System" },
  tool: { bg: "bg-warning/10", text: "text-warning", label: "Tool" },
};

const SOURCE_CONFIG: Record<string, { icon: typeof Terminal; color: string }> = {
  cli: { icon: Terminal, color: "text-primary" },
  telegram: { icon: MessageCircle, color: "text-[oklch(0.65_0.15_250)]" },
  discord: { icon: Hash, color: "text-[oklch(0.65_0.15_280)]" },
  slack: { icon: MessageSquare, color: "text-[oklch(0.7_0.15_155)]" },
  whatsapp: { icon: Globe, color: "text-success" },
  cron: { icon: Clock, color: "text-warning" },
};

function ToolCallBlock({ toolCall }: { toolCall: { id: string; function: { name: string; arguments: string } } }) {
  const [open, setOpen] = useState(false);

  let args = toolCall.function.arguments;
  try {
    args = JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    // keep as-is
  }

  return (
    <div className="mt-2 rounded-md border border-warning/20 bg-warning/5">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-warning cursor-pointer hover:bg-warning/10 transition-colors"
        onClick={() => setOpen(!open)}
        aria-label={`${open ? "Collapse" : "Expand"} tool call ${toolCall.function.name}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono-ui font-medium">{toolCall.function.name}</span>
        <span className="text-warning/50 ml-auto">{toolCall.id}</span>
      </button>
      {open && (
        <pre className="border-t border-warning/20 px-3 py-2 text-xs text-warning/80 overflow-x-auto whitespace-pre-wrap font-mono">
          {args}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: SessionMessage }) {
  const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.system;
  const label = msg.tool_name ? `Tool: ${msg.tool_name}` : style.label;

  return (
    <div className={`${style.bg} p-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${style.text}`}>{label}</span>
        {msg.timestamp && (
          <span className="text-[10px] text-muted-foreground">{timeAgo(msg.timestamp)}</span>
        )}
      </div>
      {msg.content && (
        msg.role === "system"
          ? <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</div>
          : <Markdown content={msg.content} />
      )}
      {msg.tool_calls && msg.tool_calls.length > 0 && (
        <div className="mt-1">
          {msg.tool_calls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  isExpanded,
  onToggle,
  onDelete,
  isContentMatch,
}: {
  session: SessionInfo;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isContentMatch?: boolean;
}) {
  const [messages, setMessages] = useState<SessionMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isExpanded && messages === null && !loading) {
      setLoading(true);
      api
        .getSessionMessages(session.id)
        .then((resp) => setMessages(resp.messages))
        .catch((err) => setError(String(err)))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, session.id, messages, loading]);

  const sourceInfo = (session.source ? SOURCE_CONFIG[session.source] : null) ?? { icon: Globe, color: "text-muted-foreground" };
  const SourceIcon = sourceInfo.icon;
  const hasTitle = session.title && session.title !== "Untitled";

  return (
    <div className={`border overflow-hidden transition-colors ${
      session.is_active
        ? "border-success/30 bg-success/[0.03]"
        : "border-border"
    }`}>
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`shrink-0 ${sourceInfo.color}`}>
            <SourceIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm truncate pr-2 ${hasTitle ? "font-medium" : "text-muted-foreground italic"}`}>
                {hasTitle ? session.title : (session.preview ? session.preview.slice(0, 60) : "Untitled session")}
              </span>
              {session.is_active && (
                <Badge variant="success" className="text-[10px] shrink-0">
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </Badge>
              )}
              {isContentMatch && (
                <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
                  <FileSearch className="h-2.5 w-2.5" />
                  content match
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate max-w-[180px]">{(session.model ?? "unknown").split("/").pop()}</span>
              <span className="text-border">&#183;</span>
              <span>{session.message_count} msgs</span>
              {session.tool_call_count > 0 && (
                <>
                  <span className="text-border">&#183;</span>
                  <span>{session.tool_call_count} tools</span>
                </>
              )}
              <span className="text-border">&#183;</span>
              <span>{timeAgo(session.last_active)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">
            {session.source ?? "local"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 text-[0.6rem] gap-1 transition-all ${
              copied
                ? "text-success hover:text-success"
                : "text-muted-foreground"
            }`}
            aria-label={copied ? "Command copied" : "Copy resume command"}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(`hermes resume ${session.id}`).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              });
            }}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span className="hidden sm:inline">Copied — paste into terminal</span>
                <span className="sm:hidden">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span className="hidden sm:inline">Open in CLI</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="Delete session"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-background/50 p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive py-4 text-center">{error}</p>
          )}
          {messages && messages.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No messages</p>
          )}
          {messages && messages.length > 0 && (
            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-2">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Module-level message content cache (survives re-renders, shared across mounts)
const messageCache = new Map<string, string>(); // session id → concatenated content

export default function SessionsPage() {
  const { data: sessionsData, isLoading: loading } = useAPI<SessionInfo[]>("sessions", api.getSessions);
  const [localSessions, setLocalSessions] = useState<SessionInfo[] | null>(null);
  const sessions = localSessions ?? sessionsData ?? [];
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "longest" | "shortest">("newest");

  // Deep search state
  const [contentMatches, setContentMatches] = useState<Set<string>>(new Set());
  const [deepSearchProgress, setDeepSearchProgress] = useState<{ done: number; total: number } | null>(null);
  const deepSearchAbort = useRef<AbortController | null>(null);

  // Sync local state when cache updates
  useEffect(() => {
    if (sessionsData && !localSessions) setLocalSessions(null);
  }, [sessionsData]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSession(id);
      const updater = (prev: SessionInfo[] | null) => (prev ?? []).filter((s) => s.id !== id);
      mutateCache<SessionInfo[]>("sessions", updater);
      setLocalSessions(updater(sessions));
      if (expandedId === id) setExpandedId(null);
    } catch {
      // ignore
    }
  };

  // Fast metadata filter
  const metadataMatch = useCallback((s: SessionInfo, q: string): boolean => {
    return (
      (s.title ?? "").toLowerCase().includes(q) ||
      (s.model ?? "").toLowerCase().includes(q) ||
      (s.source ?? "").toLowerCase().includes(q) ||
      (s.preview ?? "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, []);

  // Deep search: progressively fetch message content for sessions not in metadata matches
  const runDeepSearch = useCallback(async (query: string, sessionList: SessionInfo[]) => {
    if (!query) return;
    const q = query.toLowerCase();

    // Abort any in-flight deep search
    deepSearchAbort.current?.abort();
    const controller = new AbortController();
    deepSearchAbort.current = controller;

    // Sessions that don't match metadata — candidates for content search
    const candidates = sessionList.filter((s) => !metadataMatch(s, q));
    if (candidates.length === 0) {
      setDeepSearchProgress(null);
      return;
    }

    setDeepSearchProgress({ done: 0, total: candidates.length });
    const matches = new Set<string>();

    // Process in batches of 4
    const BATCH = 4;
    for (let i = 0; i < candidates.length; i += BATCH) {
      if (controller.signal.aborted) return;

      const batch = candidates.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (s) => {
          try {
            // Check cache first
            let text = messageCache.get(s.id);
            if (text === undefined) {
              const resp = await api.getSessionMessages(s.id);
              text = resp.messages
                .map((m) => [m.content, m.tool_name, m.tool_calls?.map((tc) => tc.function.name + " " + tc.function.arguments).join(" ")].filter(Boolean).join(" "))
                .join(" ")
                .toLowerCase();
              messageCache.set(s.id, text);
            }
            if (text.includes(q)) {
              matches.add(s.id);
            }
          } catch {
            // Skip failed fetches
          }
        }),
      );

      if (controller.signal.aborted) return;
      setContentMatches(new Set(matches));
      setDeepSearchProgress({ done: Math.min(i + BATCH, candidates.length), total: candidates.length });
    }

    setDeepSearchProgress(null);
  }, [metadataMatch]);

  // Trigger deep search with debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setContentMatches(new Set());
    setDeepSearchProgress(null);

    if (!search.trim()) {
      deepSearchAbort.current?.abort();
      return;
    }

    searchTimer.current = setTimeout(() => {
      runDeepSearch(search.trim(), sessions);
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, sessions, runDeepSearch]);

  // Combined filter: metadata matches + content matches
  const filtered = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) => metadataMatch(s, q) || contentMatches.has(s.id),
    );
  }, [sessions, search, metadataMatch, contentMatches]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    // Content-only matches sort after metadata matches when searching
    if (search) {
      const q = search.toLowerCase();
      const aMeta = metadataMatch(a, q);
      const bMeta = metadataMatch(b, q);
      if (aMeta && !bMeta) return -1;
      if (!aMeta && bMeta) return 1;
    }
    switch (sortBy) {
      case "newest": return b.last_active - a.last_active;
      case "oldest": return a.last_active - b.last_active;
      case "longest": return b.message_count - a.message_count;
      case "shortest": return a.message_count - b.message_count;
    }
  }), [filtered, sortBy, search, metadataMatch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header outside card for lighter feel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Sessions</h1>
          <Badge variant="secondary" className="text-xs">
            {sessions.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Sort:</span>
          <Select
            className="h-8 text-xs w-32"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="longest">Most messages</option>
            <option value="shortest">Fewest messages</option>
          </Select>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search titles, models, content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
            {deepSearchProgress && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {deepSearchProgress.done}/{deepSearchProgress.total}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search status bar */}
      {search && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          {contentMatches.size > 0 && (
            <span className="flex items-center gap-1">
              <FileSearch className="h-3 w-3" />
              {contentMatches.size} content match{contentMatches.size !== 1 ? "es" : ""}
            </span>
          )}
          {deepSearchProgress && (
            <span>Searching message content...</span>
          )}
          {!deepSearchProgress && search && sorted.length > 0 && (
            <span>{sorted.length} result{sorted.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          {deepSearchProgress ? (
            <>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
              <p className="text-sm font-medium">Searching message content...</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                {deepSearchProgress.done} of {deepSearchProgress.total} sessions checked
              </p>
            </>
          ) : (
            <>
              <Clock className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {search ? "No sessions match your search" : "No sessions yet"}
              </p>
              {search && (
                <p className="text-xs mt-1 text-muted-foreground/60">Searched titles, models, and message content</p>
              )}
              {!search && (
                <p className="text-xs mt-1 text-muted-foreground/60">Start a conversation to see it here</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sorted.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              isExpanded={expandedId === s.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === s.id ? null : s.id))
              }
              onDelete={() => handleDelete(s.id)}
              isContentMatch={search ? contentMatches.has(s.id) && !metadataMatch(s, search.toLowerCase()) : false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
