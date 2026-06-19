import type { ReactNode } from "react";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const tones = {
  neutral: "border-white/10 bg-white/5 text-stone-300 shadow-glass",
  success: "border-app-success/50 bg-app-success/10 text-app-success shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
  danger: "border-app-danger/50 bg-app-danger/10 text-app-danger shadow-[0_0_10px_rgba(244,63,94,0.2)]",
  info: "border-app-accent/50 bg-app-accent/10 text-app-accent shadow-[0_0_10px_rgba(14,165,233,0.2)]"
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold backdrop-blur-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}
