"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Field, PageHeader, TextArea, TextInput } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function AssistantPage() {
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api("/api/v1/assistant").then((result) => setForm(result.data)).catch((loadError) => setError(loadError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaved("");
    try {
      await api("/api/v1/assistant", {
        method: "PATCH",
        body: {
          assistantName: form.assistantName,
          ownerName: form.ownerName,
          greeting: form.greeting,
          customSystemPrompt: form.customSystemPrompt,
        },
      });
      setSaved("Instrucțiunile au fost salvate. Nu sunt trimise către un model din acest ecran.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function showPreview() {
    const result = await api("/api/v1/assistant/preview", { method: "POST", body: {} });
    setPreview(result.data.instructions);
  }

  if (!form) return <p className="text-sm text-[var(--muted)]">{error || "Se încarcă personalitatea…"}</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Personalitate AI"
        title={form.assistantName}
        description="ODY se prezintă ca asistent AI, vorbește română și nu se poate pretinde proprietarul. Politica fixă rămâne înaintea oricăror instrucțiuni suplimentare."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>{form.language === "ro" ? "Română" : form.language}</Badge>
        <Badge tone={form.provider.configured ? "good" : "neutral"}>{form.provider.configured ? "Date de acces Gemini prezente" : "Gemini neconfigurat"}</Badge>
      </div>
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={save}>
        <section className="panel space-y-3 p-4">
          <Field label="Numele asistentului"><TextInput value={form.assistantName} onChange={(event) => setForm({ ...form, assistantName: event.target.value })} /></Field>
          <Field label="Numele proprietarului"><TextInput value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} /></Field>
          <Field label="Formula de salut implicită"><TextArea value={form.greeting} onChange={(event) => setForm({ ...form, greeting: event.target.value })} /></Field>
          <Field label="Instrucțiuni suplimentare" hint="Instrucțiunile pentru un contact se editează la acel contact.">
            <TextArea value={form.customSystemPrompt} onChange={(event) => setForm({ ...form, customSystemPrompt: event.target.value })} />
          </Field>
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          {saved ? <p className="text-sm text-[var(--good)]">{saved}</p> : null}
          <div className="flex gap-2">
            <Button type="submit">Salvează</Button>
            <Button type="button" variant="quiet" onClick={showPreview}>Previzualizează instrucțiunile</Button>
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="font-display text-lg font-semibold">Politică fixă</h2>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{form.basePolicy}</pre>
          {preview ? <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-6">{preview}</pre> : null}
          <p className="mt-4 text-sm text-[var(--muted)]">{form.note}</p>
        </section>
      </form>
    </div>
  );
}
