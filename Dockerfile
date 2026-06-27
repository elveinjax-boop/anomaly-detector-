FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for audio loading (librosa/soundfile)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app and model directories
COPY backend /app/backend
COPY models /app/models

# Expose default port for Hugging Face/Docker container
EXPOSE 7860

# Run FastAPI app
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "7860"]
