from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import ALLOWED_ORIGINS, ensure_project_dirs
from .ml_service import (
    ModelNotReadyError,
    get_available_algorithms,
    get_training_state,
    model_status,
    predict_batch,
    predict_wav_bytes,
    request_cancel_training,
    save_training_recording,
    train_model,
    train_model_streaming,
)


class TrainRequest(BaseModel):
    include_local_recordings: bool = False
    custom_dataset_path: str | None = None
    algorithm: str = "random_forest"
    test_size: float = 0.2


class BatchPredictRequest(BaseModel):
    folder_path: str


app = FastAPI(
    title="AI Fan Condition Monitoring API",
    description="FastAPI service for training and real-time fan condition prediction.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_project_dirs()


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/model-status")
def get_model_status() -> dict:
    return model_status()


@app.get("/available-algorithms")
def algorithms() -> list[dict]:
    return get_available_algorithms()


@app.get("/training-status")
def training_status() -> dict:
    return get_training_state()


# ── SSE streaming training endpoint ─────────────────────────────────────────────

@app.post("/train")
def train(request: TrainRequest | None = None) -> StreamingResponse:
    include_local = request.include_local_recordings if request else False
    custom_path = request.custom_dataset_path if request else None
    algorithm = request.algorithm if request else "random_forest"
    test_size = request.test_size if request else 0.2

    return StreamingResponse(
        train_model_streaming(
            include_local_recordings=include_local,
            custom_dataset_path=custom_path,
            algorithm=algorithm,
            test_size=test_size,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Synchronous training (backward compatibility) ───────────────────────────────

@app.post("/train-sync")
def train_sync(request: TrainRequest | None = None) -> dict:
    include_local = request.include_local_recordings if request else False
    custom_path = request.custom_dataset_path if request else None
    algorithm = request.algorithm if request else "random_forest"
    test_size = request.test_size if request else 0.2
    try:
        return train_model(
            include_local_recordings=include_local,
            custom_dataset_path=custom_path,
            algorithm=algorithm,
            test_size=test_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/cancel-training")
def cancel_training() -> dict:
    cancelled = request_cancel_training()
    return {"cancelled": cancelled}


@app.post("/retrain")
def retrain() -> dict:
    try:
        return train_model(include_local_recordings=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict:
    try:
        return predict_wav_bytes(await file.read())
    except ModelNotReadyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/predict-batch")
def batch_predict(request: BatchPredictRequest) -> dict:
    try:
        return predict_batch(request.folder_path)
    except ModelNotReadyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/record-training-data")
async def record_training_data(label: str = Form(...), file: UploadFile = File(...)) -> dict:
    try:
        return save_training_recording(await file.read(), label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
