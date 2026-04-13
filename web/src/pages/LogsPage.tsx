import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { LogsResponse } from "@/lib/api";
import { useAPI } from "@/hooks/useAPI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const FILES = ["agent", "errors", "gateway"] as const;
const LEVELS = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR"] as const;
const COMPONENTS = ["all", "gateway", "agent", "tools", "cli", "cron"] as const;
const LINE_COUNTS = [50, 100, 200, 500] as const;

function classifyLine(line: string): "error" | "warning" | "info" | "debug" {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("CRITICAL") || upper.includes("FATAL")) return "error";
  if (upper.includes("WARNING") || upper.includes("WARN")) return "warning";
  if (upper.includes("DEBUG")) return "debug";
  return "info";
}

const LINE_COLORS: Record<string, string> = {
  error: "text-destructive",
  warning: "text-warning",
  info: "text-foreground",
  debug: "text-muted-foreground/60",
};

function FilterBar<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium w-20 shrink-0">{label}</span>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <Button
            key={opt}
            variant={value === opt ? "default" : "outline"}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={() => onChange(opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function LogsPage() {
  const [file, setFile] = useState<(typeof FILES)[number]>("agent");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("ALL");
  const [component, setComponent] = useState<(typeof COMPONENTS)[number]>("all");
  const [lineCount, setLineCount] = useState<(typeof LINE_COUNTS)[number]>(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cacheKey = `logs-${file}-${lineCount}-${level}-${component}`;
  const { data: logsData, error, isLoading: loading, refresh } = useAPI<LogsResponse>(
    cacheKey,
    () => api.getLogs({ file, lines: lineCount, level, component }),
    { pollMs: autoRefresh ? 5000 : undefined },
  );
  const lines = logsData?.lines ?? [];

  // Auto-scroll when new data arrives
  useEffect(() => {
    if (logsData && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    }
  }, [logsData]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Logs</CardTitle>
              {loading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <Label className="text-xs">Auto-refresh</Label>
                {autoRefresh && (
                  <Badge variant="success" className="text-[10px]">
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    Live
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" className="text-xs h-7"
                onClick={() => {
                  navigator.clipboard.writeText(lines.join("\n")).then(() => {
                    setLogsCopied(true);
                    setTimeout(() => setLogsCopied(false), 2000);
                  });
                }}>
                {logsCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {logsCopied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={refresh} className="text-xs h-7">
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-3 mb-4">
            <FilterBar label="File" options={FILES} value={file} onChange={setFile} />
            <FilterBar label="Level" options={LEVELS} value={level} onChange={setLevel} />
            <FilterBar label="Component" options={COMPONENTS} value={component} onChange={setComponent} />
            <FilterBar
              label="Lines"
              options={LINE_COUNTS.map(String) as unknown as readonly string[]}
              value={String(lineCount)}
              onChange={(v) => setLineCount(Number(v) as (typeof LINE_COUNTS)[number])}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div
            ref={scrollRef}
            className="border border-border bg-background p-4 font-mono-ui text-xs leading-5 overflow-auto max-h-[600px] min-h-[200px]"
          >
            {lines.length === 0 && !loading && (
              <p className="text-muted-foreground text-center py-8">No log lines found</p>
            )}
            {lines.map((line, i) => {
              const cls = classifyLine(line);
              return (
                <div key={i} className={`${LINE_COLORS[cls]} hover:bg-secondary/20 px-1 -mx-1 flex gap-0`}>
                  <span className="inline-block w-10 shrink-0 text-right pr-3 select-none text-muted-foreground/30 tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0">{line}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
