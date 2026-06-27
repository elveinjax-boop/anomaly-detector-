import { useEffect, useState } from "react";
import {
  BrainCircuit,
  GitBranch,
  Gauge,
  Layers,
  LineChart,
  Shuffle,
  Sparkles,
  Target,
  TreeDeciduous,
  Zap,
} from "lucide-react";
import { getAvailableAlgorithms } from "../api";
import { useTraining } from "../context/TrainingContext";
import type { AlgorithmInfo, TrainingConfig } from "../types";

const ALGORITHM_ICONS: Record<string, JSX.Element> = {
  random_forest: <TreeDeciduous size={20} />,
  decision_tree: <GitBranch size={20} />,
  svm: <Target size={20} />,
  knn: <Shuffle size={20} />,
  logistic_regression: <LineChart size={20} />,
  naive_bayes: <Sparkles size={20} />,
  gradient_boosting: <Layers size={20} />,
  sgd: <Zap size={20} />,
  xgboost: <Gauge size={20} />,
};

const SPLIT_PRESETS = [
  { label: "70 / 30", train: 0.7 },
  { label: "80 / 20", train: 0.8 },
  { label: "90 / 10", train: 0.9 },
];

const FALLBACK_ALGORITHMS: AlgorithmInfo[] = [
  { key: "random_forest", name: "Random Forest", description: "Ensemble of decision trees — robust and accurate.", incremental: false },
  { key: "decision_tree", name: "Decision Tree", description: "Single tree classifier — fast and interpretable.", incremental: false },
  { key: "svm", name: "Support Vector Machine", description: "Finds the optimal hyperplane to separate classes.", incremental: false },
  { key: "knn", name: "K-Nearest Neighbors", description: "Classifies by majority vote of the nearest neighbors.", incremental: false },
  { key: "logistic_regression", name: "Logistic Regression", description: "Linear model for classification — fast.", incremental: false },
  { key: "naive_bayes", name: "Naive Bayes", description: "Probabilistic classifier — supports incremental learning.", incremental: true },
  { key: "gradient_boosting", name: "Gradient Boosting", description: "Sequential ensemble — high accuracy.", incremental: false },
  { key: "sgd", name: "SGD Classifier", description: "Stochastic Gradient Descent — supports incremental learning.", incremental: true }
];

export function TrainingConfigPanel() {
  const training = useTraining();
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState("random_forest");
  const [trainRatio, setTrainRatio] = useState(0.8);
  const [includeLocal, setIncludeLocal] = useState(false);
  const [customPath, setCustomPath] = useState("");

  useEffect(() => {
    getAvailableAlgorithms()
      .then((data) => {
        if (data && data.length > 0) {
          setAlgorithms(data);
        } else {
          setAlgorithms(FALLBACK_ALGORITHMS);
        }
      })
      .catch(() => {
        // Fallback if endpoint is unavailable
        setAlgorithms(FALLBACK_ALGORITHMS);
      });
  }, []);

  const handleStartTraining = () => {
    const config: TrainingConfig = {
      algorithm: selectedAlgo,
      test_size: parseFloat((1 - trainRatio).toFixed(2)),
      include_local_recordings: includeLocal,
      custom_dataset_path: customPath.trim() || undefined,
    };
    training.startTraining(config);
  };

  const trainPct = Math.round(trainRatio * 100);
  const testPct = 100 - trainPct;
  const isRunning = training.status === "running";
  const selectedInfo = algorithms.find((a) => a.key === selectedAlgo);

  return (
    <div className="space-y-5">
      {/* ── Algorithm Selection ─────────────────────────────────────────── */}
      <section className="glass-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
          <BrainCircuit size={18} className="text-app-accent" />
          Algorithm Selection
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          Choose the machine learning algorithm for training.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {algorithms.map((algo) => (
            <button
              key={algo.key}
              type="button"
              disabled={isRunning}
              onClick={() => setSelectedAlgo(algo.key)}
              className={`algo-card group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                selectedAlgo === algo.key
                  ? "border-app-accent/50 bg-app-accent/10 shadow-[0_0_20px_rgba(14,165,233,0.15)]"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
              } ${isRunning ? "pointer-events-none opacity-50" : ""}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  selectedAlgo === algo.key
                    ? "bg-app-accent/20 text-app-accent"
                    : "bg-white/5 text-stone-400 group-hover:text-stone-200"
                }`}
              >
                {ALGORITHM_ICONS[algo.key] ?? <BrainCircuit size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{algo.name}</span>
                  {algo.incremental && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Incremental
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-400">
                  {algo.description}
                </p>
              </div>
              {/* Selection indicator */}
              {selectedAlgo === algo.key && (
                <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-app-accent shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
              )}
            </button>
          ))}
        </div>

        {selectedInfo?.incremental && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
            <strong>{selectedInfo.name}</strong> supports incremental learning. If a model
            already exists, training will update it with new data instead of starting from
            scratch.
          </div>
        )}
      </section>

      {/* ── Train-Test Split ────────────────────────────────────────────── */}
      <section className="glass-panel p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">
          Train-Test Split
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          Choose how much data is used for training vs. evaluation.
        </p>

        {/* Presets */}
        <div className="mt-4 flex gap-2">
          {SPLIT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={isRunning}
              onClick={() => setTrainRatio(preset.train)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                Math.abs(trainRatio - preset.train) < 0.01
                  ? "border-app-accent/50 bg-app-accent/15 text-app-accent"
                  : "border-white/10 bg-white/5 text-stone-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="mt-4">
          <input
            type="range"
            min={50}
            max={95}
            step={5}
            value={trainPct}
            disabled={isRunning}
            onChange={(e) => setTrainRatio(parseInt(e.target.value) / 100)}
            className="split-slider w-full"
          />
        </div>

        {/* Visual bar */}
        <div className="mt-3 flex overflow-hidden rounded-lg text-xs font-bold">
          <div
            className="flex items-center justify-center bg-app-accent/20 py-2 text-app-accent transition-all"
            style={{ width: `${trainPct}%` }}
          >
            {trainPct}% Train
          </div>
          <div
            className="flex items-center justify-center bg-amber-500/15 py-2 text-amber-400 transition-all"
            style={{ width: `${testPct}%` }}
          >
            {testPct}% Test
          </div>
        </div>
      </section>

      {/* ── Data Source ─────────────────────────────────────────────────── */}
      <section className="glass-panel p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">
          Data Source
        </h2>

        <label className="mt-3 flex items-center gap-3 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={includeLocal}
            onChange={(e) => setIncludeLocal(e.target.checked)}
            disabled={isRunning}
            className="h-4 w-4 rounded border-white/20 bg-black/40 accent-app-accent"
          />
          Include local recordings
        </label>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-stone-400">
            Custom Dataset Path (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. C:\Users\Name\dataset"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            disabled={isRunning}
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-stone-500 focus:border-app-accent/50 focus:outline-none focus:ring-1 focus:ring-app-accent/30 disabled:opacity-50"
          />
        </div>
      </section>

      {/* ── Start Button ───────────────────────────────────────────────── */}
      <button
        type="button"
        disabled={isRunning}
        onClick={handleStartTraining}
        className="command-button w-full justify-center border-app-accent/50 bg-gradient-to-r from-app-accent/20 to-sky-600/10 py-3 text-base text-app-accent shadow-[0_0_25px_rgba(14,165,233,0.2)] transition-all hover:from-app-accent/30 hover:to-sky-600/20 hover:shadow-[0_0_35px_rgba(14,165,233,0.35)] disabled:pointer-events-none disabled:opacity-50"
      >
        <BrainCircuit size={20} />
        {isRunning ? "Training in Progress…" : "Start Training"}
      </button>
    </div>
  );
}
