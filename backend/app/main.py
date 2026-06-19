from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import ALLOWED_ORIGINS, ensure_project_dirs
from .ml_service import ModelNotReadyError, model_status, predict_wav_bytes, save_training_recording, train_model


class TrainRequest(BaseModel):
    include_local_recordings: bool = False


app = FastAPI(
    title="AI Fan Condition Monitoring API",
    description="FastAPI service for training and real-time fan condition prediction.",
    version="1.0.0",
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


@app.post("/train")
def train(request: TrainRequest | None = None) -> dict:
    include_local = request.include_local_recordings if request else False
    try:
        return train_model(include_local_recordings=include_local)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@app.post("/record-training-data")
async def record_training_data(label: str = Form(...), file: UploadFile = File(...)) -> dict:
    try:
        return save_training_recording(await file.read(), label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
