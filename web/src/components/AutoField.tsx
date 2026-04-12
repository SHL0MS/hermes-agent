import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function AutoField({
  schemaKey,
  schema,
  value,
  onChange,
}: AutoFieldProps) {
  // Show human-readable label from the last path segment
  const rawLabel = schemaKey.split(".").pop() ?? schemaKey;
  const label = rawLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // Show the full dot-path as a subtle subtitle so users know the YAML key
  const keyPath = schemaKey.includes(".") ? schemaKey : "";

  // --- Schema-type-first rendering (avoids typeof-object false positives) ---

  if (schema.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{label}</Label>
          {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        </div>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }

  if (schema.type === "select") {
    const options = (schema.options as string[]) ?? [];
    return (
      <div className="grid gap-2">
        <Label className="text-sm">{label}</Label>
        {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "(none)"}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (schema.type === "number") {
    return (
      <div className="grid gap-2">
        <Label className="text-sm">{label}</Label>
        {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(0);
              return;
            }
            const n = Number(raw);
            if (!Number.isNaN(n)) {
              onChange(n);
            }
          }}
        />
      </div>
    );
  }

  if (schema.type === "text") {
    return (
      <div className="grid gap-2">
        <Label className="text-sm">{label}</Label>
        {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (schema.type === "list") {
    return (
      <div className="grid gap-2">
        <Label className="text-sm">{label}</Label>
        {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        <Input
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="comma-separated values"
        />
      </div>
    );
  }

  // --- Fallback: object values get a sub-key editor ---

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return (
      <div className="grid gap-3 rounded-lg border border-border p-3">
        <Label className="text-xs font-medium">{label}</Label>
        {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
        {Object.entries(obj).map(([subKey, subVal]) => (
          <div key={subKey} className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{subKey}</Label>
            <Input
              value={String(subVal ?? "")}
              onChange={(e) => onChange({ ...obj, [subKey]: e.target.value })}
              className="text-xs"
            />
          </div>
        ))}
      </div>
    );
  }

  // --- Default: string input ---

  return (
    <div className="grid gap-2">
      <Label className="text-sm">{label}</Label>
      {keyPath && <span className="text-[10px] font-mono text-muted-foreground/50">{keyPath}</span>}
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface AutoFieldProps {
  schemaKey: string;
  schema: Record<string, unknown>;
  value: unknown;
  onChange: (v: unknown) => void;
}
