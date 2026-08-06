/**
 * STORY-profile-007: Toast notification system
 *
 * A lightweight, client-side toast notification component using React state
 * and CSS transitions. No external dependencies required.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Toast severity levels */
export type ToastVariant = "success" | "error" | "info";

export interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface ToastContextValue {
  toasts: ToastData[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast notification system.
 * @throws if used outside a ToastProvider.
 */
export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  ToastProvider                                                      */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const addToast = React.useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);

      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  ToastContainer                                                     */
/* ------------------------------------------------------------------ */

function ToastContainer() {
  const { toasts, removeToast } = React.useContext(ToastContext)!;

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ToastItem                                                          */
/* ------------------------------------------------------------------ */

interface ToastItemProps {
  toast: ToastData;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const borderColors: Record<ToastVariant, string> = {
    success: "border-l-green-500",
    error: "border-l-red-500",
    info: "border-l-blue-500",
  };

  const bgColors: Record<ToastVariant, string> = {
    success: "bg-green-950/90 text-green-100",
    error: "bg-red-950/90 text-red-100",
    info: "bg-blue-950/90 text-blue-100",
  };

  return (
    <div
      data-testid={`toast-${toast.variant}`}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border-l-4 bg-gray-900 px-4 py-3 text-sm shadow-lg",
        borderColors[toast.variant],
        bgColors[toast.variant],
        "animate-in slide-in-from-right-full transition-opacity duration-300",
      )}
      role="alert"
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onClose}
        className="ml-2 rounded p-1 text-current opacity-60 hover:opacity-100 focus:outline-none"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
