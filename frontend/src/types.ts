export type ModelMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  confusion_matrix: number[][];
  labels: string[];
  evaluation_note: string;
  train_samples: number;
  test_samples: number;
  algorithm?: string;
};

export type ModelStatus = {
  trained: boolean;
  model_path: string;
  scaler_path: string;
  metrics: ModelMetrics | null;
  metadata: {
    trained_at?: string;
    include_local_recordings?: boolean;
    raw_file_counts?: Record<string, number>;
    valid_file_counts?: Record<string, number>;
    skipped_files?: Array<{ file: string; reason: string }>;
    classes?: string[];
    algorithm?: string;
    model_type?: string;
    test_size?: number;
    incremental?: boolean;
  };
};

export type PredictionResult = {
  prediction: "NORMAL" | "ABNORMAL" | string;
  confidence: number;
  probabilities: Record<string, number>;
  health_score: number;
};

export type TrainingResponse = {
  trained: boolean;
  metrics: ModelMetrics;
  metadata: ModelStatus["metadata"];
  model_path: string;
  scaler_path: string;
};

export type RecordingResponse = {
  saved: boolean;
  label: string;
  path: string;
};

// ── New types for ML workflow enhancements ──────────────────────────────────

export type AlgorithmInfo = {
  key: string;
  name: string;
  description: string;
  incremental: boolean;
};

export type TrainingConfig = {
  algorithm: string;
  test_size: number;
  include_local_recordings: boolean;
  custom_dataset_path?: string;
};

export type TrainingProgress = {
  stage: string;
  percent: number;
  algorithm: string;
  message: string;
};

export type TrainingState = {
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  progress: number;
  stage: string;
  algorithm: string;
  started_at: number | null;
  result: TrainingResponse | null;
  error: string | null;
};

export type BatchPredictionFileResult = {
  file: string;
  path: string;
  prediction: "NORMAL" | "ABNORMAL" | "ERROR";
  confidence: number;
  health_score: number;
  probabilities: Record<string, number>;
  error?: string;
};

export type BatchPredictionResult = {
  total_files: number;
  normal_count: number;
  abnormal_count: number;
  error_count: number;
  average_confidence: number;
  results: BatchPredictionFileResult[];
};
