import { useState, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderSearch,
  Loader2,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  UploadCloud,
  FileAudio,
  Trash2,
} from "lucide-react";
import { predictBatch, predictAudio } from "../api";
import { useTraining } from "../context/TrainingContext";
import type { BatchPredictionResult } from "../types";

export function PredictionPanel() {
  const { modelStatus } = useTraining();
  const [activeMode, setActiveMode] = useState<"upload" | "path">("upload");
  const [folderPath, setFolderPath] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const [result, setResult] = useState<BatchPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File Upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [predictProgress, setPredictProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelReady = modelStatus?.trained ?? false;
  const modelAlgo = modelStatus?.metadata?.model_type ?? "Unknown";
  const modelDate = modelStatus?.metadata?.trained_at
    ? new Date(modelStatus.metadata.trained_at).toLocaleString()
    : "N/A";

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const handlePredictPath = async () => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePredictFiles = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select files for prediction.");
      return;
    }

    setIsPredicting(true);
    setError(null);
    setResult(null);

    const resultsList = [];
    let normalCount = 0;
    let abnormalCount = 0;
    let errorCount = 0;
    let sumConfidence = 0;

    try {
      let idx = 0;
      for (const file of selectedFiles) {
        setPredictProgress({ current: idx + 1, total: selectedFiles.length, fileName: file.name });
        try {
          const res = await predictAudio(file);
          resultsList.push({
            file: file.name,
            path: file.name,
            prediction: res.prediction as "NORMAL" | "ABNORMAL" | "ERROR",
            confidence: res.confidence,
            health_score: res.health_score,
            probabilities: res.probabilities,
          });
          if (res.prediction === "NORMAL") normalCount++;
          else if (res.prediction === "ABNORMAL") abnormalCount++;
          else errorCount++;
          sumConfidence += res.confidence;
        } catch (err) {
          resultsList.push({
            file: file.name,
            path: file.name,
            prediction: "ERROR" as const,
            confidence: 0,
            health_score: 0,
            probabilities: {},
            error: err instanceof Error ? err.message : "Network error",
          });
          errorCount++;
        }
        idx++;
      }

      const validCount = selectedFiles.length - errorCount;
      const avgConfidence = validCount > 0 ? sumConfidence / validCount : 0;

      setResult({
        total_files: selectedFiles.length,
        normal_count: normalCount,
        abnormal_count: abnormalCount,
        error_count: errorCount,
        average_confidence: avgConfidence,
        results: resultsList,
      });
      setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction process encountered an error.");
    } finally {
      setIsPredicting(false);
      setPredictProgress(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Model Info Banner */}
      <div
        className={`glass-panel flex items-center gap-4 p-4 ${
          modelReady ? "border-app-success/20" : "border-amber-500/20"
        }`}
      >
        {modelReady ? (
          <ShieldCheck size={24} className="shrink-0 text-app-success" />
        ) : (
          <ShieldAlert size={24} className="shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {modelReady ? "Saved model ready for prediction" : "No trained model available"}
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
        <div className="flex flex-col justify-between gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <ScanSearch size={24} className="text-app-accent" />
              Predict on New Data
            </h2>
            <p className="mt-1 text-xs text-stone-400">
              Run evaluation on new WAV files using the saved machine learning model.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex rounded-lg bg-black/40 p-1 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setActiveMode("upload");
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeMode === "upload"
                  ? "bg-app-accent text-white shadow-md shadow-app-accent/25"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Upload Audio Files
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("path");
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeMode === "path"
                  ? "bg-app-accent text-white shadow-md shadow-app-accent/25"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Direct Folder Path
            </button>
          </div>
        </div>

        {/* ── Mode 1: File Uploader ─────────────────────────────────────────── */}
        {activeMode === "upload" && (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-stone-300">
              Select WAV files from your computer to run predictions. The files will be processed in sequence using the active model.
            </p>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 flex flex-col min-h-[180px]">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Selected Files ({selectedFiles.length})
                </span>
                <button
                  type="button"
                  disabled={isPredicting || !modelReady}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-stone-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  <UploadCloud size={14} />
                  Choose Files
                </button>
                <input
                  type="file"
                  multiple
                  accept=".wav"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* File list */}
              <div className="mt-3 flex-1 max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                {selectedFiles.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-stone-500 py-8">
                    <FileAudio size={32} className="opacity-40" />
                    <span className="mt-2 text-xs">No files selected</span>
                  </div>
                ) : (
                  selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-1.5 text-xs text-stone-300 hover:bg-black/50 transition-colors"
                    >
                      <span className="truncate max-w-[400px]" title={file.name}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="text-stone-500 hover:text-app-danger transition-colors p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Run button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-stone-400 hover:bg-white/5 hover:text-white transition-all"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={handlePredictFiles}
                disabled={isPredicting || !modelReady || selectedFiles.length === 0}
                className="command-button border-app-accent/50 bg-app-accent/15 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/25 disabled:opacity-50"
              >
                {isPredicting ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                {isPredicting ? "Processing Predictions..." : "Run Predictions"}
              </button>
            </div>

            {/* Progress indicators */}
            {predictProgress && (
              <div className="space-y-2 rounded-lg border border-white/5 bg-black/40 p-4">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span className="font-medium text-stone-200">
                    Evaluating: <span className="font-semibold text-white">{predictProgress.fileName}</span>
                  </span>
                  <span>
                    {predictProgress.current} / {predictProgress.total} ({Math.round((predictProgress.current / predictProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-app-accent transition-all duration-300"
                    style={{ width: `${(predictProgress.current / predictProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mode 2: Direct Folder Path ────────────────────────────────────── */}
        {activeMode === "path" && (
          <div className="mt-5 space-y-6">
            <p className="text-sm text-stone-300">
              Enter the absolute path to a local directory containing WAV files. The saved model will generate predictions on all files.
            </p>

            {!isLocal && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Cloud Deployment Warning:</strong> Direct folder paths only work when the
                  API server is running locally on your computer. When using the deployed Vercel/Render version, use the
                  <strong> Upload Audio Files</strong> tab instead.
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <div className="relative flex-1">
                <FolderSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
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
                className="command-button border-app-accent/50 bg-app-accent/15 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/25 disabled:opacity-50"
                onClick={handlePredictPath}
                disabled={isPredicting || !modelReady || !folderPath.trim()}
              >
                {isPredicting ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />}
                {isPredicting ? "Predicting…" : "Run Predictions"}
              </button>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-app-danger/30 bg-app-danger/10 p-4 text-sm text-app-danger">
            <AlertCircle size={20} className="shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}
      </section>

      {/* Results rendering - reused standard markup */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <SummaryCard label="Total Files" value={result.total_files.toString()} tone="plain" />
            <SummaryCard label="Normal" value={result.normal_count.toString()} tone="green" />
            <SummaryCard label="Abnormal" value={result.abnormal_count.toString()} tone="red" />
            <SummaryCard label="Avg Confidence" value={`${result.average_confidence.toFixed(1)}%`} tone="cyan" />
          </div>

          {/* Results Table */}
          <section className="glass-panel overflow-hidden p-0">
            <div className="border-b border-white/5 px-5 py-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-white">Per-File Results</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">File</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Prediction</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Confidence</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Health Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]">
                      <td className="max-w-xs truncate px-5 py-3 font-medium text-white">{r.file}</td>
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
                            <span className="text-xs font-medium text-stone-300">{r.health_score.toFixed(1)}%</span>
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
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
