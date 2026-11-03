"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Field, PageHeader, TextInput } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function VoicePage() {
  const [voice, setVoice] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api("/api/v1/voice").then((result) => setVoice(result.data)).catch((loadError) => setError(loadError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      const result = await api("/api/v1/voice", {
        method: "PATCH",
        body: {
          maxCallDurationSeconds: Number(voice.maxCallDurationSeconds),
          responseTimeoutMs: Number(voice.responseTimeoutMs),
          silenceMs: Number(voice.silenceMs),
        },
      });
      setVoice((current) => ({ ...current, ...result.data }));
      setSaved("Limitele vocale au fost salvate. Se aplică când există o cale audio live.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  if (!voice) return <p className="text-sm text-[var(--muted)]">{error || "Se încarcă setările de voce…"}</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Voce"
        title="Calea vocală"
        description="Fraza apelantului este tăiată după liniște, trimisă la recunoaștere, iar răspunsul este sintetizat pe loc. Fără AudioSocket și fără furnizori, AI nu preia telefonul."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="panel space-y-3 p-4" onSubmit={save}>
          <Field label="Durata maximă a apelului (secunde)"><TextInput type="number" min="30" max="7200" value={voice.maxCallDurationSeconds} onChange={(event) => setVoice({ ...voice, maxCallDurationSeconds: event.target.value })} /></Field>
          <Field label="Timp de așteptare pentru răspuns (ms)"><TextInput type="number" min="1000" max="60000" value={voice.responseTimeoutMs} onChange={(event) => setVoice({ ...voice, responseTimeoutMs: event.target.value })} /></Field>
          <Field label="Liniștea care încheie o frază (ms)"><TextInput type="number" min="200" max="5000" value={voice.silenceMs} onChange={(event) => setVoice({ ...voice, silenceMs: event.target.value })} /></Field>
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          {saved ? <p className="text-sm text-[var(--good)]">{saved}</p> : null}
          <Button type="submit">Salvează limitele</Button>
        </form>
        <div className="space-y-3">
          <Info title="Recunoaștere" body={voice.speechRecognition.message} configured={voice.speechRecognition.configured} />
          <Info title="Sinteză vocală" body={voice.textToSpeech.message} configured={voice.textToSpeech.configured} />
          <Info title="Adaptor audio" body={voice.audio.message} configured={voice.audio.connected} />
          <Info title="Sfârșitul vorbirii" body={voice.activity.message} configured={voice.activity.active} />
          <Info title="Sesiuni" body={voice.sessions.message} configured={voice.sessions.live} />
        </div>
      </div>
    </div>
  );
}

function Info({ title, body, configured }) {
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Badge tone={configured ? "good" : "neutral"}>{configured ? "Date de acces prezente" : "Neconectat"}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </section>
  );
}
