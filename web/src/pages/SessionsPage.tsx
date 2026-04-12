import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Search,
  Trash2,
  Database,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SessionInfo, SessionMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function timeAgo(ts: number): string {
  const delta = Date.now() / 1000 - ts;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 172800) return "yesterday";
  return `${Math.floor(delta / 86400)}d ago`;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  user: { bg: "bg-blue-500/10", text: "text-blue-400", label: "User" },
  assistant: { bg: "bg-green-500/10", text: "text-green-400", label: "Assistant" },
  system: { bg: "bg-gray-500/10", text: "text-gray-400", label: "System" },
  tool: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Tool" },
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
    <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-amber-400 cursor-pointer hover:bg-amber-500/10 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono font-medium">{toolCall.function.name}</span>
        <span className="text-amber-400/50 ml-auto">{toolCall.id}</span>
      </button>
      {open && (
        <pre className="border-t border-amber-500/20 px-3 py-2 text-xs text-amber-300/80 overflow-x-auto whitespace-pre-wrap font-mono">
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
    <div className={`rounded-lg ${style.bg} p-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${style.text}`}>{label}</span>
        {msg.timestamp && (
          <span className="text-[10px] text-muted-foreground">{timeAgo(msg.timestamp)}</span>
        )}
      </div>
      {msg.content && (
        <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
          {msg.content}
        </pre>
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
}: {
  session: SessionInfo;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [messages, setMessages] = useState<SessionMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {session.title ?? "Untitled"}
              </span>
              {session.is_active && (
                <Badge variant="success" className="text-[10px]">
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {session.model} · {session.message_count} msgs · {timeAgo(session.last_active)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">
            <Database className="mr-1 h-3 w-3" />
            {session.source}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
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

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    api
      .getSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch {
      // ignore
    }
  };

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.title ?? "").toLowerCase().includes(q) ||
      s.model.toLowerCase().includes(q) ||
      s.source.toLowerCase().includes(q) ||
      (s.preview ?? "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Sessions</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {sessions.length}
              </Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">
                {search ? "No sessions match your search" : "No sessions yet"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isExpanded={expandedId === s.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === s.id ? null : s.id))
                  }
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
