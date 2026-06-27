import { useState } from "react";
import { FolderUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { trainModel } from "../api";

export function BatchDashboard({ onModelUpdated }: { onModelUpdated: () => void }) {
  const [folderPath, setFolderPath] = useState<string>("");
  const [isTraining, setIsTraining] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const handleTrain = async () => {
    if (!folderPath.trim()) {
      setMessage({ type: "error", text: "Please enter a valid folder path." });
      return;
    }

    setIsTraining(true);
    setMessage({ type: "info", text: "Training model with local data..." });
    try {
      await trainModel(true, folderPath.trim());
      setMessage({ type: "success", text: "Model successfully retrained with the provided dataset!" });
      onModelUpdated();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to train model." });
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <section className="glass-panel p-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FolderUp size={24} className="text-app-accent" />
          Direct Folder Training
        </h2>
        <p className="mt-2 text-stone-300 text-sm">
          Instead of uploading files, you can directly provide the absolute path to your dataset folder on this device (e.g., <code className="bg-black/30 px-1 py-0.5 rounded">C:\Users\Name\dataset</code>).
          The folder must contain <code className="bg-black/30 px-1 py-0.5 rounded">NORMAL</code> and <code className="bg-black/30 px-1 py-0.5 rounded">ABNORMAL</code> subdirectories.
        </p>

        <div className="mt-6 space-y-6">
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-white uppercase tracking-wide">
                    Dataset Folder Path
                </label>
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        placeholder="e.g. C:\Users\Name\Documents\fan-dataset"
                        value={folderPath}
                        onChange={(e) => setFolderPath(e.target.value)}
                        disabled={isTraining}
                        className="block w-full text-sm text-white bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-transparent disabled:opacity-50"
                    />
                </div>
            </div>

            <div className="space-y-3">
                <button
                    className="command-button border-app-accent/50 bg-app-accent/10 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/20 disabled:opacity-50"
                    onClick={handleTrain}
                    disabled={isTraining || !folderPath.trim()}
                >
                    {isTraining ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    {isTraining ? 'Training...' : 'Train Model from Path'}
                </button>
            </div>
            
            {message && (
                <div className={`p-4 rounded-lg flex items-start gap-3 ${
                    message.type === 'error' ? 'bg-app-danger/10 text-app-danger border border-app-danger/30' :
                    message.type === 'success' ? 'bg-app-success/10 text-app-success border border-app-success/30' :
                    'bg-white/5 text-stone-200 border border-white/10'
                }`}>
                    {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}
        </div>
      </section>
    </div>
  );
}
