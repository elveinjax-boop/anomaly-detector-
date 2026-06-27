import type {
  AlgorithmInfo,
  BatchPredictionResult,
  ModelStatus,
  PredictionResult,
  RecordingResponse,
  TrainingConfig,
  TrainingResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let message = `${response.status} ${response.statusText}`;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      message = payload.detail;
    }
  } catch {
    // Keep the HTTP status message when the backend returns no JSON body.
  }
  throw new Error(message);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function getHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return parseResponse(response);
}

export async function getModelStatus(): Promise<ModelStatus> {
  const response = await fetch(`${API_BASE_URL}/model-status`);
  return parseResponse(response);
}

export async function getAvailableAlgorithms(): Promise<AlgorithmInfo[]> {
  const response = await fetch(`${API_BASE_URL}/available-algorithms`);
  return parseResponse(response);
}

export async function getTrainingStatus(): Promise<{
  status: string;
  progress: number;
  stage: string;
  algorithm: string;
}> {
  const response = await fetch(`${API_BASE_URL}/training-status`);
  return parseResponse(response);
}

// ── SSE training ────────────────────────────────────────────────────────────

export function trainModelSSE(
  config: TrainingConfig,
  onProgress: (data: { stage: string; percent: number; algorithm: string; message: string }) => void,
  onComplete: (data: TrainingResponse) => void,
  onError: (message: string) => void,
  onCancelled?: () => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE_URL}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_local_recordings: config.include_local_recordings,
      custom_dataset_path: config.custom_dataset_path,
      algorithm: config.algorithm,
      test_size: config.test_size,
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        onError(text || `HTTP ${response.status}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6).trim();
          } else if (line === "" && eventType && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === "progress") {
                onProgress(parsed);
              } else if (eventType === "complete") {
                onComplete(parsed);
              } else if (eventType === "error") {
                onError(parsed.message || "Training failed");
              } else if (eventType === "cancelled") {
                onCancelled?.();
              }
            } catch {
              // Ignore malformed SSE events
            }
            eventType = "";
            eventData = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Expected when cancelled from the client side
      }
      onError(err instanceof Error ? err.message : "Network error");
    });

  return controller;
}

// ── Synchronous training (backward compatibility) ───────────────────────────

export async function trainModel(
  includeLocalRecordings = false,
  customDatasetPath?: string,
  algorithm = "random_forest",
  testSize = 0.2,
): Promise<TrainingResponse> {
  const response = await fetch(`${API_BASE_URL}/train-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_local_recordings: includeLocalRecordings,
      custom_dataset_path: customDatasetPath,
      algorithm,
      test_size: testSize,
    }),
  });
  return parseResponse(response);
}

export async function cancelTraining(): Promise<{ cancelled: boolean }> {
  const response = await fetch(`${API_BASE_URL}/cancel-training`, { method: "POST" });
  return parseResponse(response);
}

export async function retrainModel(): Promise<TrainingResponse> {
  const response = await fetch(`${API_BASE_URL}/retrain`, { method: "POST" });
  return parseResponse(response);
}

export async function predictAudio(blob: Blob): Promise<PredictionResult> {
  const formData = new FormData();
  formData.append("file", blob, "fan-window.wav");

  const response = await fetch(`${API_BASE_URL}/predict`, {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function predictBatch(folderPath: string): Promise<BatchPredictionResult> {
  const response = await fetch(`${API_BASE_URL}/predict-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  return parseResponse(response);
}

export async function saveTrainingRecording(blob: Blob, label: "NORMAL" | "ABNORMAL"): Promise<RecordingResponse> {
  const formData = new FormData();
  formData.append("label", label);
  formData.append("file", blob, `${label.toLowerCase()}-recording.wav`);

  const response = await fetch(`${API_BASE_URL}/record-training-data`, {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}
