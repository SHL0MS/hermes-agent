import React, { useState } from "react";
import { Grid, Cell } from "@/nous/ui/grid";
import {
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  Cpu,
  Database,
  FolderOpen,
  Grid2X2,
  HardDrive,
  MessageCircle,
  MessageSquare,
  Phone,
  Radio,
  Send,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PlatformStatus, SessionInfo, StatusResponse } from "@/lib/api";
import { useAPI } from "@/hooks/useAPI";
import { timeAgo, isoTimeAgo } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLATFORM_STATE_BADGE: Record<string, { variant: "success" | "warning" | "destructive"; label: string }> = {
  connected: { variant: "success", label: "Connected" },
  disconnected: { variant: "warning", label: "Disconnected" },
  fatal: { variant: "destructive", label: "Error" },
};

const GATEWAY_STATE_DISPLAY: Record<string, { badge: "success" | "warning" | "destructive" | "outline"; label: string }> = {
  running: { badge: "success", label: "Running" },
  starting: { badge: "warning", label: "Starting" },
  startup_failed: { badge: "destructive", label: "Failed" },
  stopped: { badge: "outline", label: "Stopped" },
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  discord: MessageCircle,
  telegram: Send,
  slack: MessageSquare,
  whatsapp: Phone,
  matrix: Grid2X2,
};

function gatewayValue(status: StatusResponse): string {
  if (status.gateway_running) return `PID ${status.gateway_pid}`;
  if (status.gateway_state === "startup_failed") return "Start failed";
  return "Not running";
}

function gatewayBadge(status: StatusResponse) {
  const info = status.gateway_state ? GATEWAY_STATE_DISPLAY[status.gateway_state] : null;
  if (info) return info;
  return status.gateway_running
    ? { badge: "success" as const, label: "Running" }
    : { badge: "outline" as const, label: "Off" };
}

export default function StatusPage() {
  const [migrateCopied, setMigrateCopied] = useState(false);
  const { data: status } = useAPI<StatusResponse>(
    "status",
    api.getStatus,
    { pollMs: 5000, staleMs: 3000 },
  );
  const { data: sessionsData } = useAPI<SessionInfo[]>(
    "sessions",
    api.getSessions,
    { pollMs: 5000, staleMs: 3000 },
  );
  const sessions = sessionsData ?? [];

  if (!status) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const configNeedsMigration = status.config_version < status.latest_config_version;
  const gwBadge = gatewayBadge(status);

  const items = [
    {
      icon: Cpu,
      label: "Agent",
      value: `v${status.version}`,
      badgeText: "Live",
      badgeVariant: "success" as const,
    },
    {
      icon: Activity,
      label: "Active Sessions",
      value: status.active_sessions > 0 ? `${status.active_sessions} running` : "None",
      badgeText: status.active_sessions > 0 ? "Live" : "Off",
      badgeVariant: (status.active_sessions > 0 ? "success" : "outline") as "success" | "outline",
    },
    {
      icon: Radio,
      label: "Gateway",
      value: gatewayValue(status),
      badgeText: gwBadge.label,
      badgeVariant: gwBadge.badge,
      title: "Process ID of the running gateway daemon",
    },
    {
      icon: Shield,
      label: "Config Version",
      value: `v${status.config_version}`,
      badgeText: configNeedsMigration ? "Outdated" : "Current",
      badgeVariant: (configNeedsMigration ? "warning" : "success") as "warning" | "success",
      title: "Internal version number. Bump indicates schema changes.",
    },
  ];

  const platforms = Object.entries(status.gateway_platforms ?? {});
  const activeSessions = sessions.filter((s) => s.is_active);
  const recentSessions = sessions.filter((s) => !s.is_active).slice(0, 5);

  // Collect alerts that need attention
  const alerts: { message: string; detail?: string }[] = [];
  if (status.gateway_state === "startup_failed") {
    alerts.push({
      message: "Gateway failed to start",
      detail: status.gateway_exit_reason ?? undefined,
    });
  }
  const failedPlatforms = platforms.filter(([, info]) => info.state === "fatal" || info.state === "disconnected");
  for (const [name, info] of failedPlatforms) {
    alerts.push({
      message: `${name.charAt(0).toUpperCase() + name.slice(1)} ${info.state === "fatal" ? "error" : "disconnected"}`,
      detail: info.error_message ?? undefined,
    });
  }
  // Config migration is advisory, not critical — handled separately below

  return (
    <div className="flex flex-col gap-6">
      {/* Alert banner — breaks grid monotony for critical states */}
      {alerts.length > 0 && (
        <div className="border border-destructive/30 bg-destructive/[0.06] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2 min-w-0">
              {alerts.map((alert, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-destructive">{alert.message}</p>
                  {alert.detail && (
                    <p className="text-xs text-destructive/70 mt-0.5">{alert.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Config migration advisory */}
      {configNeedsMigration && (
        <div className="border border-warning/30 bg-warning/[0.06] p-4">
          <div className="flex items-start gap-3">
            <ArrowUpCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                Config v{status.config_version} is outdated — v{status.latest_config_version} available
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Run the migration command in your terminal to update:
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-xs bg-muted/50 px-2.5 py-1 font-mono-ui text-foreground">
                  hermes config migrate
                </code>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText("hermes config migrate").then(() => {
                      setMigrateCopied(true);
                      setTimeout(() => setMigrateCopied(false), 2000);
                    });
                  }}
                >
                  {migrateCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  {migrateCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Grid className="border-b border-current/20">
        {items.map(({ icon: Icon, label, value, badgeText, badgeVariant, title }) => (
          <Cell key={label} className="flex flex-col gap-2" title={title}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-display">{value}</div>
            <Badge variant={badgeVariant}>
              {badgeVariant === "success" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {badgeText}
            </Badge>
          </Cell>
        ))}
      </Grid>

      {status.gateway_running && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span>PID: <span className="font-mono-ui">{status.gateway_pid}</span></span>
          <span>State: <span className="font-mono-ui">{status.gateway_state}</span></span>
          {status.gateway_updated_at && (
            <span>Updated: {isoTimeAgo(status.gateway_updated_at)}</span>
          )}
        </div>
      )}
      {!status.gateway_running && status.gateway_exit_reason && (
        <div className="text-xs text-destructive/80 px-1">
          Gateway stopped: {status.gateway_exit_reason}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">System Info</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Hermes Home", value: status.hermes_home, icon: FolderOpen },
              { label: "Config Path", value: status.config_path, icon: FolderOpen },
              { label: "Env Path", value: status.env_path, icon: FolderOpen },
              { label: "Release Date", value: status.release_date, icon: Calendar },
              { label: "Total Sessions", value: `${sessions.length} sessions`, icon: Clock },
            ].map(({ label, value, icon: InfoIcon }) => (
              <div key={label} className="flex items-start gap-2">
                <InfoIcon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">{label}</div>
                  <div className="text-xs text-foreground truncate font-mono-ui" title={value}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {platforms.length > 0 && (
        <PlatformsCard platforms={platforms} />
      )}

      {activeSessions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-success" />
              <CardTitle className="text-base">Active Sessions</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3">
            {activeSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between border border-border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.title ?? "Untitled"}</span>

                    <Badge variant="success" className="text-[10px]">
                      <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                      Live
                    </Badge>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono-ui">{s.model ?? "unknown"}</span> · {s.message_count} msgs · {timeAgo(s.last_active)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recentSessions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Recent Sessions</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3">
            {recentSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between border border-border p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-sm">{s.title ?? "Untitled"}</span>

                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono-ui">{s.model ?? "unknown"}</span> · {s.message_count} msgs · {timeAgo(s.last_active)}
                  </span>

                  {s.preview && (
                    <span className="text-xs text-muted-foreground/70 truncate max-w-md">
                      {s.preview}
                    </span>
                  )}
                </div>

                <Badge variant="outline" className="text-[10px]">
                  <Database className="mr-1 h-3 w-3" />
                  {s.source ?? "local"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlatformsCard({ platforms }: PlatformsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Connected Platforms</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        {platforms.map(([name, info]) => {
          const display = PLATFORM_STATE_BADGE[info.state] ?? {
            variant: "outline" as const,
            label: info.state,
          };
          const PlatformIcon = PLATFORM_ICONS[name.toLowerCase()] ?? Radio;
          const StateIcon = info.state === "connected" ? Wifi : info.state === "fatal" ? AlertTriangle : WifiOff;

          return (
            <div
              key={name}
              className="flex items-center justify-between border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted/50 shrink-0">
                  <PlatformIcon className="h-4 w-4 text-foreground" />
                </div>

                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{name}</span>
                    <StateIcon className={`h-3 w-3 ${
                      info.state === "connected"
                        ? "text-success"
                        : info.state === "fatal"
                          ? "text-destructive"
                          : "text-warning"
                    }`} />
                  </div>

                  {info.updated_at && (
                    <span className="text-xs text-muted-foreground">
                      Last update: {isoTimeAgo(info.updated_at)}
                    </span>
                  )}

                  {info.error_code && (
                    <div className="text-[10px] text-destructive/80 mt-1">
                      {info.error_code}: {info.error_message}
                    </div>
                  )}
                </div>
              </div>

              <Badge variant={display.variant}>
                {display.variant === "success" && (
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                )}
                {display.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface PlatformsCardProps {
  platforms: [string, PlatformStatus][];
}
