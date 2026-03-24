import { useEffect, useState } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "warning" | "success";
  sessionId?: string;
  /** Auto-dismiss after ms (0 = manual dismiss only) */
  duration?: number;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onClickToast?: (toast: ToastItem) => void;
}

export function ToastContainer({ toasts, onDismiss, onClickToast }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          onClick={() => onClickToast?.(toast)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onClick,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss
    const duration = toast.duration ?? 8000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 200);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  const bgColor = {
    info: "bg-blue-600",
    warning: "bg-orange-500",
    success: "bg-green-600",
  }[toast.type];

  return (
    <div
      className={`flex max-w-sm items-center gap-3 rounded-lg ${bgColor} px-4 py-3 text-white shadow-lg transition-all duration-200 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      <button onClick={onClick} className="flex-1 cursor-pointer text-left text-sm font-medium">
        {toast.message}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(onDismiss, 200);
        }}
        className="shrink-0 cursor-pointer rounded p-0.5 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
