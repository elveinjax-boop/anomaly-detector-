import {
  Activity,
  AudioWaveform,
  BadgeCheck,
  BrainCircuit,
  CircleStop,
  Gauge,
  HeartPulse,
  Mic,
  MicOff,
  Play,
  Save,
  ScanSearch,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { getHealth, predictAudio, saveTrainingRecording } from "./api";
import { mergeFloat32, encodeWav } from "./audio/wav";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { BatchDashboard } from "./components/BatchDashboard";
import { MetricTile } from "./components/MetricTile";
import { MetricsPanel } from "./components/MetricsPanel";
import { PredictionPanel } from "./components/PredictionPanel";
import { PrivacyPage } from "./components/PrivacyPage";
import { StatusBadge } from "./components/StatusBadge";
import { TrainingConfigPanel } from "./components/TrainingConfigPanel";
import { TrainingProgressOverlay } from "./components/TrainingProgressOverlay";
import { TrainingProvider, useTraining } from "./context/TrainingContext";
import type { AudioSnapshot } from "./audio/analysis";
import type { PredictionResult } from "./types";

const PRIVACY_KEY = "fan-monitor-privacy-accepted";
const MIN_RECORDING_SECONDS = 0.5;

type MicStatus = "not-requested" | "requesting" | "granted" | "denied" | "stopped" | "error";
type Label = "NORMAL" | "ABNORMAL";
type TabKey = "live" | "batch" | "predict";

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function AppInner(): JSX.Element {
  const training = useTraining();
  const [privacyAccepted, setPrivacyAccepted] = useState(() => localStorage.getItem(PRIVACY_KEY) === "true");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [snapshot, setSnapshot] = useState<AudioSnapshot>({ amplitude: 0, dominantFrequency: 0 });
  const [micStatus, setMicStatus] = useState<MicStatus>("not-requested");
  const [hasAudioSession, setHasAudioSession] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordLabel, setRecordLabel] = useState<Label>("NORMAL");
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sampleRate, setSampleRate] = useState(44100);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [serviceMessage, setServiceMessage] = useState("Ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("live");

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionTimerRef = useRef<number | null>(null);
  const predictingRef = useRef(false);
  const monitoringRef = useRef(false);
  const recordingRef = useRef(false);
  const sampleRateRef = useRef(44100);
  const predictionBuffersRef = useRef<Float32Array[]>([]);
  const predictionLengthRef = useRef(0);
  const recordingBuffersRef = useRef<Float32Array[]>([]);
  const recordingLengthRef = useRef(0);

  useEffect(() => {
    monitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    recordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialStatus() {
      try {
        await getHealth();
        if (!cancelled) {
          setBackendOnline(true);
        }
      } catch (error) {
        if (!cancelled) {
          setBackendOnline(false);
          setErrorMessage(getErrorMessage(error));
        }
      }
    }

    if (privacyAccepted) {
      void loadInitialStatus();
    }

    return () => {
      cancelled = true;
    };
  }, [privacyAccepted]);

  useEffect(() => {
    if (!isRecording || recordingStartedAt === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setRecordingSeconds((Date.now() - recordingStartedAt) / 1000);
    }, 250);

    return () => window.clearInterval(timer);
  }, [isRecording, recordingStartedAt]);

  useEffect(() => {
    return () => {
      stopPredictionLoop();
      releaseAudioSession();
    };
  }, []);

  const handleSnapshot = useCallback((nextSnapshot: AudioSnapshot) => {
    setSnapshot(nextSnapshot);
  }, []);

  function acceptPrivacy() {
    localStorage.setItem(PRIVACY_KEY, "true");
    setPrivacyAccepted(true);
  }

  async function ensureAudioSession(): Promise<AudioContext> {
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      return audioContextRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("error");
      throw new Error("Microphone capture is not supported in this browser.");
    }

    const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      setMicStatus("error");
      throw new Error("Web Audio API is not supported in this browser.");
    }

    setMicStatus("requesting");
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      const context = new AudioContextCtor();
      await context.resume();

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.78;

      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      processor.onaudioprocess = (event) => {
        if (!monitoringRef.current && !recordingRef.current) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input);

        if (monitoringRef.current) {
          predictionBuffersRef.current.push(copy);
          predictionLengthRef.current += copy.length;
        }

        if (recordingRef.current) {
          recordingBuffersRef.current.push(copy);
          recordingLengthRef.current += copy.length;
        }
      };

      audioContextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      processorRef.current = processor;
      silentGainRef.current = silentGain;
      streamRef.current = stream;
      sampleRateRef.current = context.sampleRate;

      setSampleRate(context.sampleRate);
      setAnalyserNode(analyser);
      setHasAudioSession(true);
      setMicStatus("granted");
      setServiceMessage("Microphone active");
      return context;
    } catch (error) {
      setMicStatus(getErrorName(error) === "NotAllowedError" ? "denied" : "error");
      throw error;
    }
  }

  function releaseAudioSession() {
    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    void audioContextRef.current?.close();

    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    silentGainRef.current = null;
    streamRef.current = null;
    predictionBuffersRef.current = [];
    predictionLengthRef.current = 0;
    recordingBuffersRef.current = [];
    recordingLengthRef.current = 0;

    setHasAudioSession(false);
    setAnalyserNode(null);
    setMicStatus((current) => (current === "denied" ? "denied" : "stopped"));
  }

  function stopPredictionLoop() {
    if (predictionTimerRef.current !== null) {
      window.clearInterval(predictionTimerRef.current);
      predictionTimerRef.current = null;
    }
  }

  function consumeBuffers(buffers: MutableRefObject<Float32Array[]>, length: MutableRefObject<number>) {
    const totalLength = length.current;
    if (totalLength === 0) {
      return new Float32Array();
    }
    const samples = mergeFloat32(buffers.current, totalLength);
    buffers.current = [];
    length.current = 0;
    return samples;
  }

  async function runPredictionWindow() {
    if (predictingRef.current) {
      return;
    }

    const samples = consumeBuffers(predictionBuffersRef, predictionLengthRef);
    if (samples.length < sampleRateRef.current * MIN_RECORDING_SECONDS) {
      return;
    }

    predictingRef.current = true;
    setIsPredicting(true);
    try {
      const blob = encodeWav(samples, sampleRateRef.current);
      const result = await predictAudio(blob);
      setPrediction(result);
      setBackendOnline(true);
      setErrorMessage(null);
      setServiceMessage("Prediction updated");
    } catch (error) {
      setBackendOnline(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      predictingRef.current = false;
      setIsPredicting(false);
    }
  }

  function startPredictionLoop() {
    stopPredictionLoop();
    predictionTimerRef.current = window.setInterval(() => {
      void runPredictionWindow();
    }, 2000);
  }

  async function enableMicrophone() {
    try {
      await ensureAudioSession();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function startMonitoring() {
    try {
      await ensureAudioSession();
      predictionBuffersRef.current = [];
      predictionLengthRef.current = 0;
      setIsMonitoring(true);
      startPredictionLoop();
      setServiceMessage("Monitoring");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function stopMonitoring() {
    setIsMonitoring(false);
    monitoringRef.current = false;
    stopPredictionLoop();
    setIsPredicting(false);
    predictionBuffersRef.current = [];
    predictionLengthRef.current = 0;
    if (!recordingRef.current) {
      releaseAudioSession();
    }
    setServiceMessage("Monitoring stopped");
  }

  async function toggleRecording() {
    if (isRecording) {
      await stopAndSaveRecording();
      return;
    }

    try {
      await ensureAudioSession();
      recordingBuffersRef.current = [];
      recordingLengthRef.current = 0;
      setRecordingStartedAt(Date.now());
      setRecordingSeconds(0);
      setIsRecording(true);
      setServiceMessage(`Recording ${recordLabel}`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function stopAndSaveRecording() {
    setIsRecording(false);
    recordingRef.current = false;
    setRecordingStartedAt(null);

    const samples = consumeBuffers(recordingBuffersRef, recordingLengthRef);
    if (samples.length < sampleRateRef.current * MIN_RECORDING_SECONDS) {
      setErrorMessage("Recording is too short to save.");
      if (!monitoringRef.current) {
        releaseAudioSession();
      }
      return;
    }

    try {
      const blob = encodeWav(samples, sampleRateRef.current);
      const result = await saveTrainingRecording(blob, recordLabel);
      setServiceMessage(`${result.label} recording saved`);
      setErrorMessage(null);
      await training.refreshModelStatus();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRecordingSeconds(0);
      if (!monitoringRef.current) {
        releaseAudioSession();
      }
    }
  }

  if (!privacyAccepted) {
    return <PrivacyPage onAccept={acceptPrivacy} />;
  }

  const currentMetrics = training.trainingMetrics ?? training.modelStatus?.metrics ?? null;
  const modelReady = Boolean(training.modelStatus?.trained);
  const modelDetail = training.modelStatus?.metadata?.trained_at ? `Updated ${formatDate(training.modelStatus.metadata.trained_at)}` : "No saved model";
  const predictionTone = prediction?.prediction === "ABNORMAL" ? "red" : prediction?.prediction === "NORMAL" ? "green" : "plain";
  const isTrainingActive = training.status === "running";

  const tabs: { key: TabKey; label: string; icon?: JSX.Element }[] = [
    { key: "live", label: "Live Monitoring" },
    { key: "batch", label: "Train & Configure" },
    { key: "predict", label: "Predict", icon: <ScanSearch size={14} /> },
  ];

  return (
    <main className="min-h-screen text-stone-200">
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-app-accent shadow-[0_0_10px_rgba(14,165,233,0.8)]" />
                Fan Condition Monitor
              </h1>
              <StatusBadge tone={backendOnline ? "success" : backendOnline === false ? "danger" : "neutral"}>
                API {backendOnline ? "Online" : backendOnline === false ? "Offline" : "Checking"}
              </StatusBadge>
              <StatusBadge tone={micBadgeTone(micStatus)}>{micStatusLabel(micStatus)}</StatusBadge>
              {isTrainingActive && (
                <StatusBadge tone="warning">Training {training.progress}%</StatusBadge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="command-button bg-white/5 text-stone-300 hover:text-white"
              type="button"
              title="Enable microphone"
              disabled={hasAudioSession || micStatus === "requesting"}
              onClick={enableMicrophone}
            >
              <Mic size={18} aria-hidden="true" />
              Enable Mic
            </button>
            <button
              className="command-button border-app-success/50 bg-app-success/10 text-app-success shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-app-success/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              type="button"
              title="Start monitoring"
              disabled={isMonitoring}
              onClick={startMonitoring}
            >
              <Play size={18} aria-hidden="true" />
              Start Monitoring
            </button>
            <button
              className="command-button border-white/20 bg-white/10 text-white hover:bg-white/20"
              type="button"
              title="Stop monitoring"
              disabled={!isMonitoring && !hasAudioSession}
              onClick={stopMonitoring}
            >
              <CircleStop size={18} aria-hidden="true" />
              Stop Monitoring
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-white/5 bg-black/20">
        <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 sm:px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-app-accent text-white"
                  : "border-transparent text-stone-400 hover:text-stone-200"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "live" ? (
        <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Model Status"
                value={modelReady ? "Ready" : "Not Trained"}
                detail={modelDetail}
                icon={<BrainCircuit size={22} aria-hidden="true" />}
                tone={modelReady ? "green" : "amber"}
              />
              <MetricTile
                label="Prediction"
                value={prediction?.prediction ?? "Waiting"}
                detail={isPredicting ? "Analyzing audio" : "2 second window"}
                icon={<Activity size={22} aria-hidden="true" />}
                tone={predictionTone}
              />
              <MetricTile
                label="Confidence"
                value={prediction ? `${prediction.confidence.toFixed(1)}%` : "0.0%"}
                detail={prediction ? probabilityDetail(prediction) : "No prediction yet"}
                icon={<BadgeCheck size={22} aria-hidden="true" />}
                tone="cyan"
              />
              <MetricTile
                label="Health Score"
                value={prediction ? `${prediction.health_score.toFixed(1)}%` : "0.0%"}
                detail={prediction?.prediction === "ABNORMAL" ? "Inspection recommended" : "Normal probability"}
                icon={<HeartPulse size={22} aria-hidden="true" />}
                tone={prediction?.prediction === "ABNORMAL" ? "red" : "green"}
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Amplitude"
                value={snapshot.amplitude.toFixed(3)}
                detail={isMonitoring ? "RMS level" : "Idle"}
                icon={<AudioWaveform size={22} aria-hidden="true" />}
                tone="plain"
              />
              <MetricTile
                label="Dominant Frequency"
                value={`${snapshot.dominantFrequency.toFixed(1)} Hz`}
                detail={`${sampleRate.toLocaleString()} Hz sample rate`}
                icon={<Gauge size={22} aria-hidden="true" />}
                tone="plain"
              />
            </section>

            <AudioVisualizer analyser={analyserNode} active={hasAudioSession} sampleRate={sampleRate} onSnapshot={handleSnapshot} />

            <MetricsPanel metrics={currentMetrics} />
          </div>

          <aside className="space-y-5">
            {/* Training Data Recording */}
            <section className="glass-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white tracking-wide uppercase">Training Data</h2>
                <StatusBadge tone={isRecording ? "danger" : "neutral"}>{isRecording ? `${recordingSeconds.toFixed(1)}s` : "Idle"}</StatusBadge>
              </div>

              <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                <button
                  className={`min-h-11 px-3 text-sm font-semibold transition-colors ${recordLabel === "NORMAL" ? "bg-app-success/20 text-app-success" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                  type="button"
                  disabled={isRecording}
                  onClick={() => setRecordLabel("NORMAL")}
                >
                  NORMAL
                </button>
                <button
                  className={`min-h-11 border-l border-white/10 px-3 text-sm font-semibold transition-colors ${recordLabel === "ABNORMAL" ? "bg-app-danger/20 text-app-danger" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                  type="button"
                  disabled={isRecording}
                  onClick={() => setRecordLabel("ABNORMAL")}
                >
                  ABNORMAL
                </button>
              </div>

              <button
                className={`command-button mt-4 w-full justify-center ${isRecording ? "border-app-danger/50 bg-app-danger/10 text-app-danger shadow-[0_0_15px_rgba(244,63,94,0.2)] hover:bg-app-danger/20" : "bg-white/5 text-stone-300 hover:text-white"}`}
                type="button"
                title="Record training data"
                disabled={isTrainingActive}
                onClick={() => void toggleRecording()}
              >
                {isRecording ? <MicOff size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                {isRecording ? "Stop & Save" : "Record Training Data"}
              </button>
            </section>

            {/* Runtime Info */}
            <section className="glass-panel p-5">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">Runtime</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoRow label="Monitoring" value={isMonitoring ? "Running" : "Stopped"} />
                <InfoRow label="Predicting" value={isPredicting ? "Active" : "Idle"} />
                <InfoRow label="Microphone" value={micStatusLabel(micStatus)} />
                <InfoRow label="Training" value={isTrainingActive ? `${training.algorithm} (${training.progress}%)` : "Idle"} />
                <InfoRow label="Status" value={serviceMessage} />
              </dl>
              {errorMessage ? (
                <div className="mt-4 rounded-lg border border-app-danger/30 bg-app-danger/10 p-3 text-sm text-app-danger shadow-[0_0_15px_rgba(244,63,94,0.15)]">{errorMessage}</div>
              ) : null}
            </section>
          </aside>
        </div>
      ) : activeTab === "batch" ? (
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Left: Batch upload / folder training */}
          <BatchDashboard onModelUpdated={training.refreshModelStatus} />
          {/* Right: Training config panel */}
          <div>
            <TrainingConfigPanel />
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <PredictionPanel />
        </div>
      )}

      {/* Floating training progress — persists across tabs */}
      <TrainingProgressOverlay />
    </main>
  );
}

export default function App(): JSX.Element {
  return (
    <TrainingProvider>
      <AppInner />
    </TrainingProvider>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <dt className="text-stone-400">{label}</dt>
      <dd className="max-w-44 break-words text-right font-semibold text-white">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function probabilityDetail(prediction: PredictionResult): string {
  const normal = prediction.probabilities.NORMAL;
  const abnormal = prediction.probabilities.ABNORMAL;
  if (typeof normal === "number" && typeof abnormal === "number") {
    return `N ${normal.toFixed(1)}% / A ${abnormal.toFixed(1)}%`;
  }
  return "Model probability";
}

function micBadgeTone(status: MicStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "granted") {
    return "success";
  }
  if (status === "requesting") {
    return "warning";
  }
  if (status === "denied" || status === "error") {
    return "danger";
  }
  return "neutral";
}

function micStatusLabel(status: MicStatus): string {
  const labels: Record<MicStatus, string> = {
    "not-requested": "Mic Not Requested",
    requesting: "Mic Requesting",
    granted: "Mic Active",
    denied: "Mic Denied",
    stopped: "Mic Stopped",
    error: "Mic Error"
  };
  return labels[status];
}

function getErrorName(error: unknown): string {
  return error instanceof DOMException ? error.name : "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}
