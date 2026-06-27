import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderSearch,
  Loader2,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
} from "lucide-react";
import { predictBatch } from "../api";
import { useTraining } from "../context/TrainingContext";
import type { BatchPredictionResult } from "../types";

export function PredictionPanel() {
  const { modelStatus } = useTraining();
  const [folderPath, setFolderPath] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const [result, setResult] = useState<BatchPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modelReady = modelStatus?.trained ?? false;
  const modelAlgo = modelStatus?.metadata?.model_type ?? "Unknown";
  const modelDate = modelStatus?.metadata?.trained_at
    ? new Date(modelStatus.metadata.trained_at).toLocaleString()
    : "N/A";

  const handlePredict = async () => {
    if (!folderPath.trim()) {
      setError("Please enter a valid folder path.");
      return;
    }

    setIsPredicting(true);
    setError(null);
    setResult(null);

    try {
      const res = await predictBatch(folderPath.trim());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed.");
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Model Info Banner */}
      <div
        className={`glass-panel flex items-center gap-4 p-4 ${
          modelReady
            ? "border-app-success/20"
            : "border-amber-500/20"
        }`}
      >
        {modelReady ? (
          <ShieldCheck size={24} className="shrink-0 text-app-success" />
        ) : (
          <ShieldAlert size={24} className="shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {modelReady
              ? "Saved model ready for prediction"
              : "No trained model available"}
          </p>
          <p className="text-xs text-stone-400">
            {modelReady
              ? `Using ${modelAlgo} · Trained ${modelDate} · No retraining required`
              : "Please train a model first before running predictions."}
          </p>
        </div>
      </div>

      {/* Prediction Input */}
      <section className="glass-panel p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <ScanSearch size={24} className="text-app-accent" />
          Predict on New Data
        </h2>
        <p className="mt-2 text-sm text-stone-300">
          Enter the path to a folder containing WAV files. The saved model will
          generate predictions without retraining.
        </p>

        <div className="mt-5 flex gap-3">
          <div className="relative flex-1">
            <FolderSearch
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500"
            />
            <input
              type="text"
              placeholder="e.g. C:\Users\Name\new-fan-recordings"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={isPredicting || !modelReady}
              className="block w-full rounded-lg border border-white/10 bg-black/40 py-3 pl-10 pr-4 text-sm text-white placeholder:text-stone-500 focus:border-app-accent/50 focus:outline-none focus:ring-1 focus:ring-app-accent/30 disabled:opacity-50"
            />
          </div>
          <button
            className="command-button border-app-accent/50 bg-app-accent/10 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/20 disabled:opacity-50"
            onClick={handlePredict}
            disabled={isPredicting || !modelReady || !folderPath.trim()}
          >
            {isPredicting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <BarChart3 size={18} />
            )}
            {isPredicting ? "Predicting…" : "Run Predictions"}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-app-danger/30 bg-app-danger/10 p-4 text-sm text-app-danger">
            <AlertCircle size={20} className="shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}
      </section>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <SummaryCard
              label="Total Files"
              value={result.total_files.toString()}
              tone="plain"
            />
            <SummaryCard
              label="Normal"
              value={result.normal_count.toString()}
              tone="green"
            />
            <SummaryCard
              label="Abnormal"
              value={result.abnormal_count.toString()}
              tone="red"
            />
            <SummaryCard
              label="Avg Confidence"
              value={`${result.average_confidence.toFixed(1)}%`}
              tone="cyan"
            />
          </div>

          {/* Results Table */}
          <section className="glass-panel overflow-hidden p-0">
            <div className="border-b border-white/5 px-5 py-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-white">
                Per-File Results
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                      File
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Prediction
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Confidence
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Health Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="max-w-xs truncate px-5 py-3 font-medium text-white">
                        {r.file}
                      </td>
                      <td className="px-5 py-3">
                        {r.prediction === "NORMAL" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-app-success/15 px-2.5 py-1 text-xs font-bold text-app-success">
                            <CheckCircle2 size={13} />
                            NORMAL
                          </span>
                        ) : r.prediction === "ABNORMAL" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-app-danger/15 px-2.5 py-1 text-xs font-bold text-app-danger">
                            <AlertCircle size={13} />
                            ABNORMAL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-400">
                            ERROR
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-white">
                        {r.prediction === "ERROR" ? "—" : `${r.confidence.toFixed(1)}%`}
                      </td>
                      <td className="px-5 py-3">
                        {r.prediction === "ERROR" ? (
                          <span className="text-xs text-stone-500">{r.error}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  r.health_score >= 70
                                    ? "bg-app-success"
                                    : r.health_score >= 40
                                      ? "bg-amber-400"
                                      : "bg-app-danger"
                                }`}
                                style={{ width: `${r.health_score}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-stone-300">
                              {r.health_score.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "plain" | "green" | "red" | "cyan";
}) {
  const toneClasses = {
    plain: "border-white/8 text-white",
    green: "border-app-success/20 text-app-success",
    red: "border-app-danger/20 text-app-danger",
    cyan: "border-app-accent/20 text-app-accent",
  };

  return (
    <div className={`glass-panel p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
