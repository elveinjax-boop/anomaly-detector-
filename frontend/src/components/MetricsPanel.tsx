import type { ModelMetrics } from "../types";

type MetricsPanelProps = {
  metrics: ModelMetrics | null;
};

export function MetricsPanel({ metrics }: MetricsPanelProps): JSX.Element {
  if (!metrics) {
    return (
      <section className="glass-panel p-5">
        <h2 className="text-sm font-bold text-white tracking-wide uppercase">Training Metrics</h2>
        <p className="mt-3 text-sm text-stone-400">No training metrics available.</p>
      </section>
    );
  }

  const [normalRow = [], abnormalRow = []] = metrics.confusion_matrix;

  return (
    <section className="glass-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Training Metrics</h2>
          <p className="mt-1 text-xs text-stone-400">{metrics.evaluation_note}</p>
        </div>
        <p className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-stone-300 border border-white/5">
          {metrics.train_samples} train / {metrics.test_samples} test
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Accuracy" value={metrics.accuracy} />
        <Metric label="Precision" value={metrics.precision} />
        <Metric label="Recall" value={metrics.recall} />
        <Metric label="F1 Score" value={metrics.f1_score} />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-80 border-separate border-spacing-0 text-sm">
          <caption className="mb-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Confusion Matrix</caption>
          <thead>
            <tr>
              <th className="rounded-tl-lg border border-white/10 bg-white/5 p-3 text-left font-semibold text-stone-300">
                Actual
              </th>
              <th className="border-y border-r border-white/10 bg-white/5 p-3 text-left font-semibold text-stone-300">
                Pred NORMAL
              </th>
              <th className="rounded-tr-lg border-y border-r border-white/10 bg-white/5 p-3 text-left font-semibold text-stone-300">
                Pred ABNORMAL
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border-x border-b border-white/10 bg-black/20 p-3 text-left font-semibold text-stone-300">NORMAL</th>
              <td className="border-b border-r border-white/10 bg-black/20 p-3 font-bold text-white">{normalRow[0] ?? 0}</td>
              <td className="border-b border-r border-white/10 bg-black/20 p-3 font-bold text-white">{normalRow[1] ?? 0}</td>
            </tr>
            <tr>
              <th className="rounded-bl-lg border-x border-b border-white/10 bg-black/20 p-3 text-left font-semibold text-stone-300">
                ABNORMAL
              </th>
              <td className="border-b border-r border-white/10 bg-black/20 p-3 font-bold text-white">{abnormalRow[0] ?? 0}</td>
              <td className="rounded-br-lg border-b border-r border-white/10 bg-black/20 p-3 font-bold text-white">
                {abnormalRow[1] ?? 0}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:bg-white/10">
      <p className="text-xs font-semibold tracking-wider uppercase text-stone-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{(value * 100).toFixed(1)}%</p>
    </div>
  );
}
