import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

let nextId = 0;

/**
 * Lightweight toast notification state.
 * Extracted from page.tsx so any component can trigger toasts
 * without re-rendering the entire page tree.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = `toast-${++nextId}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 4000);
      timersRef.current.set(id, timer);
    },
    []
  );

  return { toasts, addToast, removeToast } as const;
}
