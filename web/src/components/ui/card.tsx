import { cn } from "@/lib/utils";
import { blendColor } from "@/nous/ui/blend-mode";
import { Typography } from "@/nous/ui/typography";

/**
 * Card — bg uses colorDodge(bg, mg) at 0.03 alpha from design-language BlendMode.
 */
export function Card({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border border-current/20 text-card-foreground",
        className,
      )}
      style={{ backgroundColor: blendColor("mg/0.03"), ...style }}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-4 border-b border-current/20", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Typography
      as="h3"
      expanded
      className={cn("text-sm font-bold tracking-[0.08em] uppercase text-midground blend-lighter", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Typography
      as="p"
      mondwest
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
