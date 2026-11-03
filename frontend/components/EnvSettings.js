"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Field, TextInput, Toggle } from "./ui";
import { api } from "../lib/api";

function displayValue(field) {
  if (field.kind === "secret") return field.set ? "Setat" : "Nesetat";
  if (field.value === "true") return "Pornit";
  if (field.value === "false") return "Oprit";
  return field.value || "Nesetat";
}

export function EnvSettings() {
  const [groups, setGroups] = useState(null);
  const [values, setValues] = useState({});
  const [secrets, setSecrets] = useState({});
  const [clear, setClear] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  function applyGroups(nextGroups) {
    const nextValues = {};
    for (const group of nextGroups) {
      for (const field of group.fields) {
        if (field.editable && field.kind !== "secret") nextValues[field.key] = field.value || "";
      }
    }
    setGroups(nextGroups);
    setValues(nextValues);
    setSecrets({});
    setClear({});
  }

  useEffect(() => {
    api("/api/v1/settings/environment")
      .then((result) => applyGroups(result.data.groups))
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved("");
    try {
      const result = await api("/api/v1/settings/environment", {
        method: "PATCH",
        body: {
          values: { ...values, ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim())) },
          clear: Object.entries(clear).filter(([, enabled]) => enabled).map(([key]) => key),
        },
      });
      applyGroups(result.data.groups);
      setSaved(result.data.changed.length ? "Configurarea din mediu a fost salvată." : "Nicio valoare din mediu nu s-a schimbat.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPending(false);
    }
  }

  if (!groups) return <p className="mt-4 text-sm text-[var(--muted)]">{error || "Se încarcă configurarea din mediu…"}</p>;

  return (
    <form className="mt-4 space-y-4" onSubmit={save}>
      <div>
        <h2 className="font-display text-2xl font-semibold">Configurare din mediu</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Aici sunt valorile din fișierul de mediu. Secretele nu sunt afișate: completează câmpul doar când vrei să înlocuiești valoarea salvată.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} className="panel space-y-4 p-4">
            <div>
              <h3 className="font-display text-lg font-semibold">{group.title}</h3>
              {group.note ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{group.note}</p> : null}
            </div>
            {group.fields.map((field) => {
              if (!field.editable) {
                return (
                  <div key={field.key} className="flex items-center justify-between gap-3 text-sm">
                    <span>{field.label}</span>
                    <Badge tone={field.set ? "good" : "neutral"}>{displayValue(field)}</Badge>
                  </div>
                );
              }
              if (field.kind === "boolean") {
                return (
                  <Toggle
                    key={field.key}
                    checked={values[field.key] === "true"}
                    onChange={(checked) => setValues((current) => ({ ...current, [field.key]: checked ? "true" : "false" }))}
                    label={field.label}
                  />
                );
              }
              if (field.kind === "secret") {
                return (
                  <div key={field.key} className="space-y-2">
                    <Field label={`${field.label} · ${field.set ? "setat" : "nesetat"}`} hint={field.hint}>
                      <TextInput
                        type="password"
                        autoComplete="new-password"
                        value={secrets[field.key] || ""}
                        onChange={(event) => setSecrets((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </Field>
                    {field.set ? (
                      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <input
                          type="checkbox"
                          checked={Boolean(clear[field.key])}
                          onChange={(event) => setClear((current) => ({ ...current, [field.key]: event.target.checked }))}
                        />
                        Șterge valoarea salvată
                      </label>
                    ) : null}
                  </div>
                );
              }
              return (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <TextInput value={values[field.key] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                </Field>
              );
            })}
          </section>
        ))}
      </div>
      {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
      {saved ? <p className="text-sm text-[var(--good)]">{saved}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Se salvează…" : "Salvează configurarea din mediu"}</Button>
    </form>
  );
}
