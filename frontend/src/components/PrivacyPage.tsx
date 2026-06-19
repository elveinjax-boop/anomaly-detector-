import { ShieldCheck } from "lucide-react";
import { useState } from "react";

type PrivacyPageProps = {
  onAccept: () => void;
};

export function PrivacyPage({ onAccept }: PrivacyPageProps): JSX.Element {
  const [accepted, setAccepted] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center text-stone-200 px-4 py-8 relative">
      <div className="absolute inset-0 bg-[#050505] z-[-1]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.15),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(14,165,233,0.15),transparent_50%)] z-[-1]" />
      
      <section className="w-full max-w-3xl glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-app-success/10 rounded-full blur-[80px] -z-10 pointer-events-none translate-x-1/2 -translate-y-1/2" />
        
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-app-success/30 bg-app-success/10 text-app-success shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <ShieldCheck size={32} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Microphone Privacy Policy</h1>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              Fan monitoring needs microphone access so the application can analyze local fan sound. Review and accept this policy before continuing.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4 text-sm leading-6 text-stone-300">
          <p className="flex gap-3"><span className="text-app-success font-bold">•</span> Microphone access starts only after a user action in the dashboard.</p>
          <p className="flex gap-3"><span className="text-app-success font-bold">•</span> Real-time prediction sends short WAV windows to the configured local FastAPI backend for analysis.</p>
          <p className="flex gap-3"><span className="text-app-success font-bold">•</span> Training recordings are saved only when you choose a label and stop the recording.</p>
          <p className="flex gap-3"><span className="text-app-success font-bold">•</span> The application does not add cloud upload, advertising trackers, or third-party audio sharing.</p>
          <p className="flex gap-3"><span className="text-app-success font-bold">•</span> You can stop monitoring at any time, which closes the active microphone stream.</p>
        </div>

        <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-stone-300 transition-colors hover:bg-white/5">
          <input
            className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 text-app-success focus:ring-app-success focus:ring-offset-0"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>I accept this microphone privacy policy.</span>
        </label>

        <button
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-app-success px-6 text-sm font-bold text-[#050505] shadow-[0_0_20px_rgba(16,185,129,0.4)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-stone-500 disabled:shadow-none sm:w-auto"
          type="button"
          disabled={!accepted}
          onClick={onAccept}
        >
          Continue to Dashboard
        </button>
      </section>
    </main>
  );
}
