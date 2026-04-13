import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<"top" | "bottom">("top");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top < 60 ? "bottom" : "top");
    }
  }, [show]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          ref={ref}
          className={cn(
            "absolute z-50 px-2.5 py-1.5 text-[0.65rem] leading-snug max-w-[240px] border border-border bg-popover text-popover-foreground whitespace-normal",
            pos === "top" ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2" : "top-full mt-1.5 left-1/2 -translate-x-1/2",
            className,
          )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
