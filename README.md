# AI-Powered Fan Condition Monitoring Web Application

This project provides a complete desktop and mobile browser application for fan condition monitoring using microphone audio.

## Project Structure

```text
backend/
  app/
    audio_features.py
    config.py
    main.py
    ml_service.py
frontend/
  src/
    audio/
    components/
    App.tsx
models/
  fan_model.pkl
  scaler.pkl
dataset/
  normal/
  abnormal/
requirements.txt
```

## Backend

The FastAPI backend trains a Random Forest classifier with Scikit-Learn and Librosa features:

- MFCC
- RMS
- Zero Crossing Rate
- Spectral Centroid
- Spectral Bandwidth
- Spectral Rolloff
- Chroma

Default training dataset paths:

```text
Normal:   C:\keltron project\6_dB_fan\fan\id_00\normal
Abnormal: C:\keltron project\6_dB_fan\fan\id_00\abnormal
```

Saved outputs:

```text
models/fan_model.pkl
models/scaler.pkl
models/metrics.json
models/metadata.json
```

## Backend APIs

```text
GET  /health
GET  /model-status
POST /train
POST /predict
POST /retrain
POST /record-training-data
```

`POST /record-training-data` saves microphone WAV recordings into `dataset/normal` or `dataset/abnormal`.

## Installation

### 1. Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Optional backend configuration:

```powershell
Copy-Item backend\.env.example backend\.env
```

If your dataset folders change, set these environment variables before running FastAPI:

```powershell
$env:FAN_NORMAL_DATASET="C:\keltron project\6_dB_fan\fan\id_00\normal"
$env:FAN_ABNORMAL_DATASET="C:\keltron project\6_dB_fan\fan\id_00\abnormal"
```

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

## Run Instructions

### Start Backend

From the project root:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Open API docs:

```text
http://localhost:8000/docs
```

### Start Frontend

In another terminal:

```powershell
cd frontend
npm run dev
```

Open the app:

```text
http://localhost:5173
```

## Workflow

1. Accept the microphone privacy policy.
2. Allow microphone permission in the browser.
3. Click `Train Model` to train from the configured fan dataset.
4. Click `Start Monitoring` to stream microphone audio.
5. Review waveform, FFT spectrum, amplitude, dominant frequency, prediction, confidence, and health score.
6. Choose `NORMAL` or `ABNORMAL`, record new training audio, then click `Retrain Model`.

## Notes

- Browser microphone access generally requires `localhost` or HTTPS.
- Real-time prediction sends two-second WAV windows to the local backend.
- Recorded training audio is stored under `dataset/normal` and `dataset/abnormal`.
- The backend returns accuracy, precision, recall, F1 score, and confusion matrix after training.
