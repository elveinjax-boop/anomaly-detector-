import type { ModelStatus, PredictionResult, RecordingResponse, TrainingResponse } from "./types";

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

export async function trainModel(includeLocalRecordings = false): Promise<TrainingResponse> {
  const response = await fetch(`${API_BASE_URL}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ include_local_recordings: includeLocalRecordings })
  });
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
    body: formData
  });
  return parseResponse(response);
}

export async function saveTrainingRecording(blob: Blob, label: "NORMAL" | "ABNORMAL"): Promise<RecordingResponse> {
  const formData = new FormData();
  formData.append("label", label);
  formData.append("file", blob, `${label.toLowerCase()}-recording.wav`);

  const response = await fetch(`${API_BASE_URL}/record-training-data`, {
    method: "POST",
    body: formData
  });
  return parseResponse(response);
}
