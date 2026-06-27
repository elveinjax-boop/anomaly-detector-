import { useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  OctagonX,
  X,
  XCircle,
} from "lucide-react";
import { useTraining } from "../context/TrainingContext";
import { ConfirmDialog } from "./ConfirmDialog";

const STAGE_LABELS: Record<string, string> = {
  initializing: "Initializing",
  loading_data: "Loading Data",
  splitting: "Splitting Dataset",
  scaling: "Scaling Features",
  training: "Training Model",
  evaluating: "Evaluating",
  saving: "Saving Model",
  complete: "Complete",
  error: "Error",
  cancelled: "Cancelled",
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function estimateRemaining(percent: number, elapsedMs: number): string {
  if (percent <= 0 || percent >= 100) return "";
  const totalEstimate = (elapsedMs / percent) * 100;
  const remaining = totalEstimate - elapsedMs;
  if (remaining < 1000) return "< 1s remaining";
  return `~${formatElapsed(remaining)} remaining`;
}

export function TrainingProgressOverlay() {
  const training = useTraining();
  const [minimized, setMinimized] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const isActive = training.status === "running";
  const isFinished = training.status === "completed";
  const isError = training.status === "error";
  const isCancelled = training.status === "cancelled";
  const showOverlay = isActive || isFinished || isError || isCancelled;

  if (!showOverlay) return null;

  const elapsedMs = training.startedAt ? Date.now() - training.startedAt : 0;
  const elapsed = formatElapsed(elapsedMs);
  const remaining = isActive ? estimateRemaining(training.progress, elapsedMs) : "";

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    setShowCancelDialog(false);
    await training.requestCancel();
  };

  const handleDismiss = () => {
    training.dismiss();
    setMinimized(false);
  };

  // ── Minimized Pill ────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="training-overlay-pill" onClick={() => setMinimized(false)}>
        {isActive ? (
          <>
            <Loader2 size={16} className="animate-spin text-app-accent" />
            <span className="text-xs font-semibold text-white">
              Training {training.progress}%
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
              <div
                className="progress-bar-fill h-full rounded-full"
                style={{ width: `${training.progress}%` }}
              />
            </div>
          </>
        ) : isFinished ? (
          <>
            <CheckCircle2 size={16} className="text-app-success" />
            <span className="text-xs font-semibold text-app-success">Complete</span>
          </>
        ) : isError ? (
          <>
            <XCircle size={16} className="text-app-danger" />
            <span className="text-xs font-semibold text-app-danger">Error</span>
          </>
        ) : (
          <>
            <OctagonX size={16} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">Cancelled</span>
          </>
        )}
        <ChevronUp size={14} className="text-stone-400" />
      </div>
    );
  }

  // ── Full Overlay Panel ────────────────────────────────────────────────
  return (
    <>
      <div className="training-overlay">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isActive ? (
              <Loader2 size={18} className="animate-spin text-app-accent" />
            ) : isFinished ? (
              <CheckCircle2 size={18} className="text-app-success" />
            ) : isError ? (
              <XCircle size={18} className="text-app-danger" />
            ) : (
              <OctagonX size={18} className="text-amber-400" />
            )}
            <h3 className="text-sm font-bold text-white">
              {isActive
                ? "Training in Progress"
                : isFinished
                  ? "Training Complete!"
                  : isError
                    ? "Training Failed"
                    : "Training Cancelled"}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
              onClick={() => setMinimized(true)}
              title="Minimize"
            >
              <ChevronDown size={16} />
            </button>
            {!isActive && (
              <button
                className="rounded-md p-1 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
                onClick={handleDismiss}
                title="Close"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Algorithm & Stage */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-stone-400">
            Algorithm: <span className="font-semibold text-white">{training.algorithm}</span>
          </span>
          <span className="text-stone-400">
            Stage: <span className="font-semibold text-white">{STAGE_LABELS[training.stage] ?? training.stage}</span>
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>{training.progress}%</span>
            <span>{isActive ? remaining : elapsed}</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`progress-bar-fill h-full rounded-full transition-all duration-500 ${
                isFinished
                  ? "bg-app-success shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                  : isError
                    ? "bg-app-danger shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                    : ""
              }`}
              style={{ width: `${training.progress}%` }}
            />
          </div>
        </div>

        {/* Message */}
        <p className="mt-2 text-xs text-stone-300">{training.message}</p>

        {/* Metrics on completion */}
        {isFinished && training.result?.metrics && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(["accuracy", "precision", "recall", "f1_score"] as const).map((key) => (
              <div key={key} className="rounded-lg bg-white/5 p-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  {key === "f1_score" ? "F1" : key}
                </p>
                <p className="mt-0.5 text-sm font-bold text-white">
                  {((training.result!.metrics[key] ?? 0) * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Error detail */}
        {isError && training.error && (
          <div className="mt-3 rounded-lg border border-app-danger/20 bg-app-danger/5 p-2 text-xs text-app-danger">
            {training.error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {isActive && (
            <button
              className="command-button flex-1 justify-center border-app-danger/40 bg-app-danger/10 text-app-danger hover:bg-app-danger/20"
              onClick={handleCancel}
            >
              <OctagonX size={16} />
              Stop Training
            </button>
          )}
          {(isFinished || isError || isCancelled) && (
            <button
              className="command-button flex-1 justify-center bg-white/5 text-stone-300 hover:text-white"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        title="Stop Training?"
        message="Model training is currently in progress. Do you want to stop the training?"
        confirmLabel="Stop Training"
        cancelLabel="Continue Training"
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelDialog(false)}
      />
    </>
  );
}
