"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Field, PageHeader, TextArea, TextInput, Toggle } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function OdyCorePage() {
  const [identity, setIdentity] = useState(null);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("Salut, sunt Alin. Tu cine ești?");
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([
      api("/api/v1/ody-core/identity"),
      api("/api/v1/ody-core/profile"),
    ]).then(([identityResult, profileResult]) => {
      setIdentity(identityResult.data);
      setNotes(identityResult.data.personality.notes || "");
      setInstructions(identityResult.data.instructions || "");
      setItems(profileResult.data.items || []);
    }).catch((loadError) => setError(loadError.message));
  }, []);

  async function saveIdentity(event) {
    event.preventDefault();
    setSaved("");
    setError("");
    try {
      const result = await api("/api/v1/ody-core/identity", {
        method: "PUT",
        body: { personalityNotes: notes, instructions },
      });
      setIdentity(result.data);
      setSaved("Personalitatea a fost salvată. Se aplică la următoarea sesiune vocală.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaved("");
    setError("");
    try {
      const result = await api("/api/v1/ody-core/profile", {
        method: "PUT",
        body: { items: items.map((item) => ({ id: item.id, enabled: item.enabled, value: item.value })) },
      });
      setItems(result.data.items || []);
      setSaved("Profilul a fost salvat. Se aplică la următoarea sesiune vocală.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function showPreview() {
    setError("");
    try {
      const result = await api("/api/v1/ody-core/preview");
      setPreview(result.data.prompt);
    } catch (previewError) {
      setError(previewError.message);
    }
  }

  async function testIdentity(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setAnswer(null);
    try {
      const result = await api("/api/v1/ody-core/test", { method: "POST", body: { message } });
      setAnswer(result.data);
    } catch (testError) {
      setError(testError.message);
    } finally {
      setPending(false);
    }
  }

  function updateItem(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  if (!identity) return <p className="text-sm text-[var(--muted)]">{error || "Se încarcă identitatea ODY…"}</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Identitate"
        title={identity.name}
        description="O singură identitate pentru Gemini Live, Modular, Hybrid și testul text. Apelurile telefonice își păstrează politica separată."
      />
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
      {saved ? <p className="mb-4 text-sm text-[var(--good)]">{saved}</p> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Identitate</h2>
          <p className="text-sm text-[var(--muted)]">Utilizator principal: {identity.user}</p>
          <ul className="space-y-1 text-sm leading-6">
            {identity.roles.map((role) => <li key={role}>{role}</li>)}
          </ul>
          <h3 className="pt-2 font-semibold">Principii</h3>
          <ul className="space-y-1 text-sm leading-6 text-[var(--muted)]">
            {identity.principles.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
        <form className="panel space-y-3 p-4" onSubmit={saveIdentity}>
          <h2 className="font-display text-lg font-semibold">Personalitate</h2>
          <div className="flex flex-wrap gap-2">
            {identity.personality.tone.map((tone) => <Badge key={tone}>{tone}</Badge>)}
          </div>
          <ul className="space-y-1 text-sm leading-6 text-[var(--muted)]">
            {identity.personality.style.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <Field label="Note de personalitate" hint="Se adaugă peste stilul fix. Nu include secrete.">
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
          </Field>
          <Field label="Instrucțiuni suplimentare">
            <TextArea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={2000} />
          </Field>
          <Button type="submit">Salvează personalitatea</Button>
        </form>
        <form className="panel space-y-4 p-4" onSubmit={saveProfile}>
          <h2 className="font-display text-lg font-semibold">Profil</h2>
          {items.map((item) => (
            <div key={item.id} className="space-y-2 rounded-2xl border border-[var(--line)] p-3">
              <Toggle checked={item.enabled} onChange={(enabled) => updateItem(item.id, { enabled })} label={item.label} />
              <TextInput value={item.value} onChange={(event) => updateItem(item.id, { value: event.target.value })} maxLength={400} />
            </div>
          ))}
          <Button type="submit">Salvează profilul</Button>
        </form>
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Previzualizare și test</h2>
          <Button type="button" variant="quiet" onClick={showPreview}>Previzualizează promptul</Button>
          {preview ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-6">{preview}</pre> : null}
          <form className="space-y-3" onSubmit={testIdentity}>
            <Field label="Mesaj de test">
              <TextInput value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>
            <Button type="submit" disabled={pending}>{pending ? "Se testează…" : "Testează identitatea"}</Button>
          </form>
          {answer ? (
            <div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-6">
              <p>{answer.text}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{answer.modelCalled ? `Răspuns de la ${answer.provider}` : "Răspuns din identitatea ODY"}</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
