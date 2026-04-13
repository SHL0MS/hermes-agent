import { useState } from "react";
import {
  BarChart3,
  Coins,
  Cpu,
  Database,
  Grid3X3,
  Hash,
  PieChart,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AnalyticsResponse, AnalyticsDailyEntry, AnalyticsModelEntry } from "@/lib/api";
import { useAPI } from "@/hooks/useAPI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PERIODS = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHART_HEIGHT_PX = 160;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Pick the best cost value: actual > estimated > 0 */
function bestCost(entry: { estimated_cost: number; actual_cost?: number }): number {
  if (entry.actual_cost && entry.actual_cost > 0) return entry.actual_cost;
  return entry.estimated_cost;
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
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium" title={title}>{label}</CardTitle>
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
            <div className="h-2.5 w-2.5 rounded-sm bg-foreground/60" />
            Input
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Output
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[2px]" style={{ height: CHART_HEIGHT_PX }}>
          {daily.map((d) => {
            const total = d.input_tokens + d.output_tokens;
            const inputH = Math.round((d.input_tokens / maxTokens) * CHART_HEIGHT_PX);
            const outputH = Math.round((d.output_tokens / maxTokens) * CHART_HEIGHT_PX);
            const cacheReadPct = d.cache_read_tokens > 0
              ? Math.round((d.cache_read_tokens / (d.input_tokens + d.cache_read_tokens)) * 100)
              : 0;
            return (
              <div
                key={d.day}
                className="flex-1 min-w-0 group relative flex flex-col justify-end"
                style={{ height: CHART_HEIGHT_PX }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-card border border-border px-2.5 py-1.5 text-[10px] text-foreground shadow-lg whitespace-nowrap">
                    <div className="font-medium">{formatDate(d.day)}</div>
                    <div>Input: {formatTokens(d.input_tokens)}</div>
                    <div>Output: {formatTokens(d.output_tokens)}</div>
                    {cacheReadPct > 0 && <div>Cache hit: {cacheReadPct}%</div>}
                    <div>Total: {formatTokens(total)}</div>
                    {bestCost(d) > 0 && <div>Cost: {formatCost(bestCost(d))}</div>}
                  </div>
                </div>
                {/* Input bar */}
                <div
                  className="w-full bg-foreground/50"
                  style={{ height: Math.max(inputH, total > 0 ? 1 : 0) }}
                />
                {/* Output bar */}
                <div
                  className="w-full bg-emerald-500/70"
                  style={{ height: Math.max(outputH, d.output_tokens > 0 ? 1 : 0) }}
                />
              </div>
            );
          })}
        </div>
        {/* X-axis labels */}
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
                <th className="text-right py-2 px-4 font-medium">Input</th>
                <th className="text-right py-2 px-4 font-medium">Output</th>
                <th className="text-right py-2 px-4 font-medium">Cache Hit</th>
                <th className="text-right py-2 pl-4 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const cost = bestCost(d);
                const cacheHitPct = d.cache_read_tokens > 0 && d.input_tokens > 0
                  ? Math.round((d.cache_read_tokens / d.input_tokens) * 100)
                  : 0;
                return (
                  <tr key={d.day} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-2 pr-4 font-medium">{formatDate(d.day)}</td>
                    <td className="text-right py-2 px-4 text-muted-foreground">{d.sessions}</td>
                    <td className="text-right py-2 px-4">
                      <span className="text-foreground">{formatTokens(d.input_tokens)}</span>
                    </td>
                    <td className="text-right py-2 px-4">
                      <span className="text-emerald-500">{formatTokens(d.output_tokens)}</span>
                    </td>
                    <td className="text-right py-2 px-4 text-muted-foreground">
                      {cacheHitPct > 0 ? `${cacheHitPct}%` : "—"}
                    </td>
                    <td className="text-right py-2 pl-4 text-muted-foreground">
                      {cost > 0 ? formatCost(cost) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  if (models.length === 0) return null;

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
                    <span className="font-mono-ui text-xs">{m.model}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">{m.sessions}</td>
                  <td className="text-right py-2 px-4">
                    <span className="text-foreground">{formatTokens(m.input_tokens)}</span>
                    {" / "}
                    <span className="text-emerald-500">{formatTokens(m.output_tokens)}</span>
                  </td>
                  <td className="text-right py-2 pl-4 text-muted-foreground">
                    {m.estimated_cost > 0 ? formatCost(m.estimated_cost) : "—"}
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

function ActivityHeatmap({ daily }: { daily: AnalyticsDailyEntry[] }) {
  if (daily.length === 0) return null;

  const dayMap = new Map(daily.map((d) => [d.day, d]));
  const maxSessions = Math.max(...daily.map((d) => d.sessions), 1);

  // Pad range so it starts on a Sunday and ends on a Saturday (complete weeks)
  const startDate = new Date(daily[0].day + "T00:00:00");
  const endDate = new Date(daily[daily.length - 1].day + "T00:00:00");
  // Roll start back to Sunday
  while (startDate.getDay() !== 0) startDate.setDate(startDate.getDate() - 1);
  // Roll end forward to Saturday
  while (endDate.getDay() !== 6) endDate.setDate(endDate.getDate() + 1);

  // Build weeks (columns) × 7 days (rows)
  type CellData = { day: string; sessions: number; cost: number; inRange: boolean };
  const weeks: CellData[][] = [];
  let currentWeek: CellData[] = [];
  const firstDataDay = daily[0].day;
  const lastDataDay = daily[daily.length - 1].day;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const entry = dayMap.get(iso);
    currentWeek.push({
      day: iso,
      sessions: entry?.sessions ?? 0,
      cost: entry ? bestCost(entry) : 0,
      inRange: iso >= firstDataDay && iso <= lastDataDay,
    });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  function intensity(sessions: number): number {
    if (sessions === 0) return 0;
    const ratio = sessions / maxSessions;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  // Uses CSS custom properties so they adapt to light/dark mode
  const HEATMAP_STYLES: React.CSSProperties[] = [
    { backgroundColor: "var(--heatmap-0)" },
    { backgroundColor: "var(--heatmap-1)" },
    { backgroundColor: "var(--heatmap-2)" },
    { backgroundColor: "var(--heatmap-3)" },
    { backgroundColor: "var(--heatmap-4)" },
  ];

  const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

  // Month labels: show at first week that starts in a new month
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    // Use the first day of the week that's in the data range, or first day
    const refDay = week.find((c) => c.inRange) ?? week[0];
    const m = new Date(refDay.day + "T00:00:00").getMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        col: i,
        label: new Date(refDay.day + "T00:00:00").toLocaleDateString(undefined, { month: "short" }),
      });
      lastMonth = m;
    }
  });

  const CELL = 11;
  const GAP = 4;
  const COL_W = CELL + GAP;
  const LABEL_W = 30;

  // Filter month labels so they don't overlap (~28px per label at 10px font)
  const MIN_PX_SPACING = 30;
  const spacedLabels: typeof monthLabels = [];
  for (const ml of monthLabels) {
    const prev = spacedLabels[spacedLabels.length - 1];
    if (!prev || (ml.col - prev.col) * COL_W >= MIN_PX_SPACING) {
      spacedLabels.push(ml);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Activity</CardTitle>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>Less</span>
            {HEATMAP_STYLES.map((style, i) => (
              <div key={i} className="h-2.5 w-2.5" style={style} />
            ))}
            <span>More</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Month labels row — positioned by column offset */}
          <div className="relative mb-1.5" style={{ height: 14, marginLeft: LABEL_W }}>
            {spacedLabels.map((ml) => (
              <span
                key={ml.col}
                className="absolute text-[10px] text-muted-foreground"
                style={{ left: ml.col * COL_W }}
              >
                {ml.label}
              </span>
            ))}
          </div>

          {/* Grid: day labels + cells */}
          <div className="flex">
            {/* Day-of-week labels */}
            <div className="flex flex-col shrink-0" style={{ width: LABEL_W }}>
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-[10px] text-muted-foreground flex items-center"
                  style={{ height: CELL + GAP }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((cell) => {
                    const level = cell.inRange ? intensity(cell.sessions) : 0;
                    return (
                      <div
                        key={cell.day}
                        className={`transition-colors ${!cell.inRange ? "opacity-30" : ""}`}
                        style={{ width: CELL, height: CELL, ...HEATMAP_STYLES[level] }}
                        title={cell.inRange
                          ? `${formatDate(cell.day)}: ${cell.sessions} session${cell.sessions !== 1 ? "s" : ""}${cell.cost > 0 ? `, ${formatCost(cell.cost)}` : ""}`
                          : formatDate(cell.day)
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelDonut({ models }: { models: AnalyticsModelEntry[] }) {
  if (models.length === 0) return null;

  const totalTokens = models.reduce((s, m) => s + m.input_tokens + m.output_tokens, 0);
  if (totalTokens === 0) return null;

  // Sort by usage, take top 5, group rest as "Other"
  const sorted = [...models].sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens));
  const top = sorted.slice(0, 5);
  const otherTokens = sorted.slice(5).reduce((s, m) => s + m.input_tokens + m.output_tokens, 0);

  const DONUT_COLORS = [
    "#ffe6cb",   // cream (foreground)
    "#4ade80",   // emerald
    "#60a5fa",   // blue
    "#f59e0b",   // amber
    "#a78bfa",   // violet
    "#6b7280",   // gray (other)
  ];

  const segments: { label: string; tokens: number; pct: number; exactPct: number; color: string }[] = top.map((m, i) => {
    const tokens = m.input_tokens + m.output_tokens;
    return {
      label: m.model.split("/").pop() ?? m.model,
      tokens,
      pct: Math.round((tokens / totalTokens) * 100),
      exactPct: (tokens / totalTokens) * 100,
      color: DONUT_COLORS[i],
    };
  });
  if (otherTokens > 0) {
    segments.push({
      label: "Other",
      tokens: otherTokens,
      pct: Math.round((otherTokens / totalTokens) * 100),
      exactPct: (otherTokens / totalTokens) * 100,
      color: DONUT_COLORS[5],
    });
  }

  // Build conic-gradient stops using exact percentages to avoid gaps
  let cumPct = 0;
  const stops = segments.map((s, i) => {
    const start = cumPct;
    // Last segment always extends to 100% to avoid rounding gaps
    cumPct = i === segments.length - 1 ? 100 : cumPct + s.exactPct;
    return `${s.color} ${start}% ${cumPct}%`;
  }).join(", ");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Model Distribution</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          {/* Donut */}
          <div
            className="h-32 w-32 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(${stops})`,
              mask: "radial-gradient(circle at center, transparent 40%, black 41%)",
              WebkitMask: "radial-gradient(circle at center, transparent 40%, black 41%)",
            }}
          />
          {/* Legend */}
          <div className="flex flex-col gap-1.5 min-w-0">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="truncate font-mono-ui text-[0.7rem]">{s.label}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostTrend({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (daily.length < 2) return null;

  const costs = daily.map((d) => bestCost(d));
  const maxCost = Math.max(...costs, 0.01);
  const totalCost = costs.reduce((a, b) => a + b, 0);
  if (totalCost === 0) return null;

  const W = 600;
  const H = 120;
  const PAD_X = 4;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 4;

  const pointCoords = costs.map((c, i) => ({
    x: PAD_X + (i / (costs.length - 1)) * (W - 2 * PAD_X),
    y: H - PAD_BOTTOM - (c / maxCost) * (H - PAD_TOP - PAD_BOTTOM),
  }));

  const linePoints = pointCoords.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = [
    `${PAD_X},${H - PAD_BOTTOM}`,
    ...pointCoords.map((p) => `${p.x},${p.y}`),
    `${W - PAD_X},${H - PAD_BOTTOM}`,
  ].join(" ");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Cost Trend</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            Total: {formatCost(totalCost)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-28"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Area fill */}
          <polygon points={areaPoints} className="fill-emerald-500/15" />
          {/* Line */}
          <polyline
            points={linePoints}
            fill="none"
            className="stroke-emerald-500"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <>
              <line
                x1={pointCoords[hoverIdx].x}
                y1={PAD_TOP}
                x2={pointCoords[hoverIdx].x}
                y2={H - PAD_BOTTOM}
                className="stroke-foreground/20"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="3 3"
              />
              <circle
                cx={pointCoords[hoverIdx].x}
                cy={pointCoords[hoverIdx].y}
                r="4"
                className="fill-emerald-500 stroke-background"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {/* Invisible hit areas for each data point */}
          {pointCoords.map((p, i) => (
            <rect
              key={i}
              x={p.x - (W / costs.length) / 2}
              y={0}
              width={W / costs.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}
        </svg>
        {/* Labels + hover tooltip */}
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>{formatDate(daily[0].day)}</span>
          {hoverIdx !== null ? (
            <span className="text-foreground font-medium">
              {formatDate(daily[hoverIdx].day)}: {formatCost(costs[hoverIdx])}
            </span>
          ) : (
            <span className="text-muted-foreground/40">hover for details</span>
          )}
          <span>{formatDate(daily[daily.length - 1].day)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, error, isLoading: loading } = useAPI<AnalyticsResponse>(
    `analytics-${days}`,
    () => api.getAnalytics(days),
    { staleMs: 60_000 },
  );

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
          {/* Summary cards — matches hermes's token model */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Hash}
              label="Total Tokens"
              value={formatTokens(data.totals.total_input + data.totals.total_output)}
              sub={`${formatTokens(data.totals.total_input)} in / ${formatTokens(data.totals.total_output)} out`}
            />
            <SummaryCard
              icon={Database}
              label="Cache Hit"
              value={data.totals.total_cache_read > 0
                ? `${Math.round((data.totals.total_cache_read / (data.totals.total_input + data.totals.total_cache_read)) * 100)}%`
                : "—"}
              sub={`${formatTokens(data.totals.total_cache_read)} tokens from cache`}
              title="Percentage of input tokens served from prompt cache vs fresh computation"
            />
            <SummaryCard
              icon={Coins}
              label="Total Cost"
              value={formatCost(
                data.totals.total_actual_cost > 0
                  ? data.totals.total_actual_cost
                  : data.totals.total_estimated_cost
              )}
              sub={data.totals.total_actual_cost > 0 ? "actual" : `estimated · last ${days}d`}
            />
            <SummaryCard
              icon={BarChart3}
              label="Total Sessions"
              value={String(data.totals.total_sessions)}
              sub={`~${(data.totals.total_sessions / days).toFixed(1)}/day avg`}
            />
          </div>

          {/* Activity heatmap */}
          <ActivityHeatmap daily={data.daily} />

          {/* Model distribution + Daily token usage side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelDonut models={data.by_model} />
            <TokenBarChart daily={data.daily} />
          </div>

          {/* Cost trend (full width line chart) */}
          <CostTrend daily={data.daily} />

          {/* Tables */}
          <DailyTable daily={data.daily} />
          <ModelTable models={data.by_model} />
        </>
      )}

      {data && data.daily.length === 0 && data.by_model.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <BarChart3 className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">No usage data for this period</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Start a session to see analytics here</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
