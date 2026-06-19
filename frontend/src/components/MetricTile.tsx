import type { ReactNode } from "react";

type MetricTileProps = {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: "plain" | "green" | "amber" | "red" | "cyan";
};

const tones = {
  plain: "border-app-panelBorder bg-app-panel shadow-glass text-white",
  green: "border-app-success/30 bg-app-success/10 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-app-success",
  amber: "border-amber-500/30 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-amber-400",
  red: "border-app-danger/30 bg-app-danger/10 shadow-[0_0_15px_rgba(244,63,94,0.15)] text-app-danger",
  cyan: "border-app-accent/30 bg-app-accent/10 shadow-[0_0_15px_rgba(14,165,233,0.15)] text-app-accent"
};

const iconTones = {
  plain: "bg-white/10 text-stone-300",
  green: "bg-app-success/20 text-app-success",
  amber: "bg-amber-500/20 text-amber-400",
  red: "bg-app-danger/20 text-app-danger",
  cyan: "bg-app-accent/20 text-app-accent"
};

export function MetricTile({ label, value, detail, icon, tone = "plain" }: MetricTileProps): JSX.Element {
  return (
    <section className={`min-w-0 rounded-xl border p-5 backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider uppercase text-stone-400">{label}</p>
          <p className={`mt-2 break-words text-3xl font-bold tracking-tight ${tone === 'plain' ? 'text-white' : ''}`}>{value}</p>
          {detail ? <p className="mt-1 break-words text-sm text-stone-400">{detail}</p> : null}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-inner ${iconTones[tone]}`}>
          {icon}
        </div>
      </div>
    </section>
  );
}
