import { useState, useEffect, useCallback } from "react";
import { api, type PairedDevice } from "@/lib/api";
import { Smartphone, Plus, Trash2, Copy, Check, Loader2 } from "lucide-react";

/**
 * DeviceManager — generate pairing codes and manage paired devices.
 * Shows inline wherever it's rendered (Status page, Config page, etc.)
 */
export function DeviceManager() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiry, setPairingExpiry] = useState(0);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const loadDevices = useCallback(() => {
    api.listDevices()
      .then((resp) => setDevices(resp.devices))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Countdown timer for pairing code expiry
  useEffect(() => {
    if (!pairingCode || pairingExpiry <= 0) return;
    setCountdown(pairingExpiry);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setPairingCode(null);
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingCode, pairingExpiry]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const resp = await api.beginPairing();
      setPairingCode(resp.code);
      setPairingExpiry(resp.expires_in);
      setLanUrls(resp.lan_urls ?? []);
    } catch (err) {
      // Rate limited or error
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const revokeDevice = async (id: string) => {
    setRevoking(id);
    try {
      await api.revokeDevice(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    } finally {
      setRevoking(null);
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    const d = new Date(ts * 1000);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Generate pairing code */}
      <div className="border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pair New Device</span>
          </div>
          {!pairingCode && (
            <button
              type="button"
              onClick={generateCode}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background font-display tracking-[0.1em] uppercase cursor-pointer disabled:opacity-40"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Generate Code
            </button>
          )}
        </div>

        {pairingCode && (
          <div className="space-y-3">
            {/* Step 1: URL */}
            {lanUrls.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Step 1:</span> Open this URL on your phone:
                </p>
                {lanUrls.map((url) => (
                  <div key={url} className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-muted/30 px-3 py-1.5 border border-border flex-1 min-w-0 truncate">
                      {url}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyUrl(url)}
                      className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    >
                      {copiedUrl ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Step 2: Code */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{lanUrls.length > 0 ? "Step 2:" : ""}</span> Enter this pairing code:
              </p>
              <div className="flex items-center gap-3">
                <code className="text-2xl font-mono tracking-[0.4em] font-bold bg-muted/30 px-4 py-2 border border-border">
                  {pairingCode}
                </code>
                <button
                  type="button"
                  onClick={copyCode}
                  className="p-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-[0.65rem] text-muted-foreground/60">
              Expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
            </p>
          </div>
        )}

        {!pairingCode && (
          <p className="text-xs text-muted-foreground/60">
            Generate a code to pair a phone or tablet with this dashboard.
            The device will be able to access all dashboard features.
          </p>
        )}
      </div>

      {/* Paired devices list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : devices.length > 0 ? (
        <div className="border border-border">
          <div className="px-4 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Paired Devices ({devices.length})
            </span>
          </div>
          {devices.map((dev) => (
            <div
              key={dev.id}
              className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{dev.name}</p>
                  <p className="text-[0.65rem] text-muted-foreground/60">
                    Paired {formatTime(dev.created_at)} · Last used {formatTime(dev.last_used)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => revokeDevice(dev.id)}
                disabled={revoking === dev.id}
                className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer disabled:opacity-40 shrink-0"
                title="Remove device"
              >
                {revoking === dev.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/40 text-center py-2">
          No paired devices
        </p>
      )}
    </div>
  );
}
