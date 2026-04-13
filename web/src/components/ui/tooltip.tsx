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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (show && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top < 60 ? "bottom" : "top");
    }
  }, [show]);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setShow(true), 200);
  };

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && (
        <div
          ref={ref}
          className={cn(
            "absolute z-50 px-2.5 py-1.5 text-[0.65rem] leading-snug max-w-[240px] border border-border bg-popover text-popover-foreground whitespace-normal shadow-lg animate-tooltip-in",
            pos === "top" ? "bottom-full mb-2 left-1/2 -translate-x-1/2" : "top-full mt-2 left-1/2 -translate-x-1/2",
            className,
          )}
          role="tooltip"
        >
          {content}
          {/* Arrow */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-border rotate-45",
              pos === "top" ? "top-full -mt-1 border-r border-b" : "bottom-full -mb-1 border-l border-t",
            )}
          />
        </div>
      )}
    </div>
  );
}
