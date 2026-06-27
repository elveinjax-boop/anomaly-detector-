import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cancelTraining, getModelStatus, trainModelSSE } from "../api";
import type { ModelMetrics, ModelStatus, TrainingConfig, TrainingProgress, TrainingResponse } from "../types";

type TrainingContextValue = {
  /** Current training status */
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  /** 0–100 progress percentage */
  progress: number;
  /** Current stage label */
  stage: string;
  /** Algorithm display name being trained */
  algorithm: string;
  /** Human-readable status message */
  message: string;
  /** Epoch timestamp when training started */
  startedAt: number | null;
  /** Training result when completed */
  result: TrainingResponse | null;
  /** Error message if training failed */
  error: string | null;
  /** Most recent model status from the backend */
  modelStatus: ModelStatus | null;
  /** Most recent training metrics */
  trainingMetrics: ModelMetrics | null;
  /** Start training with config */
  startTraining: (config: TrainingConfig) => void;
  /** Request cancellation */
  requestCancel: () => Promise<void>;
  /** Dismiss completed/error state back to idle */
  dismiss: () => void;
  /** Refresh model status from backend */
  refreshModelStatus: () => Promise<void>;
};

const TrainingContext = createContext<TrainingContextValue | null>(null);

export function useTraining(): TrainingContextValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTraining must be used within <TrainingProvider>");
  return ctx;
}

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TrainingContextValue["status"]>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [algorithm, setAlgorithm] = useState("");
  const [message, setMessage] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<TrainingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [trainingMetrics, setTrainingMetrics] = useState<ModelMetrics | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Load initial model status
  useEffect(() => {
    void refreshModelStatus();
  }, []);

  // Guard against accidental tab close during training
  useEffect(() => {
    if (status !== "running") return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set
      e.returnValue = "Model training is in progress. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  const refreshModelStatus = useCallback(async () => {
    try {
      const s = await getModelStatus();
      setModelStatus(s);
      setTrainingMetrics(s.metrics);
    } catch {
      // Silently fail — backend may be offline
    }
  }, []);

  const startTraining = useCallback((config: TrainingConfig) => {
    // Reset state
    setStatus("running");
    setProgress(0);
    setStage("initializing");
    setAlgorithm(config.algorithm);
    setMessage("Preparing…");
    setStartedAt(Date.now());
    setResult(null);
    setError(null);

    const controller = trainModelSSE(
      config,
      // onProgress
      (data: TrainingProgress) => {
        setProgress(data.percent);
        setStage(data.stage);
        setAlgorithm(data.algorithm);
        setMessage(data.message);
      },
      // onComplete
      (data: TrainingResponse) => {
        setStatus("completed");
        setProgress(100);
        setStage("complete");
        setMessage("Training completed successfully!");
        setResult(data);
        setModelStatus({
          trained: data.trained,
          model_path: data.model_path,
          scaler_path: data.scaler_path,
          metrics: data.metrics,
          metadata: data.metadata,
        });
        setTrainingMetrics(data.metrics);
        abortRef.current = null;
      },
      // onError
      (msg: string) => {
        setStatus("error");
        setProgress(0);
        setStage("error");
        setMessage(msg);
        setError(msg);
        abortRef.current = null;
      },
      // onCancelled
      () => {
        setStatus("cancelled");
        setProgress(0);
        setStage("cancelled");
        setMessage("Training was cancelled.");
        abortRef.current = null;
      },
    );

    abortRef.current = controller;
  }, []);

  const requestCancel = useCallback(async () => {
    try {
      await cancelTraining();
    } catch {
      // If the cancel request fails, forcibly abort the fetch
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("cancelled");
    setProgress(0);
    setStage("cancelled");
    setMessage("Training was cancelled.");
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setStage("");
    setAlgorithm("");
    setMessage("");
    setStartedAt(null);
    setError(null);
  }, []);

  return (
    <TrainingContext.Provider
      value={{
        status,
        progress,
        stage,
        algorithm,
        message,
        startedAt,
        result,
        error,
        modelStatus,
        trainingMetrics,
        startTraining,
        requestCancel,
        dismiss,
        refreshModelStatus,
      }}
    >
      {children}
    </TrainingContext.Provider>
  );
}
