import { useEffect, useState } from "react";

export function Toast({ toast }: { toast: { message: string; type: "success" | "error" } | null }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(toast);

  useEffect(() => {
    if (toast) {
      setCurrent(toast);
      setVisible(true);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setCurrent(null), 200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!current) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm ${
        current.type === "success"
          ? "bg-success/20 text-success border border-success/30"
          : "bg-destructive/20 text-destructive border border-destructive/30"
      }`}
      style={{
        animation: visible ? "toast-in 200ms ease-out forwards" : "toast-out 200ms ease-in forwards",
      }}
    >
      {current.message}
    </div>
  );
}
