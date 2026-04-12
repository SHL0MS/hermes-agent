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
  ChevronDown,
  ChevronRight,
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

function EnvVarRow({
  varKey,
  info,
  edits,
  setEdits,
  revealed,
  saving,
  onSave,
  onClear,
  onReveal,
  onCancelEdit,
}: {
  varKey: string;
  info: EnvVarInfo;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  revealed: Record<string, string>;
  saving: string | null;
  onSave: (key: string) => void;
  onClear: (key: string) => void;
  onReveal: (key: string) => void;
  onCancelEdit: (key: string) => void;
}) {
  const isEditing = edits[varKey] !== undefined;
  const isRevealed = !!revealed[varKey];
  const displayValue = isRevealed ? revealed[varKey] : (info.redacted_value ?? "---");

  // Compact row for unset, non-editing keys
  if (!info.is_set && !isEditing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-2.5 opacity-60 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-3 min-w-0">
          <Label className="font-mono text-xs text-muted-foreground">{varKey}</Label>
          <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">{info.description}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {info.url && (
            <a href={info.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Get key <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setEdits((prev) => ({ ...prev, [varKey]: "" }))}>
            <Pencil className="h-3 w-3" />
            Set
          </Button>
        </div>
      </div>
    );
  }

  // Full expanded row for set keys or keys being edited
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="font-mono text-xs">{varKey}</Label>
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

      {!isEditing && (
        <div className="flex items-center gap-2">
          <div className={`flex-1 rounded-md border border-input px-3 py-2 font-mono text-xs ${
            isRevealed ? "bg-background text-foreground select-all" : "bg-muted/30 text-muted-foreground"
          }`}>
            {info.is_set ? displayValue : "---"}
          </div>

          {info.is_set && (
            <Button size="sm" variant="ghost" onClick={() => onReveal(varKey)}
              title={isRevealed ? "Hide value" : "Show real value"}
              aria-label={isRevealed ? `Hide ${varKey}` : `Reveal ${varKey}`}>
              {isRevealed
                ? <EyeOff className="h-4 w-4" />
                : <Eye className="h-4 w-4" />}
            </Button>
          )}

          <Button size="sm" variant="outline"
            onClick={() => setEdits((prev) => ({ ...prev, [varKey]: "" }))}>
            <Pencil className="h-3 w-3" />
            {info.is_set ? "Replace" : "Set"}
          </Button>

          {info.is_set && (
            <Button size="sm" variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onClear(varKey)} disabled={saving === varKey}>
              <Trash2 className="h-3 w-3" />
              {saving === varKey ? "..." : "Clear"}
            </Button>
          )}
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2">
          <Input autoFocus type="text" value={edits[varKey]}
            onChange={(e) => setEdits((prev) => ({ ...prev, [varKey]: e.target.value }))}
            placeholder={info.is_set ? `Replace current value (${info.redacted_value ?? "---"})` : "Enter value..."}
            className="flex-1 font-mono text-xs" />
          <Button size="sm" onClick={() => onSave(varKey)}
            disabled={saving === varKey || !edits[varKey]}>
            <Save className="h-3 w-3" />
            {saving === varKey ? "..." : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onCancelEdit(varKey)}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EnvPage() {
  const [vars, setVars] = useState<Record<string, EnvVarInfo> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [collapsedUnset, setCollapsedUnset] = useState<Set<string>>(new Set());
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
  const grouped = categories.map((cat) => {
    const entries = Object.entries(vars).filter(
      ([, info]) => info.category === cat && (showAdvanced || !info.advanced),
    );
    const setEntries = entries.filter(([, info]) => info.is_set);
    const unsetEntries = entries.filter(([, info]) => !info.is_set);
    return {
      ...CATEGORY_META[cat],
      category: cat,
      setEntries,
      unsetEntries,
      totalEntries: entries.length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Manage API keys and secrets stored in <code>~/.hermes/.env</code>
          </p>
          <p className="text-xs text-muted-foreground/70">
            Changes are saved to disk immediately. Active sessions pick up new keys automatically.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? "Hide Advanced" : "Show Advanced"}
        </Button>
      </div>

      {grouped.map(({ label, icon: Icon, setEntries, unsetEntries, totalEntries, category }) => {
        if (totalEntries === 0) return null;
        const isUnsetCollapsed = collapsedUnset.has(category);

        return (
          <Card key={category}>
            <CardHeader className="sticky top-14 z-10 bg-card rounded-t-xl border-b border-border/50">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{label}</CardTitle>
              </div>
              <CardDescription>
                {setEntries.length} of {totalEntries} configured
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-3 pt-4">
              {/* Configured keys first — always shown expanded */}
              {setEntries.map(([key, info]) => (
                <EnvVarRow
                  key={key} varKey={key} info={info}
                  edits={edits} setEdits={setEdits} revealed={revealed} saving={saving}
                  onSave={handleSave} onClear={handleClear} onReveal={handleReveal} onCancelEdit={cancelEdit}
                />
              ))}

              {/* Unconfigured keys — collapsible */}
              {unsetEntries.length > 0 && (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer pt-1"
                    onClick={() => setCollapsedUnset((prev) => {
                      const next = new Set(prev);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })}
                  >
                    {isUnsetCollapsed
                      ? <ChevronRight className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />}
                    <span>{unsetEntries.length} not configured</span>
                  </button>

                  {!isUnsetCollapsed && unsetEntries.map(([key, info]) => (
                    <EnvVarRow
                      key={key} varKey={key} info={info}
                      edits={edits} setEdits={setEdits} revealed={revealed} saving={saving}
                      onSave={handleSave} onClear={handleClear} onReveal={handleReveal} onCancelEdit={cancelEdit}
                    />
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
