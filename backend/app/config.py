from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
MODELS_DIR = Path(os.getenv("FAN_MODELS_DIR", PROJECT_ROOT / "models"))
DATASET_DIR = Path(os.getenv("FAN_LOCAL_DATASET_DIR", PROJECT_ROOT / "dataset"))

DEFAULT_NORMAL_DIR = Path(
    os.getenv(
        "FAN_NORMAL_DATASET",
        r"C:\keltron project\6_dB_fan\fan\id_00\normal",
    )
)
DEFAULT_ABNORMAL_DIR = Path(
    os.getenv(
        "FAN_ABNORMAL_DATASET",
        r"C:\keltron project\6_dB_fan\fan\id_00\abnormal",
    )
)

LOCAL_NORMAL_DIR = DATASET_DIR / "normal"
LOCAL_ABNORMAL_DIR = DATASET_DIR / "abnormal"

MODEL_PATH = MODELS_DIR / "fan_model.pkl"
SCALER_PATH = MODELS_DIR / "scaler.pkl"
METRICS_PATH = MODELS_DIR / "metrics.json"
METADATA_PATH = MODELS_DIR / "metadata.json"

SAMPLE_RATE = int(os.getenv("FAN_SAMPLE_RATE", "22050"))
MIN_AUDIO_SECONDS = float(os.getenv("FAN_MIN_AUDIO_SECONDS", "0.5"))
PREDICTION_WINDOW_SECONDS = float(os.getenv("FAN_PREDICTION_WINDOW_SECONDS", "2.0"))

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FAN_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]


def ensure_project_dirs() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_NORMAL_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_ABNORMAL_DIR.mkdir(parents=True, exist_ok=True)
