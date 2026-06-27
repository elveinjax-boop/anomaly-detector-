import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "warning",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap — focus the cancel button by default
  useEffect(() => {
    if (open) {
      const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>("[data-cancel]");
      cancelBtn?.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const toneColors = {
    danger: {
      icon: "text-app-danger",
      iconBg: "bg-app-danger/10",
      confirmBtn: "bg-app-danger hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]",
    },
    warning: {
      icon: "text-amber-400",
      iconBg: "bg-amber-500/10",
      confirmBtn: "bg-amber-500 hover:bg-amber-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]",
    },
    info: {
      icon: "text-app-accent",
      iconBg: "bg-app-accent/10",
      confirmBtn: "bg-app-accent hover:bg-sky-600 text-white shadow-[0_0_20px_rgba(14,165,233,0.3)]",
    },
  };
  const t = toneColors[tone];

  return (
    <div
      className="confirm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div ref={dialogRef} className="confirm-dialog">
        {/* Close button */}
        <button
          className="absolute right-3 top-3 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${t.iconBg}`}>
          <AlertTriangle size={28} className={t.icon} />
        </div>

        {/* Content */}
        <h3 id="confirm-title" className="mt-4 text-lg font-bold text-white text-center">
          {title}
        </h3>
        <p className="mt-2 text-sm text-stone-300 text-center leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            data-cancel
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-stone-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-all active:scale-95 ${t.confirmBtn}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
