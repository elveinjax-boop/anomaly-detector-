from __future__ import annotations

import json
import tempfile
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator
from uuid import uuid4

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

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

# ── Optional XGBoost ────────────────────────────────────────────────────────────
try:
    from xgboost import XGBClassifier  # type: ignore[import-untyped]

    _HAS_XGBOOST = True
except ImportError:
    _HAS_XGBOOST = False

LABELS = ["NORMAL", "ABNORMAL"]

# ── Algorithm Registry ──────────────────────────────────────────────────────────

ALGORITHM_REGISTRY: dict[str, dict[str, Any]] = {
    "random_forest": {
        "name": "Random Forest",
        "description": "Ensemble of decision trees — robust and accurate for most tasks.",
        "incremental": False,
    },
    "decision_tree": {
        "name": "Decision Tree",
        "description": "Single tree classifier — fast, interpretable, but can overfit.",
        "incremental": False,
    },
    "svm": {
        "name": "Support Vector Machine",
        "description": "Finds the optimal hyperplane to separate classes.",
        "incremental": False,
    },
    "knn": {
        "name": "K-Nearest Neighbors",
        "description": "Classifies by majority vote of the nearest neighbours.",
        "incremental": False,
    },
    "logistic_regression": {
        "name": "Logistic Regression",
        "description": "Linear model for classification — fast and interpretable.",
        "incremental": False,
    },
    "naive_bayes": {
        "name": "Naive Bayes",
        "description": "Probabilistic classifier — supports incremental learning.",
        "incremental": True,
    },
    "gradient_boosting": {
        "name": "Gradient Boosting",
        "description": "Sequential ensemble — typically achieves high accuracy.",
        "incremental": False,
    },
    "sgd": {
        "name": "SGD Classifier",
        "description": "Stochastic Gradient Descent — supports incremental learning.",
        "incremental": True,
    },
}

if _HAS_XGBOOST:
    ALGORITHM_REGISTRY["xgboost"] = {
        "name": "XGBoost",
        "description": "Extreme Gradient Boosting — powerful and efficient.",
        "incremental": False,
    }


def get_available_algorithms() -> list[dict[str, Any]]:
    """Return the list of supported algorithms with metadata."""
    return [
        {"key": key, **info}
        for key, info in ALGORITHM_REGISTRY.items()
    ]


def _create_classifier(algorithm: str) -> Any:
    """Factory function that maps an algorithm key to a scikit-learn estimator."""
    factories = {
        "random_forest": lambda: RandomForestClassifier(
            n_estimators=300, class_weight="balanced", random_state=42, n_jobs=-1,
        ),
        "decision_tree": lambda: DecisionTreeClassifier(
            class_weight="balanced", random_state=42,
        ),
        "svm": lambda: SVC(
            kernel="rbf", probability=True, class_weight="balanced", random_state=42,
        ),
        "knn": lambda: KNeighborsClassifier(n_neighbors=5, n_jobs=-1),
        "logistic_regression": lambda: LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=42, n_jobs=-1,
        ),
        "naive_bayes": lambda: GaussianNB(),
        "gradient_boosting": lambda: GradientBoostingClassifier(
            n_estimators=200, random_state=42,
        ),
        "sgd": lambda: SGDClassifier(
            loss="modified_huber", class_weight="balanced",
            random_state=42, max_iter=1000, tol=1e-3,
        ),
    }
    if _HAS_XGBOOST:
        factories["xgboost"] = lambda: XGBClassifier(
            n_estimators=200, use_label_encoder=False,
            eval_metric="logloss", random_state=42, n_jobs=-1,
        )

    factory = factories.get(algorithm.lower())
    if factory is None:
        raise ValueError(f"Unknown algorithm: {algorithm}. Available: {list(factories.keys())}")
    return factory()


# ── Errors ──────────────────────────────────────────────────────────────────────

class ModelNotReadyError(RuntimeError):
    """Raised when prediction is requested before a model exists."""


class TrainingCancelledError(RuntimeError):
    """Raised when training is cancelled by the user."""


# ── JSON helpers ────────────────────────────────────────────────────────────────

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


# ── Model loading ──────────────────────────────────────────────────────────────

def _load_model_bundle() -> tuple[Any, StandardScaler]:
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


# ── Dataset building ───────────────────────────────────────────────────────────

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


def _build_dataset(
    include_local_recordings: bool,
    custom_dataset_path: str | None = None,
    cancel_event: threading.Event | None = None,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    sources = _dataset_sources(include_local_recordings, custom_dataset_path)
    rows: list[np.ndarray] = []
    labels: list[str] = []
    skipped: list[dict[str, str]] = []
    counts: dict[str, int] = {}

    for label, directories in sources.items():
        files = wav_files(directories)
        counts[label] = len(files)
        for path in files:
            if cancel_event and cancel_event.is_set():
                raise TrainingCancelledError("Training cancelled by user.")
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


# ── Global training state ──────────────────────────────────────────────────────

_training_lock = threading.Lock()
_training_cancel_event: threading.Event | None = None
_training_state: dict[str, Any] = {
    "status": "idle",       # idle | running | completed | error | cancelled
    "progress": 0,
    "stage": "",
    "algorithm": "",
    "started_at": None,
    "result": None,
    "error": None,
}


def get_training_state() -> dict[str, Any]:
    """Return a snapshot of the current training state."""
    with _training_lock:
        return dict(_training_state)


def request_cancel_training() -> bool:
    """Signal cancellation. Returns True if training was running."""
    global _training_cancel_event
    with _training_lock:
        if _training_state["status"] == "running" and _training_cancel_event is not None:
            _training_cancel_event.set()
            return True
    return False


def _update_state(**kwargs: Any) -> None:
    with _training_lock:
        _training_state.update(kwargs)


# ── Streaming (SSE) training ───────────────────────────────────────────────────

def _sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE message."""
    payload = json.dumps(_json_safe(data))
    return f"event: {event}\ndata: {payload}\n\n"


def train_model_streaming(
    include_local_recordings: bool = False,
    custom_dataset_path: str | None = None,
    algorithm: str = "random_forest",
    test_size: float = 0.2,
) -> Generator[str, None, None]:
    """Generator that yields SSE events as training progresses."""
    global _training_cancel_event

    # Guard against concurrent training
    with _training_lock:
        if _training_state["status"] == "running":
            yield _sse_event("error", {"message": "Another training session is already running."})
            return
        _training_cancel_event = threading.Event()
        cancel = _training_cancel_event

    algo_info = ALGORITHM_REGISTRY.get(algorithm.lower(), {})
    algo_display = algo_info.get("name", algorithm)

    _update_state(
        status="running", progress=0, stage="initializing",
        algorithm=algo_display, started_at=time.time(),
        result=None, error=None,
    )

    yield _sse_event("progress", {
        "stage": "initializing", "percent": 5,
        "algorithm": algo_display, "message": "Preparing training pipeline…",
    })

    try:
        ensure_project_dirs()

        # ── Stage 1: Load data ──────────────────────────────────────────────
        _update_state(stage="loading_data", progress=10)
        yield _sse_event("progress", {
            "stage": "loading_data", "percent": 10,
            "algorithm": algo_display, "message": "Loading and extracting audio features…",
        })

        X, y, metadata = _build_dataset(
            include_local_recordings=include_local_recordings,
            custom_dataset_path=custom_dataset_path,
            cancel_event=cancel,
        )

        if cancel.is_set():
            raise TrainingCancelledError("Training cancelled by user.")

        # ── Stage 2: Split ──────────────────────────────────────────────────
        _update_state(stage="splitting", progress=25)
        yield _sse_event("progress", {
            "stage": "splitting", "percent": 25,
            "algorithm": algo_display, "message": "Splitting dataset…",
        })

        test_size = max(0.05, min(0.5, test_size))
        class_counts = Counter(y)
        can_stratify = min(class_counts.values()) >= 2 and X.shape[0] >= 5

        if can_stratify:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42, stratify=y,
            )
            train_pct = round((1 - test_size) * 100)
            test_pct = round(test_size * 100)
            evaluation_note = f"Metrics on a stratified holdout set ({train_pct}% train / {test_pct}% test)."
        else:
            X_train, X_test, y_train, y_test = X, X, y, y
            evaluation_note = "Dataset is small; metrics calculated on all training data."

        if cancel.is_set():
            raise TrainingCancelledError("Training cancelled by user.")

        # ── Stage 3: Scale ──────────────────────────────────────────────────
        _update_state(stage="scaling", progress=35)
        yield _sse_event("progress", {
            "stage": "scaling", "percent": 35,
            "algorithm": algo_display, "message": "Scaling features…",
        })

        is_incremental_algo = algo_info.get("incremental", False)
        incremental = False
        compatible = False

        if is_incremental_algo and MODEL_PATH.exists():
            try:
                existing = joblib.load(MODEL_PATH)
                compatible = (
                    (algorithm.lower() == "sgd" and isinstance(existing, SGDClassifier))
                    or (algorithm.lower() == "naive_bayes" and isinstance(existing, GaussianNB))
                )
            except Exception:
                compatible = False

        if compatible and SCALER_PATH.exists():
            try:
                scaler = joblib.load(SCALER_PATH)
                scaler.partial_fit(X_train)
                X_train_scaled = scaler.transform(X_train)
                X_test_scaled = scaler.transform(X_test)
            except Exception:
                scaler = StandardScaler()
                X_train_scaled = scaler.fit_transform(X_train)
                X_test_scaled = scaler.transform(X_test)
                compatible = False
        else:
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)

        if cancel.is_set():
            raise TrainingCancelledError("Training cancelled by user.")

        # ── Stage 4: Train ──────────────────────────────────────────────────
        _update_state(stage="training", progress=45)
        yield _sse_event("progress", {
            "stage": "training", "percent": 45,
            "algorithm": algo_display, "message": f"Training {algo_display}…",
        })

        if compatible:
            classifier = existing
            classifier.partial_fit(X_train_scaled, y_train, classes=LABELS)
            incremental = True
            evaluation_note += " (Incremental update applied.)"
        else:
            classifier = _create_classifier(algorithm)
            classifier.fit(X_train_scaled, y_train)

        model_type = type(classifier).__name__

        if cancel.is_set():
            raise TrainingCancelledError("Training cancelled by user.")

        # ── Stage 5: Evaluate ───────────────────────────────────────────────
        _update_state(stage="evaluating", progress=75)
        yield _sse_event("progress", {
            "stage": "evaluating", "percent": 75,
            "algorithm": algo_display, "message": "Evaluating model performance…",
        })

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
            "algorithm": model_type,
        }

        if cancel.is_set():
            raise TrainingCancelledError("Training cancelled by user.")

        # ── Stage 6: Save ───────────────────────────────────────────────────
        _update_state(stage="saving", progress=90)
        yield _sse_event("progress", {
            "stage": "saving", "percent": 90,
            "algorithm": algo_display, "message": "Saving model and metadata…",
        })

        trained_at = datetime.now(timezone.utc).isoformat()
        metadata.update({
            "trained_at": trained_at,
            "include_local_recordings": include_local_recordings,
            "model_type": model_type,
            "algorithm": algorithm,
            "test_size": test_size,
            "incremental": incremental,
            "classes": [str(label) for label in classifier.classes_],
        })

        joblib.dump(classifier, MODEL_PATH)
        joblib.dump(scaler, SCALER_PATH)
        _write_json(METRICS_PATH, metrics)
        _write_json(METADATA_PATH, metadata)

        result = {
            "trained": True,
            "metrics": metrics,
            "metadata": metadata,
            "model_path": str(MODEL_PATH),
            "scaler_path": str(SCALER_PATH),
        }

        _update_state(status="completed", progress=100, stage="complete", result=result)
        yield _sse_event("complete", result)

    except TrainingCancelledError:
        _update_state(status="cancelled", progress=0, stage="cancelled", error="Training cancelled by user.")
        yield _sse_event("cancelled", {"message": "Training cancelled by user."})
    except Exception as exc:
        _update_state(status="error", progress=0, stage="error", error=str(exc))
        yield _sse_event("error", {"message": str(exc)})
    finally:
        with _training_lock:
            _training_cancel_event = None


# ── Synchronous training (preserved for backward compatibility) ────────────────

def train_model(
    include_local_recordings: bool = False,
    custom_dataset_path: str | None = None,
    algorithm: str = "random_forest",
    test_size: float = 0.2,
) -> dict[str, Any]:
    ensure_project_dirs()
    X, y, metadata = _build_dataset(
        include_local_recordings=include_local_recordings,
        custom_dataset_path=custom_dataset_path,
    )

    test_size = max(0.05, min(0.5, test_size))
    class_counts = Counter(y)
    can_stratify = min(class_counts.values()) >= 2 and X.shape[0] >= 5

    if can_stratify:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y,
        )
        train_pct = round((1 - test_size) * 100)
        test_pct = round(test_size * 100)
        evaluation_note = f"Metrics on a stratified holdout set ({train_pct}% train / {test_pct}% test)."
    else:
        X_train, X_test, y_train, y_test = X, X, y, y
        evaluation_note = "Dataset is small; metrics calculated on all training data."

    is_incremental_algo = ALGORITHM_REGISTRY.get(algorithm.lower(), {}).get("incremental", False)
    incremental = False
    compatible = False

    if is_incremental_algo and MODEL_PATH.exists():
        try:
            existing = joblib.load(MODEL_PATH)
            compatible = (
                (algorithm.lower() == "sgd" and isinstance(existing, SGDClassifier))
                or (algorithm.lower() == "naive_bayes" and isinstance(existing, GaussianNB))
            )
        except Exception:
            compatible = False

    if compatible and SCALER_PATH.exists():
        try:
            scaler = joblib.load(SCALER_PATH)
            scaler.partial_fit(X_train)
            X_train_scaled = scaler.transform(X_train)
            X_test_scaled = scaler.transform(X_test)
        except Exception:
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)
            compatible = False
    else:
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

    if compatible:
        classifier = existing
        classifier.partial_fit(X_train_scaled, y_train, classes=LABELS)
        incremental = True
        evaluation_note += " (Incremental update applied.)"
    else:
        classifier = _create_classifier(algorithm)
        classifier.fit(X_train_scaled, y_train)

    model_type = type(classifier).__name__
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
        "algorithm": model_type,
    }

    trained_at = datetime.now(timezone.utc).isoformat()
    metadata.update({
        "trained_at": trained_at,
        "include_local_recordings": include_local_recordings,
        "model_type": model_type,
        "algorithm": algorithm,
        "test_size": test_size,
        "incremental": incremental,
        "classes": [str(label) for label in classifier.classes_],
    })

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


# ── Prediction ─────────────────────────────────────────────────────────────────

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


def predict_batch(folder_path: str) -> dict[str, Any]:
    """Run predictions on all WAV files in a folder using the saved model."""
    classifier, scaler = _load_model_bundle()
    directory = Path(folder_path)

    if not directory.exists():
        raise ValueError(f"Folder does not exist: {folder_path}")

    files = wav_files([directory])
    if not files:
        raise ValueError(f"No WAV files found in: {folder_path}")

    results: list[dict[str, Any]] = []
    for path in files:
        try:
            features = extract_features_from_file(path).reshape(1, -1)
            scaled = scaler.transform(features)
            pred = str(classifier.predict(scaled)[0])

            confidence = 0.0
            probabilities: dict[str, float] = {}
            if hasattr(classifier, "predict_proba"):
                proba = classifier.predict_proba(scaled)[0]
                probabilities = {str(label): float(value) for label, value in zip(classifier.classes_, proba)}
                confidence = probabilities.get(pred, float(np.max(proba)))
            else:
                confidence = 1.0

            normal_prob = probabilities.get("NORMAL", 1.0 if pred == "NORMAL" else 0.0)
            results.append({
                "file": path.name,
                "path": str(path),
                "prediction": pred,
                "confidence": round(confidence * 100, 2),
                "health_score": round(normal_prob * 100, 2),
                "probabilities": {label: round(value * 100, 2) for label, value in probabilities.items()},
            })
        except Exception as exc:  # noqa: BLE001
            results.append({
                "file": path.name,
                "path": str(path),
                "prediction": "ERROR",
                "confidence": 0.0,
                "health_score": 0.0,
                "probabilities": {},
                "error": str(exc),
            })

    normal_count = sum(1 for r in results if r["prediction"] == "NORMAL")
    abnormal_count = sum(1 for r in results if r["prediction"] == "ABNORMAL")
    error_count = sum(1 for r in results if r["prediction"] == "ERROR")
    avg_confidence = (
        sum(r["confidence"] for r in results if r["prediction"] != "ERROR")
        / max(1, len(results) - error_count)
    )

    return {
        "total_files": len(results),
        "normal_count": normal_count,
        "abnormal_count": abnormal_count,
        "error_count": error_count,
        "average_confidence": round(avg_confidence, 2),
        "results": results,
    }


# ── Training data recording ───────────────────────────────────────────────────

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
