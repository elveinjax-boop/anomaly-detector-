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
