"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, PageHeader, Select, TextInput, Toggle } from "../../../components/ui";
import { api } from "../../../lib/api";
import { ACTIONS } from "../../../lib/labels";
import { useAuth } from "../../../components/AuthProvider";
import { EnvSettings } from "../../../components/EnvSettings";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });
  const [transfers, setTransfers] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api("/api/v1/settings")
      .then((result) => {
        setSettings(result.data);
        setTransfers((result.data.allowedTransferNumbers || []).join("\n"));
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaved("");
    setError("");
    try {
      const result = await api("/api/v1/settings", {
        method: "PATCH",
        body: {
          aiAnsweringEnabled: settings.aiAnsweringEnabled,
          answerUnknownCallers: settings.answerUnknownCallers,
          fallbackAction: settings.fallbackAction,
          unknownCallerAction: settings.unknownCallerAction,
          priorityProtectionThreshold: Number(settings.priorityProtectionThreshold),
          timezone: settings.timezone,
          defaultCountry: settings.defaultCountry,
          ownerPhoneNumber: settings.ownerPhoneNumber,
          allowedTransferNumbers: transfers.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
          recordingEnabled: settings.recordingEnabled,
          transcriptRetentionDays: Number(settings.transcriptRetentionDays),
          recordingRetentionDays: Number(settings.recordingRetentionDays),
          callMetadataRetentionDays: Number(settings.callMetadataRetentionDays),
        },
      });
      setSettings(result.data);
      setSaved(result.data.recordingMessage || "Setările au fost salvate.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/auth/password", { method: "POST", body: password });
      await logout();
      router.replace("/login");
    } catch (passwordError) {
      setError(passwordError.message);
    }
  }

  async function purge() {
    if (!window.confirm("Aplici acum politica de păstrare? Transcrierile și înregistrările de apel mai vechi vor fi eliminate.")) return;
    const result = await api("/api/v1/settings/privacy/purge", { method: "POST" });
    setSaved(`Au fost eliminate ${result.data.callsDeleted} înregistrări vechi de apel și ${result.data.transcriptsCleared} transcrieri.`);
  }

  if (!settings) return <p className="text-sm text-[var(--muted)]">{error || "Se încarcă setările…"}</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Setări"
        title="Politică și confidențialitate"
        description="Răspunsul automat este oprit până îl pornești. Apelanții necunoscuți sunt ignorați până îi permiți explicit. Înregistrarea rămâne oprită până o ceri, iar și atunci nu există un înregistrator conectat."
      />
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={save}>
        <section className="panel space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">Răspuns</h2>
          <Toggle checked={settings.aiAnsweringEnabled} onChange={(aiAnsweringEnabled) => setSettings({ ...settings, aiAnsweringEnabled })} label="Răspuns AI automat" />
          <Toggle checked={settings.answerUnknownCallers} onChange={(answerUnknownCallers) => setSettings({ ...settings, answerUnknownCallers })} label="Permite AI pentru apelanții necunoscuți când o regulă o cere" />
          <Field label="Rezervă pentru un contact cunoscut fără regulă">
            <Select value={settings.fallbackAction} onChange={(event) => setSettings({ ...settings, fallbackAction: event.target.value })}>
              {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Politică pentru apelanți necunoscuți">
            <Select value={settings.unknownCallerAction} onChange={(event) => setSettings({ ...settings, unknownCallerAction: event.target.value })}>
              {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Prag de protecție a priorității"><TextInput type="number" min="0" max="100" value={settings.priorityProtectionThreshold} onChange={(event) => setSettings({ ...settings, priorityProtectionThreshold: event.target.value })} /></Field>
          <Field label="Fus orar"><TextInput value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} /></Field>
          <Field label="Țară implicită"><TextInput value={settings.defaultCountry} onChange={(event) => setSettings({ ...settings, defaultCountry: event.target.value.toUpperCase() })} /></Field>
        </section>
        <section className="panel space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">Transfer și păstrare</h2>
          <Field label="Numărul de telefon al proprietarului" hint="Destinația implicită pentru un transfer autorizat.">
            <TextInput value={settings.ownerPhoneNumber || ""} onChange={(event) => setSettings({ ...settings, ownerPhoneNumber: event.target.value })} />
          </Field>
          <Field label="Numere suplimentare de transfer" hint="Un număr E.164 sau local pe fiecare rând.">
            <textarea className="field min-h-24" value={transfers} onChange={(event) => setTransfers(event.target.value)} />
          </Field>
          <Toggle checked={settings.recordingEnabled} onChange={(recordingEnabled) => setSettings({ ...settings, recordingEnabled })} label="Cere înregistrarea apelurilor" />
          <p className="text-xs leading-5 text-[var(--muted)]">{settings.recordingMessage}</p>
          <Field label="Păstrarea transcrierilor (zile)"><TextInput type="number" min="1" value={settings.transcriptRetentionDays} onChange={(event) => setSettings({ ...settings, transcriptRetentionDays: event.target.value })} /></Field>
          <Field label="Păstrarea referințelor de înregistrare (zile)"><TextInput type="number" min="1" value={settings.recordingRetentionDays} onChange={(event) => setSettings({ ...settings, recordingRetentionDays: event.target.value })} /></Field>
          <Field label="Păstrarea înregistrărilor de apel (zile)"><TextInput type="number" min="1" value={settings.callMetadataRetentionDays} onChange={(event) => setSettings({ ...settings, callMetadataRetentionDays: event.target.value })} /></Field>
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          {saved ? <p className="text-sm text-[var(--good)]">{saved}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Salvează setările</Button>
            <Button type="button" variant="quiet" onClick={purge}>Aplică păstrarea acum</Button>
          </div>
        </section>
      </form>
      <EnvSettings />
      <section className="panel mt-4 space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Cont</h2>
        <p className="text-sm text-[var(--muted)]">{user?.name} · {user?.email}</p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={changePassword}>
          <Field label="Parola curentă"><TextInput type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></Field>
          <Field label="Parolă nouă"><TextInput type="password" minLength={10} value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} required /></Field>
          <Button type="submit" variant="quiet">Schimbă parola</Button>
        </form>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge>Identificatorul apelantului poate fi falsificat</Badge>
          <Badge>Înregistrarea este opțională</Badge>
          <Badge>Producția necesită un temei legal documentat</Badge>
        </div>
      </section>
    </div>
  );
}
