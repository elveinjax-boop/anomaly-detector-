import { useEffect, useRef } from "react";
import { analyzeTimeDomain, getDominantFrequency, type AudioSnapshot } from "../audio/analysis";

type AudioVisualizerProps = {
  analyser: AnalyserNode | null;
  active: boolean;
  sampleRate: number;
  onSnapshot: (snapshot: AudioSnapshot) => void;
};

export function AudioVisualizer({ analyser, active, sampleRate, onSnapshot }: AudioVisualizerProps): JSX.Element {
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<HTMLCanvasElement | null>(null);
  const lastSnapshotAtRef = useRef(0);

  useEffect(() => {
    if (!analyser || !active) {
      return;
    }

    const timeData = new Uint8Array(analyser.fftSize);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    let frameId = 0;

    const draw = (time: number) => {
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);
      drawWaveform(waveformRef.current, timeData);
      drawSpectrum(spectrumRef.current, frequencyData);

      if (time - lastSnapshotAtRef.current > 250) {
        lastSnapshotAtRef.current = time;
        onSnapshot({
          amplitude: analyzeTimeDomain(timeData),
          dominantFrequency: getDominantFrequency(frequencyData, sampleRate, analyser.fftSize)
        });
      }

      frameId = window.requestAnimationFrame(draw);
    };

    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, analyser, onSnapshot, sampleRate]);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-app-success animate-pulse"></span>Waveform</h2>
          <span className="text-xs font-semibold text-app-success uppercase tracking-wider">Live</span>
        </div>
        <canvas ref={waveformRef} className="block aspect-[16/7] w-full rounded-md bg-black/40 shadow-inner" />
      </div>
      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-app-accent animate-pulse"></span>Frequency Spectrum</h2>
          <span className="text-xs font-semibold text-app-accent uppercase tracking-wider">FFT</span>
        </div>
        <canvas ref={spectrumRef} className="block aspect-[16/7] w-full rounded-md bg-black/40 shadow-inner" />
      </div>
    </section>
  );
}

function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return context;
}

function drawWaveform(canvas: HTMLCanvasElement | null, data: Uint8Array): void {
  if (!canvas) {
    return;
  }
  const context = fitCanvas(canvas);
  if (!context) {
    return;
  }

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  
  context.lineWidth = Math.max(2, width / 500);
  context.strokeStyle = "#10b981"; // app-success
  context.shadowBlur = 15;
  context.shadowColor = "#10b981";
  
  context.beginPath();

  const sliceWidth = width / data.length;
  for (let index = 0; index < data.length; index += 1) {
    const y = (data[index] / 255) * height;
    const x = index * sliceWidth;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  
  // reset shadow for other renders
  context.shadowBlur = 0;
}

function drawSpectrum(canvas: HTMLCanvasElement | null, data: Uint8Array): void {
  if (!canvas) {
    return;
  }
  const context = fitCanvas(canvas);
  if (!context) {
    return;
  }

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const barCount = Math.min(96, data.length);
  const barWidth = width / barCount;
  
  for (let index = 0; index < barCount; index += 1) {
    const sourceIndex = Math.floor((index / barCount) * data.length);
    const magnitude = data[sourceIndex] / 255;
    const barHeight = Math.max(2, magnitude * height);
    
    const gradient = context.createLinearGradient(0, height, 0, height - barHeight);
    if (index % 3 === 0) {
      gradient.addColorStop(0, "rgba(14, 165, 233, 0.2)"); // cyan dark
      gradient.addColorStop(1, "#0ea5e9"); // cyan
      context.shadowColor = "#0ea5e9";
    } else if (index % 3 === 1) {
      gradient.addColorStop(0, "rgba(244, 63, 94, 0.2)"); // rose dark
      gradient.addColorStop(1, "#f43f5e"); // rose
      context.shadowColor = "#f43f5e";
    } else {
      gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)"); // emerald dark
      gradient.addColorStop(1, "#10b981"); // emerald
      context.shadowColor = "#10b981";
    }
    
    context.fillStyle = gradient;
    context.shadowBlur = 10;
    
    context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight);
  }
  
  context.shadowBlur = 0;
}
