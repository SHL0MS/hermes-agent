import { useState, useEffect } from "react";
import { api, getStoredToken, setStoredToken, clearStoredToken, onAuthRequired } from "@/lib/api";
import { KeyRound, Smartphone, Loader2 } from "lucide-react";

/**
 * PairingGate wraps the entire app. On non-localhost, if there's no valid
 * device token, it shows the pairing code input screen instead of the dashboard.
 * On localhost, it renders children immediately (no auth needed).
 */
export function PairingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "authenticated" | "pairing" | "revoked">("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check auth on mount
  useEffect(() => {
    api.checkAuth()
      .then(() => setState("authenticated"))
      .catch(() => {
        // 401 — need pairing
        if (getStoredToken()) {
          // Had a token but it's no longer valid (revoked)
          clearStoredToken();
          setState("revoked");
        } else {
          setState("pairing");
        }
      });
  }, []);

  // Listen for 401s during dashboard use (e.g. token revoked mid-session)
  useEffect(() => {
    onAuthRequired(() => {
      clearStoredToken();
      setState("revoked");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setSubmitting(true);
    setError(null);

    const result = await api.completePairing(code.trim(), navigator.userAgent.slice(0, 50));
    if (result.token) {
      setStoredToken(result.token);
      setState("authenticated");
    } else {
      setError("Invalid or expired code. Check the code and try again.");
    }
    setSubmitting(false);
  };

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "authenticated") {
    return <>{children}</>;
  }

  // Pairing screen (also handles "revoked" state)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-sm">
        <div className="border border-border p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 border border-border mb-2">
              {state === "revoked" ? (
                <KeyRound className="h-6 w-6 text-warning" />
              ) : (
                <Smartphone className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <h1 className="font-expanded text-sm font-bold tracking-[0.08em] uppercase">
              {state === "revoked" ? "Device Removed" : "Pair Device"}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {state === "revoked"
                ? "This device was unpaired. Enter a new pairing code to reconnect."
                : "Enter the pairing code shown on your Hermes Agent dashboard to connect this device."}
            </p>
          </div>

          {/* Code input */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD1234"
                maxLength={8}
                autoFocus
                className="w-full h-12 border border-border bg-background/40 px-4 text-center font-mono text-lg tracking-[0.3em] uppercase placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/40"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || code.length < 4}
              className="w-full h-10 bg-foreground text-background font-display text-xs tracking-[0.15em] uppercase disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? "Pairing..." : "Connect"}
            </button>
          </form>

          {/* Help text */}
          <div className="text-center">
            <p className="text-[0.65rem] text-muted-foreground/60 leading-relaxed">
              On your computer, open the dashboard and go to<br />
              Settings → Devices → Pair new device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
