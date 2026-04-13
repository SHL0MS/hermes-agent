import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — uses midground layer colors from @nous/design-language.
 * Canonical badge: font-compressed, bg mg/0.075, color mg, tracking 0.2em.
 */
const badgeVariants = cva(
  "inline-flex items-center border px-2 py-1 font-compressed text-[0.65rem] tracking-[0.2em] uppercase leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-midground/20 bg-midground/[0.075] text-midground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-destructive/30 bg-destructive/15 text-destructive",
        outline: "border-border text-muted-foreground",
        success: "grain border-emerald-600/30 bg-emerald-950/70 text-emerald-400",
        warning: "border-warning/30 bg-warning/15 text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      style={{ opacity: "var(--midground-alpha, 1)", ...style }}
      {...props}
    />
  );
}
