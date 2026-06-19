from __future__ import annotations

from pathlib import Path
from typing import Iterable

import librosa
import numpy as np

from .config import MIN_AUDIO_SECONDS, SAMPLE_RATE


N_MFCC = 20
N_CHROMA = 12


def _stats(values: np.ndarray, prefix: str, names: list[str], output: list[float]) -> None:
    matrix = np.atleast_2d(values)
    for index, row in enumerate(matrix):
        names.append(f"{prefix}_{index + 1}_mean")
        output.append(float(np.mean(row)))
        names.append(f"{prefix}_{index + 1}_std")
        output.append(float(np.std(row)))


def get_feature_names() -> list[str]:
    names: list[str] = []
    values: list[float] = []
    _stats(np.zeros((N_MFCC, 1)), "mfcc", names, values)
    for feature_name in ["rms", "zcr", "spectral_centroid", "spectral_bandwidth", "spectral_rolloff"]:
        _stats(np.zeros((1, 1)), feature_name, names, values)
    _stats(np.zeros((N_CHROMA, 1)), "chroma", names, values)
    return names


def load_audio(path: Path, sample_rate: int = SAMPLE_RATE) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(path, sr=sample_rate, mono=True)
    if y.size == 0:
        raise ValueError(f"Audio file is empty: {path}")

    minimum_length = max(1, int(sample_rate * MIN_AUDIO_SECONDS))
    if y.size < minimum_length:
        y = librosa.util.fix_length(y, size=minimum_length)
    return y.astype(np.float32), sr


def extract_features_from_array(y: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    if y.size == 0:
        raise ValueError("Cannot extract features from empty audio.")

    # Normalize only when needed so quiet-but-valid recordings keep their shape.
    peak = float(np.max(np.abs(y)))
    if peak > 1.0:
        y = y / peak

    n_fft = min(2048, max(256, int(2 ** np.floor(np.log2(max(y.size, 256))))))
    hop_length = max(128, n_fft // 4)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=n_fft, hop_length=hop_length)
    rms = librosa.feature.rms(y=y, frame_length=n_fft, hop_length=hop_length)
    zcr = librosa.feature.zero_crossing_rate(y, frame_length=n_fft, hop_length=hop_length)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length)
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length)
    chroma = librosa.feature.chroma_stft(
        y=y,
        sr=sr,
        n_chroma=N_CHROMA,
        n_fft=n_fft,
        hop_length=hop_length,
    )

    names: list[str] = []
    features: list[float] = []
    _stats(mfcc, "mfcc", names, features)
    _stats(rms, "rms", names, features)
    _stats(zcr, "zcr", names, features)
    _stats(centroid, "spectral_centroid", names, features)
    _stats(bandwidth, "spectral_bandwidth", names, features)
    _stats(rolloff, "spectral_rolloff", names, features)
    _stats(chroma, "chroma", names, features)

    vector = np.asarray(features, dtype=np.float32)
    if not np.all(np.isfinite(vector)):
        vector = np.nan_to_num(vector, nan=0.0, posinf=0.0, neginf=0.0)
    return vector


def extract_features_from_file(path: Path, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    y, sr = load_audio(path, sample_rate)
    return extract_features_from_array(y, sr)


def wav_files(paths: Iterable[Path]) -> list[Path]:
    files: list[Path] = []
    for directory in paths:
        if directory.exists():
            files.extend(path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() == ".wav")
    return sorted(files)
