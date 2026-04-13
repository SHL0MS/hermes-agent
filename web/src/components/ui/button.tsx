import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — dashboard variant system with design-language styling.
 * Default variant uses midground colors + arc-border hover effect.
 * Shadow uses canonical inset pattern from design-language Button.
 */
const buttonVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-display text-xs tracking-[0.15em] uppercase transition-colors cursor-pointer"
  + " disabled:pointer-events-none disabled:bg-midground/15 disabled:text-midground disabled:shadow-none",
  {
    variants: {
      variant: {
        default:
          "bg-midground text-background font-bold shadow-[inset_-1px_-1px_0_0_#00000080,inset_1px_1px_0_0_#ffffff80] active:invert",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent text-midground hover:bg-midground/10 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-midground/10 hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[0.65rem]",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  const showArc = variant === "default" || variant === undefined;
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {/* Arc-border: animated gradient stroke on hover (from design-language) */}
      {showArc && (
        <span
          aria-hidden
          className="arc-border opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100"
        />
      )}
      {children}
    </button>
  );
}
