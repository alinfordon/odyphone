import { encodeFrame } from "./audioSocket.js";
import { rms16 } from "./pcm.js";
import { createVad } from "./vad.js";

const FRAME = 320;

export function createVoiceSession({
  greetingPcm,
  silenceMs = 700,
  responseTimeoutMs = 8000,
  maxCallDurationSeconds = 900,
  onUtterance,
  onGreeting,
  onInterrupt,
  promptSilence,
  promptFailure,
  onEnd,
}) {
  const vad = createVad({ silenceMs });
  let socket = null;
  let queue = [];
  let timer = null;
  let silenceTimer = null;
  let playing = false;
  let closed = false;
  let failures = 0;
  let silencePrompts = 0;
  let loudFrames = 0;
  let endAfterPlayback = false;

  function stopPlayback() {
    if (timer) clearInterval(timer);
    timer = null;
    queue = [];
    playing = false;
    loudFrames = 0;
  }

  function armSilence() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (closed || playing) return;
      if (silencePrompts >= 1) {
        end("silence");
        return;
      }
      silencePrompts += 1;
      Promise.resolve(promptSilence?.()).then((pcm) => {
        if (pcm && !closed) play(pcm);
      }).catch(() => end("silence"));
    }, responseTimeoutMs);
    silenceTimer.unref?.();
  }

  function play(pcm) {
    if (!pcm?.length || closed) return;
    stopPlayback();
    playing = true;
    for (let index = 0; index < pcm.length; index += FRAME) {
      const frame = Buffer.alloc(FRAME);
      pcm.copy(frame, 0, index, Math.min(pcm.length, index + FRAME));
      queue.push(frame);
    }
    timer = setInterval(() => {
      if (closed || !socket) return;
      const frame = queue.shift();
      if (!frame) {
        stopPlayback();
        if (endAfterPlayback) {
          end("goodbye");
          return;
        }
        armSilence();
        return;
      }
      if (socket.writable) socket.write(encodeFrame(0x10, frame));
    }, 20);
    timer.unref?.();
  }

  const maxTimer = setTimeout(() => end("duration"), Math.max(1, maxCallDurationSeconds) * 1000);
  maxTimer.unref?.();

  async function end(reason) {
    if (closed) return;
    closed = true;
    stopPlayback();
    if (silenceTimer) clearTimeout(silenceTimer);
    clearTimeout(maxTimer);
    if (socket && socket.writable) {
      socket.write(encodeFrame(0x00));
      socket.end();
    }
    await onEnd?.(reason);
  }

  return {
    play,
    end,
    bind(next) {
      socket = next;
      onGreeting?.();
      play(greetingPcm);
    },
    async onAudio(pcm) {
      if (closed) return;
      if (playing) {
        if (rms16(pcm) >= 700) loudFrames += 1;
        else loudFrames = 0;
        if (loudFrames < 4) return;
        onInterrupt?.();
        stopPlayback();
        vad.reset();
        endAfterPlayback = false;
      }
      const utterance = vad.push(pcm);
      if (!utterance) return;
      if (silenceTimer) clearTimeout(silenceTimer);
      silencePrompts = 0;
      try {
        const result = await onUtterance(utterance);
        if (closed || !result) return;
        if (result.endCall) endAfterPlayback = true;
        if (result.pcm) play(result.pcm);
        else if (result.endCall) await end("goodbye");
        else armSilence();
        failures = 0;
      } catch (error) {
        if (error?.name === "AbortError") return;
        failures += 1;
        if (failures >= 3) {
          await end("errors");
          return;
        }
        const pcmReply = await promptFailure?.().catch(() => null);
        if (pcmReply && !closed) play(pcmReply);
      }
    },
    onRemoteHangup() {
      return end("remote");
    },
  };
}
