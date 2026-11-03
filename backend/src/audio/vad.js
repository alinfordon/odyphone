import { rms16 } from "./pcm.js";

export function createVad({
  sampleRate = 8000,
  silenceMs = 700,
  minSpeechMs = 280,
  maxSpeechMs = 12000,
  threshold = 450,
} = {}) {
  let speaking = false;
  let speechMs = 0;
  let silenceRun = 0;
  let chunks = [];

  function reset() {
    speaking = false;
    speechMs = 0;
    silenceRun = 0;
    chunks = [];
  }

  function push(pcm) {
    const ms = (pcm.length / 2 / sampleRate) * 1000;
    const hot = rms16(pcm) >= threshold;
    if (!speaking) {
      if (!hot) return null;
      speaking = true;
      speechMs = ms;
      silenceRun = 0;
      chunks = [Buffer.from(pcm)];
      return null;
    }
    chunks.push(Buffer.from(pcm));
    if (hot) {
      speechMs += ms;
      silenceRun = 0;
    } else {
      silenceRun += ms;
    }
    const longEnough = speechMs >= maxSpeechMs;
    const ended = silenceRun >= silenceMs && speechMs >= minSpeechMs;
    const tooShort = silenceRun >= silenceMs && speechMs < minSpeechMs;
    if (!longEnough && !ended && !tooShort) return null;
    const utterance = longEnough || ended ? Buffer.concat(chunks) : null;
    reset();
    return utterance;
  }

  return { push, reset, speaking: () => speaking };
}
