"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Field, PageHeader, Select, TextArea } from "../../../components/ui";
import { api } from "../../../lib/api";
import { voiceLabCloseMessage, voiceLabWebSocketUrl } from "../../../lib/voiceLabSocket";

const emptyForm = {
  engine: "modular",
  llm: "gemini",
  ollamaModel: "",
  stt: "configured",
  tts: "configured",
  voice: "alloy",
  language: "ro",
  hybridFallback: true,
};

export default function VoiceLabPage() {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState(null);
  const [modelError, setModelError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [prompt, setPrompt] = useState("Spune într-o propoziție cine ești.");
  const [textResult, setTextResult] = useState(null);
  const [textError, setTextError] = useState("");
  const [textPending, setTextPending] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [connection, setConnection] = useState("closed");
  const [activeEngine, setActiveEngine] = useState("");
  const [lines, setLines] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const audioRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    let stopped = false;
    api("/api/v1/voice-lab/status").then((result) => {
      if (!stopped) setStatus(result.data);
    }).catch((error) => {
      if (!stopped) setLiveError(error.message);
    });
    api("/api/v1/voice-lab/ollama/models").then((result) => {
      if (stopped) return;
      setModels(result.data);
      if (result.data.selected) setForm((current) => ({ ...current, ollamaModel: current.ollamaModel || result.data.selected }));
    }).catch((error) => {
      if (!stopped) setModelError(error.message);
    });
    api("/api/v1/voice-lab/sessions").then((result) => {
      if (!stopped) setHistory(result.data || []);
    }).catch(() => null);
    return () => {
      stopped = true;
      stopAudio();
      socketRef.current?.close(1000, "page closed");
    };
  }, []);

  const voices = form.engine === "modular" ? status?.voices.modular || [] : status?.voices.live || [];

  async function sendText(event) {
    event.preventDefault();
    setTextPending(true);
    setTextError("");
    setTextResult(null);
    try {
      const result = await api("/api/v1/voice-lab/text", {
        method: "POST",
        body: {
          llm: form.llm,
          model: form.llm === "ollama" ? form.ollamaModel : "",
          prompt,
        },
      });
      setTextResult(result.data);
    } catch (error) {
      setTextError(error.message);
    } finally {
      setTextPending(false);
    }
  }

  async function startTest() {
    setLiveError("");
    setLines([]);
    setMetrics(null);
    setRunning(true);
    setConnection("connecting");
    try {
      const previous = socketRef.current;
      socketRef.current = null;
      previous?.close(1000, "replaced");
      const created = await api("/api/v1/voice-lab/sessions", { method: "POST", body: form });
      const ticket = await api("/api/v1/auth/ws-ticket", { method: "POST" });
      const socket = new WebSocket(voiceLabWebSocketUrl(location));
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "auth", ticket: ticket.data.ticket, sessionId: created.data.id }));
      });
      socket.addEventListener("message", (event) => onSocketMessage(JSON.parse(event.data)));
      socket.addEventListener("close", (event) => {
        if (socketRef.current !== socket) return;
        setConnection("closed");
        setRunning(false);
        stopAudio();
        const diagnostic = voiceLabCloseMessage(event.code, event.reason);
        if (diagnostic) setLiveError((current) => current || diagnostic);
      });
    } catch (error) {
      setRunning(false);
      setConnection("closed");
      setLiveError(error.message);
    }
  }

  function onSocketMessage(message) {
    if (message.type === "ready" || message.type === "state") {
      setConnection(message.session?.connection || message.connection || "open");
      setActiveEngine(message.session?.activeEngine || message.engine || "");
      if (message.type === "ready") {
        startMicrophone().catch((error) => setLiveError(error.message || "Microfonul nu a putut fi deschis."));
      }
    }
    if (message.type === "engine") {
      setActiveEngine(message.engine);
      setLiveError(message.reason || "");
    }
    if (message.type === "transcript") {
      setLines((current) => [...current, { role: message.role, text: message.text }]);
    }
    if (message.type === "audio") playPcm(message.pcm, message.sampleRate || 24000);
    if (message.type === "metrics") setMetrics(message.metrics);
    if (message.type === "interrupt") stopPlayback();
    if (message.type === "error") {
      const stage = message.stage ? ` [${message.stage}]` : "";
      const code = message.code ? ` (${message.code})` : "";
      setLiveError(`${message.message}${stage}${code}`);
    }
    if (message.type === "closed") {
      setHistory((current) => [message.benchmark, ...current].slice(0, 20));
      setConnection("closed");
      setRunning(false);
    }
  }

  async function startMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const context = new AudioContext();
    audioRef.current = { context, stream, sources: [], nextAt: 0 };
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsample(input, context.sampleRate, 16000);
      socket.send(JSON.stringify({ type: "audio", pcm: bufferToBase64(pcm), sampleRate: 16000 }));
    };
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    audioRef.current.mute = mute;
    audioRef.current.processor = processor;
    audioRef.current.source = source;
  }

  function playPcm(pcmBase64, sampleRate) {
    const holder = audioRef.current;
    if (!holder?.context) return;
    const bytes = base64ToBytes(pcmBase64);
    const samples = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 32768;
    const buffer = holder.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = holder.context.createBufferSource();
    source.buffer = buffer;
    source.connect(holder.context.destination);
    const startAt = Math.max(holder.context.currentTime, holder.nextAt || 0);
    source.start(startAt);
    holder.nextAt = startAt + buffer.duration;
    holder.sources.push(source);
  }

  function stopPlayback() {
    const holder = audioRef.current;
    holder?.sources?.splice(0).forEach((source) => {
      try { source.stop(); } catch { /* already finished */ }
    });
    if (holder) holder.nextAt = 0;
  }

  function stopAudio() {
    stopPlayback();
    const holder = audioRef.current;
    holder?.processor?.disconnect();
    holder?.source?.disconnect();
    holder?.stream?.getTracks().forEach((track) => track.stop());
    holder?.context?.close().catch(() => null);
    audioRef.current = null;
  }

  function stopTest() {
    socketRef.current?.send(JSON.stringify({ type: "stop" }));
    socketRef.current?.close();
    stopAudio();
    setRunning(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Laborator"
        title="Voice Lab"
        description="Compară Gemini Live, vocea modulară și hibridul pe microfonul acestui browser. Laboratorul nu plasează apeluri telefonice."
      />
      {liveError ? <p className="mb-4 text-sm text-[var(--bad)]">{liveError}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <form className="panel space-y-3 p-4" onSubmit={(event) => event.preventDefault()}>
          <Field label="Motor">
            <Select value={form.engine} onChange={(event) => {
              const engine = event.target.value;
              const nextVoices = engine === "modular" ? status?.voices.modular || [] : status?.voices.live || [];
              setForm({ ...form, engine, voice: nextVoices.includes(form.voice) ? form.voice : (nextVoices[0] || "") });
            }}>
              <option value="gemini-live">Gemini Live</option>
              <option value="modular">Modular Voice</option>
              <option value="hybrid">Hybrid Voice</option>
            </Select>
          </Field>
          <Field label="LLM">
            <Select value={form.llm} onChange={(event) => setForm({ ...form, llm: event.target.value })}>
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama</option>
            </Select>
          </Field>
          {form.llm === "ollama" ? (
            <Field label="Model Ollama" hint="Lista vine de la server. Modelele cloud nu rulează pe PC.">
              <Select value={form.ollamaModel} onChange={(event) => setForm({ ...form, ollamaModel: event.target.value })}>
                <option value="">Alege un model descoperit</option>
                <optgroup label="Locale, pe PC">
                  {(models?.local || []).map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
                </optgroup>
                <optgroup label="Cloud, nu pe PC">
                  {(models?.cloud || []).map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
                </optgroup>
              </Select>
            </Field>
          ) : null}
          {modelError ? <p className="text-sm text-[var(--bad)]">{modelError}</p> : null}
          <Field label="STT">
            <Select value={form.stt} onChange={(event) => setForm({ ...form, stt: event.target.value })}>
              {(status?.stt || []).map((item) => <option key={item.id} value={item.id}>{item.label}{item.configured ? "" : " — neconfigurat"}</option>)}
            </Select>
          </Field>
          <Field label="TTS">
            <Select value={form.tts} onChange={(event) => setForm({ ...form, tts: event.target.value })}>
              {(status?.tts || []).map((item) => <option key={item.id} value={item.id}>{item.label}{item.configured ? "" : " — neconfigurat"}</option>)}
            </Select>
          </Field>
          <Field label="Voce">
            <Select value={form.voice} onChange={(event) => setForm({ ...form, voice: event.target.value })}>
              {voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
            </Select>
          </Field>
          <Field label="Limbă">
            <Select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
              <option value="ro">Română</option>
              <option value="en">Engleză</option>
            </Select>
          </Field>
          {form.engine === "hybrid" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.hybridFallback} onChange={(event) => setForm({ ...form, hybridFallback: event.target.checked })} />
              Fallback către Modular Voice
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={startTest} disabled={running}>Start Test</Button>
            <Button type="button" variant="danger" onClick={stopTest} disabled={!running}>Stop Test</Button>
          </div>
        </form>
        <div className="space-y-4">
          <section className="panel flex flex-wrap items-center gap-2 p-4">
            <Badge tone={connection === "open" ? "good" : connection === "connecting" ? "warn" : "neutral"}>{connectionLabel(connection)}</Badge>
            <Badge>{activeEngine ? `Motor activ: ${engineLabel(activeEngine)}` : "Niciun motor activ"}</Badge>
            {metrics ? <Latency metrics={metrics} /> : null}
          </section>
          <section className="panel min-h-56 p-4">
            <h2 className="font-semibold">Transcript</h2>
            <div className="mt-3 space-y-2">
              {lines.length === 0 ? <p className="text-sm text-[var(--muted)]">Utilizatorul și ODY apar aici în timpul testului.</p> : null}
              {lines.map((line, index) => (
                <p key={`${line.role}-${index}`} className="text-sm leading-6">
                  <span className="font-semibold">{line.role === "user" ? "Utilizator" : "ODY"}: </span>{line.text}
                </p>
              ))}
            </div>
          </section>
          <form className="panel space-y-3 p-4" onSubmit={sendText}>
            <h2 className="font-semibold">Test text, fără microfon</h2>
            <Field label="Prompt">
              <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>
            {textError ? <p className="text-sm text-[var(--bad)]">{textError}</p> : null}
            {textResult ? (
              <div className="space-y-2 text-sm">
                <p>{textResult.text}</p>
                <p className="text-[var(--muted)]">
                  {textResult.provider} · {textResult.model} · {textResult.local ? "local, pe PC" : "cloud, nu pe PC"} · primul token {ms(textResult.firstTokenMs)} · total {ms(textResult.totalMs)}
                </p>
              </div>
            ) : null}
            <Button type="submit" disabled={textPending}>{textPending ? "Se întreabă modelul…" : "Trimite textul"}</Button>
          </form>
          <section className="panel p-4">
            <h2 className="font-semibold">Istoric</h2>
            <div className="mt-3 space-y-3">
              {history.length === 0 ? <p className="text-sm text-[var(--muted)]">Nicio sesiune încheiată în această rulare a API-ului.</p> : null}
              {history.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[var(--line)] p-3 text-sm">
                  <p className="font-medium">{engineLabel(item.engine)} → {engineLabel(item.activeEngine)}</p>
                  <p className="text-[var(--muted)]">{item.llm} {item.model} · STT {item.stt} · TTS {item.tts} · reconectări {item.reconnects}</p>
                  {item.errors?.length ? <p className="text-[var(--bad)]">{item.errors.join(" ")}</p> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">Modelele așteptate pe PC, dacă sunt instalate: gemma4:e2b, llama3.2:3b, qwen2.5:7b, aya:8b. Ele apar în listă doar când Ollama le raportează.</p>
    </div>
  );
}

function Latency({ metrics }) {
  return (
    <p className="text-xs text-[var(--muted)]">
      STT {ms(metrics.sttMs)} · LLM primul token {ms(metrics.llmFirstTokenMs)} · LLM final {ms(metrics.llmTotalMs)} · TTS {ms(metrics.ttsMs)} · până la audio {ms(metrics.firstAudioMs)}
    </p>
  );
}

function ms(value) {
  return value === null || value === undefined ? "—" : `${value} ms`;
}

function connectionLabel(value) {
  if (value === "open") return "Conexiune deschisă";
  if (value === "connecting") return "Se conectează";
  return "Conexiune oprită";
}

function engineLabel(value) {
  if (value === "gemini-live") return "Gemini Live";
  if (value === "modular") return "Modular";
  if (value === "hybrid") return "Hybrid";
  return value || "—";
}

function downsample(input, fromRate, toRate) {
  if (fromRate === toRate) return floatToPcm(input);
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(index * ratio)] || 0));
    out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function floatToPcm(input) {
  const out = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] || 0));
    out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function bufferToBase64(pcm) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
