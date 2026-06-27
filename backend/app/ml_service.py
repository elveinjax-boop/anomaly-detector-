from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
from typing import Any
from uuid import uuid4

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .audio_features import extract_features_from_file, get_feature_names, wav_files
from .config import (
    DEFAULT_ABNORMAL_DIR,
    DEFAULT_NORMAL_DIR,
    LOCAL_ABNORMAL_DIR,
    LOCAL_NORMAL_DIR,
    METADATA_PATH,
    METRICS_PATH,
    MODEL_PATH,
    SCALER_PATH,
    ensure_project_dirs,
)


LABELS = ["NORMAL", "ABNORMAL"]


class ModelNotReadyError(RuntimeError):
    """Raised when prediction is requested before a model exists."""


def _json_safe(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(_json_safe(payload), indent=2), encoding="utf-8")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _load_model_bundle() -> tuple[RandomForestClassifier, StandardScaler]:
    if not MODEL_PATH.exists() or not SCALER_PATH.exists():
        raise ModelNotReadyError("Train the fan condition model before requesting predictions.")
    return joblib.load(MODEL_PATH), joblib.load(SCALER_PATH)


def model_status() -> dict[str, Any]:
    metadata = _read_json(METADATA_PATH) or {}
    metrics = _read_json(METRICS_PATH)
    return {
        "trained": MODEL_PATH.exists() and SCALER_PATH.exists(),
        "model_path": str(MODEL_PATH),
        "scaler_path": str(SCALER_PATH),
        "metrics": metrics,
        "metadata": metadata,
    }


def _dataset_sources(include_local_recordings: bool, custom_dataset_path: str | None = None) -> dict[str, list[Path]]:
    sources = {
        "NORMAL": [DEFAULT_NORMAL_DIR],
        "ABNORMAL": [DEFAULT_ABNORMAL_DIR],
    }
    if include_local_recordings:
        sources["NORMAL"].append(LOCAL_NORMAL_DIR)
        sources["ABNORMAL"].append(LOCAL_ABNORMAL_DIR)
        
    if custom_dataset_path:
        base_path = Path(custom_dataset_path)
        sources["NORMAL"].extend([base_path / "NORMAL", base_path / "normal"])
        sources["ABNORMAL"].extend([base_path / "ABNORMAL", base_path / "abnormal"])

    return sources


def _build_dataset(include_local_recordings: bool, custom_dataset_path: str | None = None) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    sources = _dataset_sources(include_local_recordings, custom_dataset_path)
    rows: list[np.ndarray] = []
    labels: list[str] = []
    skipped: list[dict[str, str]] = []
    counts: dict[str, int] = {}

    for label, directories in sources.items():
        files = wav_files(directories)
        counts[label] = len(files)
        for path in files:
            try:
                rows.append(extract_features_from_file(path))
                labels.append(label)
            except Exception as exc:  # noqa: BLE001 - report bad audio and continue training.
                skipped.append({"file": str(path), "reason": str(exc)})

    if not rows:
        raise ValueError("No valid WAV files were found in the configured dataset folders.")

    class_counts = Counter(labels)
    if len(class_counts) < 2:
        raise ValueError("Training requires at least one valid NORMAL and one valid ABNORMAL WAV file.")

    metadata = {
        "configured_sources": {label: [str(path) for path in paths] for label, paths in sources.items()},
        "raw_file_counts": counts,
        "valid_file_counts": dict(class_counts),
        "skipped_files": skipped,
        "feature_names": get_feature_names(),
    }
    return np.vstack(rows), np.asarray(labels), metadata


def train_model(include_local_recordings: bool = False, custom_dataset_path: str | None = None) -> dict[str, Any]:
    ensure_project_dirs()
    X, y, metadata = _build_dataset(include_local_recordings=include_local_recordings, custom_dataset_path=custom_dataset_path)

    class_counts = Counter(y)
    can_stratify = min(class_counts.values()) >= 2 and X.shape[0] >= 5
    if can_stratify:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )
        evaluation_note = "Metrics are calculated on a stratified holdout set."
    else:
        X_train, X_test, y_train, y_test = X, X, y, y
        evaluation_note = "Dataset is small, so metrics are calculated on the training data."

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    classifier = RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    classifier.fit(X_train_scaled, y_train)
    y_pred = classifier.predict(X_test_scaled)

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, pos_label="ABNORMAL", zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, pos_label="ABNORMAL", zero_division=0)),
        "f1_score": float(f1_score(y_test, y_pred, pos_label="ABNORMAL", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_test, y_pred, labels=LABELS).tolist(),
        "labels": LABELS,
        "evaluation_note": evaluation_note,
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
    }

    trained_at = datetime.now(timezone.utc).isoformat()
    metadata.update(
        {
            "trained_at": trained_at,
            "include_local_recordings": include_local_recordings,
            "model_type": "RandomForestClassifier",
            "classes": [str(label) for label in classifier.classes_],
        }
    )

    joblib.dump(classifier, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    _write_json(METRICS_PATH, metrics)
    _write_json(METADATA_PATH, metadata)

    return {
        "trained": True,
        "metrics": metrics,
        "metadata": metadata,
        "model_path": str(MODEL_PATH),
        "scaler_path": str(SCALER_PATH),
    }


def predict_wav_bytes(audio_bytes: bytes) -> dict[str, Any]:
    if not audio_bytes:
        raise ValueError("Prediction audio payload is empty.")

    classifier, scaler = _load_model_bundle()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        temp_path = Path(tmp.name)

    try:
        features = extract_features_from_file(temp_path).reshape(1, -1)
    finally:
        temp_path.unlink(missing_ok=True)

    scaled = scaler.transform(features)
    prediction = str(classifier.predict(scaled)[0])

    confidence = 0.0
    probabilities: dict[str, float] = {}
    if hasattr(classifier, "predict_proba"):
        proba = classifier.predict_proba(scaled)[0]
        probabilities = {str(label): float(value) for label, value in zip(classifier.classes_, proba)}
        confidence = probabilities.get(prediction, float(np.max(proba)))
    else:
        confidence = 1.0

    normal_probability = probabilities.get("NORMAL", 1.0 if prediction == "NORMAL" else 0.0)
    return {
        "prediction": prediction,
        "confidence": round(confidence * 100, 2),
        "probabilities": {label: round(value * 100, 2) for label, value in probabilities.items()},
        "health_score": round(normal_probability * 100, 2),
    }


def save_training_recording(audio_bytes: bytes, label: str) -> dict[str, Any]:
    normalized_label = label.upper()
    if normalized_label not in LABELS:
        raise ValueError("label must be NORMAL or ABNORMAL")
    if not audio_bytes:
        raise ValueError("Recording audio payload is empty.")

    ensure_project_dirs()
    target_dir = LOCAL_NORMAL_DIR if normalized_label == "NORMAL" else LOCAL_ABNORMAL_DIR
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    target_path = target_dir / f"{normalized_label.lower()}_{timestamp}_{uuid4().hex[:8]}.wav"
    target_path.write_bytes(audio_bytes)
    return {
        "saved": True,
        "label": normalized_label,
        "path": str(target_path),
    }
