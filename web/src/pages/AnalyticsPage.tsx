import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  Coins,
  Cpu,
  Hash,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AnalyticsResponse, AnalyticsDailyEntry, AnalyticsModelEntry } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatDate(day: string): string {
  try {
    const d = new Date(day + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return day;
  }
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  if (daily.length === 0) return null;

  const maxTokens = Math.max(...daily.map((d) => d.input_tokens + d.output_tokens), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Daily Token Usage</CardTitle>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            Input
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-green-500" />
            Output
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-40">
          {daily.map((d) => {
            const inputPct = (d.input_tokens / maxTokens) * 100;
            const outputPct = (d.output_tokens / maxTokens) * 100;
            const totalTokens = d.input_tokens + d.output_tokens;
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-stretch justify-end gap-0 min-w-0 group relative"
              >
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="rounded-md bg-popover border border-border px-2 py-1 text-[10px] text-foreground shadow-md whitespace-nowrap">
                    <div className="font-medium">{formatDate(d.day)}</div>
                    <div>In: {formatTokens(d.input_tokens)}</div>
                    <div>Out: {formatTokens(d.output_tokens)}</div>
                    <div>Total: {formatTokens(totalTokens)}</div>
                  </div>
                </div>
                <div
                  className="bg-blue-500/80 rounded-t-sm min-h-0 transition-all"
                  style={{ height: `${inputPct}%` }}
                />
                <div
                  className="bg-green-500/80 rounded-b-sm min-h-0 transition-all"
                  style={{ height: `${outputPct}%` }}
                />
              </div>
            );
          })}
        </div>
        {/* X-axis labels — show first, middle, last */}
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{daily.length > 0 ? formatDate(daily[0].day) : ""}</span>
          {daily.length > 2 && (
            <span>{formatDate(daily[Math.floor(daily.length / 2)].day)}</span>
          )}
          <span>{daily.length > 1 ? formatDate(daily[daily.length - 1].day) : ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  if (daily.length === 0) return null;

  // Show most recent first
  const sorted = [...daily].reverse();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4 font-medium">Date</th>
                <th className="text-right py-2 px-4 font-medium">Sessions</th>
                <th className="text-right py-2 px-4 font-medium">Input Tokens</th>
                <th className="text-right py-2 px-4 font-medium">Output Tokens</th>
                <th className="text-right py-2 pl-4 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.day} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="py-2 pr-4 font-medium">{formatDate(d.day)}</td>
                  <td className="text-right py-2 px-4 text-muted-foreground">{d.sessions}</td>
                  <td className="text-right py-2 px-4">
                    <span className="text-blue-400">{formatTokens(d.input_tokens)}</span>
                  </td>
                  <td className="text-right py-2 px-4">
                    <span className="text-green-400">{formatTokens(d.output_tokens)}</span>
                  </td>
                  <td className="text-right py-2 pl-4 text-muted-foreground">
                    {d.estimated_cost != null ? formatCost(d.estimated_cost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  if (models.length === 0) return null;

  // Sort by total tokens desc
  const sorted = [...models].sort(
    (a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Per-Model Breakdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4 font-medium">Model</th>
                <th className="text-right py-2 px-4 font-medium">Sessions</th>
                <th className="text-right py-2 px-4 font-medium">Tokens</th>
                <th className="text-right py-2 pl-4 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.model} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs">{m.model}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">{m.sessions}</td>
                  <td className="text-right py-2 px-4">
                    <span className="text-blue-400">{formatTokens(m.input_tokens)}</span>
                    {" / "}
                    <span className="text-green-400">{formatTokens(m.output_tokens)}</span>
                  </td>
                  <td className="text-right py-2 pl-4 text-muted-foreground">
                    {m.estimated_cost != null ? formatCost(m.estimated_cost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalytics(days)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        {PERIODS.map((p) => (
          <Button
            key={p.label}
            variant={days === p.days ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              icon={Hash}
              label="Total Tokens"
              value={formatTokens(data.totals.total_input + data.totals.total_output)}
              sub={`${formatTokens(data.totals.total_input)} in / ${formatTokens(data.totals.total_output)} out`}
            />
            <SummaryCard
              icon={Coins}
              label="Total Cost"
              value={formatCost(data.totals.total_estimated_cost)}
              sub={`Last ${days} days`}
            />
            <SummaryCard
              icon={BarChart3}
              label="Total Sessions"
              value={String(data.totals.total_sessions)}
              sub={`~${(data.totals.total_sessions / days).toFixed(1)}/day avg`}
            />
          </div>

          {/* Bar chart */}
          <TokenBarChart daily={data.daily} />

          {/* Tables */}
          <DailyTable daily={data.daily} />
          <ModelTable models={data.by_model} />
        </>
      )}

      {data && data.daily.length === 0 && data.by_model.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No usage data for this period</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
