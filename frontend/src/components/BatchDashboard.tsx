import { useState, useRef } from "react";
import {
  FolderUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
  FileAudio,
  Trash2,
} from "lucide-react";
import { trainModel, saveTrainingRecording } from "../api";

export function BatchDashboard({ onModelUpdated }: { onModelUpdated: () => void }) {
  const [activeMode, setActiveMode] = useState<"upload" | "path">("upload");
  const [folderPath, setFolderPath] = useState<string>("");
  const [isTraining, setIsTraining] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // File Upload states
  const [normalFiles, setNormalFiles] = useState<File[]>([]);
  const [abnormalFiles, setAbnormalFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);

  const normalInputRef = useRef<HTMLInputElement>(null);
  const abnormalInputRef = useRef<HTMLInputElement>(null);

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

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

  const handleNormalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setNormalFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleAbnormalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setAbnormalFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeNormalFile = (index: number) => {
    setNormalFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeAbnormalFile = (index: number) => {
    setAbnormalFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadFiles = async () => {
    const total = normalFiles.length + abnormalFiles.length;
    if (total === 0) {
      setMessage({ type: "error", text: "Please select files to upload." });
      return;
    }

    setIsUploading(true);
    setMessage(null);
    let normalUploaded = 0;
    let abnormalUploaded = 0;
    let index = 0;

    try {
      for (const file of normalFiles) {
        setUploadProgress({ current: index + 1, total, fileName: file.name });
        await saveTrainingRecording(file, "NORMAL");
        normalUploaded++;
        index++;
      }
      for (const file of abnormalFiles) {
        setUploadProgress({ current: index + 1, total, fileName: file.name });
        await saveTrainingRecording(file, "ABNORMAL");
        abnormalUploaded++;
        index++;
      }

      setMessage({
        type: "success",
        text: `Successfully uploaded ${normalUploaded} NORMAL and ${abnormalUploaded} ABNORMAL WAV files to the server dataset! You can now start model training (ensure 'Include local recordings' is selected).`,
      });
      setNormalFiles([]);
      setAbnormalFiles([]);
      onModelUpdated();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to upload files to the server.",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <section className="glass-panel p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FolderUp size={24} className="text-app-accent" />
              Dataset Management
            </h2>
            <p className="mt-1 text-stone-400 text-xs">
              Load and prepare training datasets for the model.
            </p>
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex rounded-lg bg-black/40 p-1 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setActiveMode("upload");
                setMessage(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeMode === "upload"
                  ? "bg-app-accent text-white shadow-md shadow-app-accent/25"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Upload Audio Files
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("path");
                setMessage(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeMode === "path"
                  ? "bg-app-accent text-white shadow-md shadow-app-accent/25"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Direct Folder Path
            </button>
          </div>
        </div>

        {/* ── Mode 1: File Uploader ─────────────────────────────────────────── */}
        {activeMode === "upload" && (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-stone-300">
              Select or drop WAV files to upload them to the backend server's active dataset folder.
              Once uploaded, you can train the model using these recordings.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* NORMAL files box */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col h-[280px]">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <span className="text-xs font-bold uppercase tracking-wider text-app-success">
                    Normal Audio ({normalFiles.length})
                  </span>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => normalInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-stone-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <UploadCloud size={14} />
                    Choose Files
                  </button>
                  <input
                    type="file"
                    multiple
                    accept=".wav"
                    ref={normalInputRef}
                    onChange={handleNormalFileChange}
                    className="hidden"
                  />
                </div>

                {/* File list */}
                <div className="mt-3 flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {normalFiles.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-stone-500 py-10">
                      <FileAudio size={28} className="opacity-40" />
                      <span className="mt-2 text-xs">No NORMAL files selected</span>
                    </div>
                  ) : (
                    normalFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-1.5 text-xs text-stone-300 hover:bg-black/50 transition-colors"
                      >
                        <span className="truncate max-w-[200px]" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeNormalFile(idx)}
                          className="text-stone-500 hover:text-app-danger transition-colors p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ABNORMAL files box */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col h-[280px]">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <span className="text-xs font-bold uppercase tracking-wider text-app-danger">
                    Abnormal Audio ({abnormalFiles.length})
                  </span>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => abnormalInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs font-semibold text-stone-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <UploadCloud size={14} />
                    Choose Files
                  </button>
                  <input
                    type="file"
                    multiple
                    accept=".wav"
                    ref={abnormalInputRef}
                    onChange={handleAbnormalFileChange}
                    className="hidden"
                  />
                </div>

                {/* File list */}
                <div className="mt-3 flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {abnormalFiles.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-stone-500 py-10">
                      <FileAudio size={28} className="opacity-40" />
                      <span className="mt-2 text-xs">No ABNORMAL files selected</span>
                    </div>
                  ) : (
                    abnormalFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-1.5 text-xs text-stone-300 hover:bg-black/50 transition-colors"
                      >
                        <span className="truncate max-w-[200px]" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAbnormalFile(idx)}
                          className="text-stone-500 hover:text-app-danger transition-colors p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Upload Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              {(normalFiles.length > 0 || abnormalFiles.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setNormalFiles([]);
                    setAbnormalFiles([]);
                  }}
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-stone-400 hover:bg-white/5 hover:text-white transition-all"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={handleUploadFiles}
                disabled={isUploading || (normalFiles.length === 0 && abnormalFiles.length === 0)}
                className="command-button border-app-accent/50 bg-app-accent/15 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/25 disabled:opacity-50"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                {isUploading ? "Uploading files..." : "Upload Files to Server"}
              </button>
            </div>

            {/* Upload Progress Bar */}
            {uploadProgress && (
              <div className="space-y-2 rounded-lg border border-white/5 bg-black/40 p-4">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span className="font-medium text-stone-200">
                    Uploading: <span className="font-semibold text-white">{uploadProgress.fileName}</span>
                  </span>
                  <span>
                    {uploadProgress.current} / {uploadProgress.total} ({Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-app-accent transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mode 2: Direct Folder Path ────────────────────────────────────── */}
        {activeMode === "path" && (
          <div className="mt-5 space-y-6">
            <p className="text-sm text-stone-300">
              Provide the absolute path to your dataset folder on this device (e.g.,{" "}
              <code className="bg-black/30 px-1 py-0.5 rounded text-white">C:\Users\Name\dataset</code>).
              The directory must contain <code className="bg-black/30 px-1 py-0.5 rounded text-white">NORMAL</code> and{" "}
              <code className="bg-black/30 px-1 py-0.5 rounded text-white">ABNORMAL</code> subfolders.
            </p>

            {!isLocal && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Cloud Deployment Warning:</strong> Direct folder paths only work when the
                  API server is running locally on your computer. When using the deployed Vercel/Render version, use the
                  <strong> Upload Audio Files</strong> tab instead.
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wide">
                Dataset Folder Path
              </label>
              <input
                type="text"
                placeholder="e.g. C:\Users\Name\Documents\fan-dataset"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                disabled={isTraining}
                className="block w-full text-sm text-white bg-black/40 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                className="command-button border-app-accent/50 bg-app-accent/15 text-app-accent shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:bg-app-accent/25 disabled:opacity-50"
                onClick={handleTrain}
                disabled={isTraining || !folderPath.trim()}
              >
                {isTraining ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {isTraining ? "Training..." : "Train Model from Path"}
              </button>
            </div>
          </div>
        )}

        {/* Global Action feedback message */}
        {message && (
          <div
            className={`mt-4 p-4 rounded-lg flex items-start gap-3 border ${
              message.type === "error"
                ? "bg-app-danger/10 text-app-danger border-app-danger/30"
                : message.type === "success"
                ? "bg-app-success/10 text-app-success border-app-success/30"
                : "bg-white/5 text-stone-200 border-white/10"
            }`}
          >
            {message.type === "error" ? (
              <AlertCircle size={20} className="shrink-0" />
            ) : (
              <CheckCircle2 size={20} className="shrink-0 text-app-success" />
            )}
            <p className="text-sm font-medium leading-relaxed">{message.text}</p>
          </div>
        )}
      </section>
    </div>
  );
}
