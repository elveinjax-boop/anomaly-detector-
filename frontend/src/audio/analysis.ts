export type AudioSnapshot = {
  amplitude: number;
  dominantFrequency: number;
};

export function analyzeTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (const value of data) {
    const normalized = (value - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / Math.max(1, data.length));
}

export function getDominantFrequency(data: Uint8Array, sampleRate: number, fftSize: number): number {
  let maxValue = -Infinity;
  let maxIndex = 0;
  for (let index = 1; index < data.length; index += 1) {
    if (data[index] > maxValue) {
      maxValue = data[index];
      maxIndex = index;
    }
  }
  return (maxIndex * sampleRate) / fftSize;
}
