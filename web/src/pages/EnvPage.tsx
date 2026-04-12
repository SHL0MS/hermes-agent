import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  MessageSquare,
  Pencil,
  Save,
  Settings,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import type { EnvVarInfo } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORY_META: Record<string, { label: string; icon: typeof KeyRound }> = {
  provider: { label: "LLM Providers", icon: Zap },
  tool: { label: "Tool API Keys", icon: KeyRound },
  messaging: { label: "Messaging Platforms", icon: MessageSquare },
  setting: { label: "Agent Settings", icon: Settings },
};

export default function EnvPage() {
  const [vars, setVars] = useState<Record<string, EnvVarInfo> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Holds the real (unredacted) value after a reveal request
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    api.getEnvVars().then(setVars).catch(() => {});
  }, []);

  const handleSave = async (key: string) => {
    const value = edits[key];
    if (!value) return;
    setSaving(key);
    try {
      await api.setEnvVar(key, value);
      setVars((prev) =>
        prev
          ? {
              ...prev,
              [key]: { ...prev[key], is_set: true, redacted_value: value.slice(0, 4) + "..." + value.slice(-4) },
            }
          : prev,
      );
      setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
      // Clear any revealed value since it changed
      setRevealed((prev) => { const n = { ...prev }; delete n[key]; return n; });
      showToast(`${key} saved`, "success");
    } catch (e) {
      showToast(`Failed to save ${key}: ${e}`, "error");
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (key: string) => {
    setSaving(key);
    try {
      await api.deleteEnvVar(key);
      setVars((prev) =>
        prev
          ? { ...prev, [key]: { ...prev[key], is_set: false, redacted_value: null } }
          : prev,
      );
      setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
      setRevealed((prev) => { const n = { ...prev }; delete n[key]; return n; });
      showToast(`${key} removed`, "success");
    } catch (e) {
      showToast(`Failed to remove ${key}: ${e}`, "error");
    } finally {
      setSaving(null);
    }
  };

  const handleReveal = async (key: string) => {
    if (revealed[key]) {
      // Already revealed — toggle back to redacted
      setRevealed((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    try {
      const resp = await api.revealEnvVar(key);
      setRevealed((prev) => ({ ...prev, [key]: resp.value }));
    } catch {
      showToast(`Failed to reveal ${key}`, "error");
    }
  };

  const cancelEdit = (key: string) => {
    setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  if (!vars) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const categories = Object.keys(CATEGORY_META);
  const grouped = categories.map((cat) => ({
    ...CATEGORY_META[cat],
    category: cat,
    entries: Object.entries(vars).filter(
      ([, info]) => info.category === cat && (showAdvanced || !info.advanced),
    ),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Manage API keys and secrets stored in <code>~/.hermes/.env</code>
          </p>
          <p className="text-xs text-muted-foreground/70">
            Changes are saved to disk immediately. Active sessions pick up new keys automatically within a few seconds.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? "Hide Advanced" : "Show Advanced"}
        </Button>
      </div>

      {grouped.map(({ label, icon: Icon, entries, category }) => {
        if (entries.length === 0) return null;
        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{label}</CardTitle>
              </div>
              <CardDescription>
                {entries.filter(([, i]) => i.is_set).length} of {entries.length} configured
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-4">
              {entries.map(([key, info]) => {
                const isEditing = edits[key] !== undefined;
                const isRevealed = !!revealed[key];
                const displayValue = isRevealed ? revealed[key] : (info.redacted_value ?? "•••");

                return (
                  <div key={key} className="grid gap-2 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="font-mono text-xs">{key}</Label>
                        <Badge variant={info.is_set ? "success" : "outline"}>
                          {info.is_set ? "Set" : "Not set"}
                        </Badge>
                      </div>
                      {info.url && (
                        <a href={info.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Get key <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">{info.description}</p>

                    {info.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {info.tools.map((tool) => (
                          <Badge key={tool} variant="secondary" className="text-[10px]">{tool}</Badge>
                        ))}
                      </div>
                    )}

                    {/* --- Display mode --- */}
                    {!isEditing && (
                      <div className="flex items-center gap-2">
                        <div className={`flex-1 rounded-md border border-input px-3 py-2 font-mono text-xs ${
                          isRevealed ? "bg-background text-foreground select-all" : "bg-muted/30 text-muted-foreground"
                        }`}>
                          {info.is_set ? displayValue : "—"}
                        </div>

                        {info.is_set && (
                          <Button size="sm" variant="ghost" onClick={() => handleReveal(key)}
                            title={isRevealed ? "Hide value" : "Show real value"}>
                            {isRevealed
                              ? <EyeOff className="h-4 w-4" />
                              : <Eye className="h-4 w-4" />}
                          </Button>
                        )}

                        <Button size="sm" variant="outline"
                          onClick={() => setEdits({ ...edits, [key]: "" })}>
                          <Pencil className="h-3 w-3" />
                          {info.is_set ? "Replace" : "Set"}
                        </Button>

                        {info.is_set && (
                          <Button size="sm" variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleClear(key)} disabled={saving === key}>
                            <Trash2 className="h-3 w-3" />
                            {saving === key ? "..." : "Clear"}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* --- Edit mode --- */}
                    {isEditing && (
                      <div className="flex items-center gap-2">
                        <Input autoFocus type="text" value={edits[key]}
                          onChange={(e) => setEdits({ ...edits, [key]: e.target.value })}
                          placeholder={info.is_set ? `Replace current value (${info.redacted_value ?? "•••"})` : "Enter value..."}
                          className="flex-1 font-mono text-xs" />
                        <Button size="sm" onClick={() => handleSave(key)}
                          disabled={saving === key || !edits[key]}>
                          <Save className="h-3 w-3" />
                          {saving === key ? "..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelEdit(key)}>
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
