"use client";

import { useEffect, useState } from "react";
import { Waypoints } from "lucide-react";
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from "../../../components/ui";
import { api } from "../../../lib/api";
import { statusLabel } from "../../../lib/format";
import { ACTIONS, CATEGORIES, MATCH_TYPES, actionLabel, categoryLabel, matchLabel } from "../../../lib/labels";

const EMPTY = {
  name: "",
  description: "",
  enabled: true,
  priority: 50,
  matchType: "exact_number",
  phoneNumber: "",
  category: "Family",
  action: "ai_answer",
  forwardTo: "",
  fallbackAction: "ring_owner",
  scheduleEnabled: false,
  days: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
};

const DAY_LABELS = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [decision, setDecision] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [developmentMode, setDevelopmentMode] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function load() {
    return api("/api/v1/rules")
      .then((result) => setRules(result.data))
      .catch((loadError) => setError(loadError.message));
  }

  useEffect(() => {
    let cancelled = false;
    api("/api/v1/rules")
      .then((result) => {
        if (!cancelled) setRules(result.data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      });
    api("/api/v1/status")
      .then((result) => {
        if (!cancelled) setDevelopmentMode(Boolean(result.data.developmentMode));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function payloadFrom(source) {
    return {
      name: source.name,
      description: source.description,
      enabled: source.enabled,
      priority: Number(source.priority),
      matchType: source.matchType,
      phoneNumber: source.matchType === "exact_number" ? source.phoneNumber : undefined,
      category: source.matchType === "contact_group" ? source.category : undefined,
      action: source.action,
      forwardTo: source.action === "forward_to_number" ? source.forwardTo : undefined,
      fallbackAction: source.fallbackAction || undefined,
      schedule: {
        enabled: source.scheduleEnabled,
        days: source.days,
        startTime: source.startTime,
        endTime: source.endTime,
      },
    };
  }

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body = payloadFrom(form);
      if (editing) await api(`/api/v1/rules/${editing}`, { method: "PATCH", body });
      else await api("/api/v1/rules", { method: "POST", body });
      setOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPending(false);
    }
  }

  async function simulateLifecycle() {
    setError("");
    setSimulation(null);
    try {
      const result = await api("/api/v1/telephony/simulate", { method: "POST", body: { phoneNumber } });
      setSimulation(result.data);
    } catch (simulateError) {
      setError(simulateError.message);
    }
  }

  async function testNumber(event) {
    event.preventDefault();
    setError("");
    setDecision(null);
    try {
      const result = await api("/api/v1/rules/test", { method: "POST", body: { phoneNumber } });
      setDecision(result.data);
    } catch (testError) {
      setError(testError.message);
    }
  }

  function edit(rule) {
    setEditing(rule.id);
    setForm({
      ...EMPTY,
      ...rule,
      scheduleEnabled: Boolean(rule.schedule?.enabled),
      days: rule.schedule?.days || [],
      startTime: rule.schedule?.startTime || "09:00",
      endTime: rule.schedule?.endTime || "17:00",
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reguli de apel"
        title="Cine poate primi răspuns"
        description="Motorul alege o acțiune. Nu plasează un apel. Apelanții necunoscuți rămân fără răspuns până activezi acea politică. Contactele prioritare nu sunt blocate de o regulă generală."
        actions={<Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }}>Adaugă regulă</Button>}
      />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {rules.length === 0 ? (
            <EmptyState icon={<Waypoints size={22} />} title="Nicio regulă încă" body="Fără o regulă potrivită, un contact activ urmează rezerva din Setări. Numerele necunoscute urmează politica pentru apelanți necunoscuți, care implicit îi ignoră." />
          ) : rules.map((rule) => (
            <article key={rule.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold">{rule.name}</h2>
                <Badge>Prioritate {rule.priority}</Badge>
                <Badge tone={rule.enabled ? "good" : "neutral"}>{rule.enabled ? "Activă" : "Inactivă"}</Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{actionLabel(rule.action)} · {matchLabel(rule.matchType)}{rule.phoneNumber ? ` · ${rule.phoneNumber}` : ""}{rule.category ? ` · ${categoryLabel(rule.category)}` : ""}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="quiet" onClick={() => edit(rule)}>Editează</Button>
                <Button variant="danger" onClick={async () => { await api(`/api/v1/rules/${rule.id}`, { method: "DELETE" }); await load(); }}>Șterge</Button>
              </div>
            </article>
          ))}
        </div>
        <form className="panel h-fit space-y-3 p-4" onSubmit={testNumber}>
          <h2 className="font-display text-lg font-semibold">Test regulă</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Introdu un număr ca să vezi decizia. Evaluarea nu scrie un apel. Simularea ciclului, în modul de dezvoltare, scrie o înregistrare marcată ca simulată și nu contactează rețeaua.</p>
          <TextInput value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+40 722 123 456" required />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Evaluează</Button>
            {developmentMode ? <Button type="button" variant="quiet" onClick={simulateLifecycle}>Simulează ciclul</Button> : null}
          </div>
          {decision ? (
            <div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-6">
              <p className="font-semibold">{actionLabel(decision.action)}</p>
              <p className="text-[var(--muted)]">{decision.message}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          ) : null}
          {simulation ? (
            <div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-6">
              <p className="font-semibold">Simulare · {statusLabel(simulation.call.callStatus)}</p>
              <p>{simulation.message}</p>
              <p className="text-[var(--muted)]">Nu este un apel live și nu a fost trimis în rețeaua telefonică.</p>
            </div>
          ) : null}
        </form>
      </div>
      {error ? <p className="mt-4 text-sm text-[var(--bad)]">{error}</p> : null}
      <Modal open={open} title={editing ? "Editează regula" : "Adaugă regulă"} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <Field label="Nume"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Prioritate" hint="Numărul mai mare este evaluat primul."><TextInput type="number" min="0" max="1000" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} required /></Field>
          <Field label="Potrivire">
            <Select value={form.matchType} onChange={(event) => setForm({ ...form, matchType: event.target.value })}>
              {MATCH_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          {form.matchType === "exact_number" ? <Field label="Număr de telefon"><TextInput value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} required /></Field> : null}
          {form.matchType === "contact_group" ? (
            <Field label="Categorie">
              <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Acțiune">
            <Select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}>
              {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          {form.action === "forward_to_number" ? <Field label="Redirecționează către"><TextInput value={form.forwardTo} onChange={(event) => setForm({ ...form, forwardTo: event.target.value })} required /></Field> : null}
          <Field label="Rezervă dacă AI nu este permis">
            <Select value={form.fallbackAction} onChange={(event) => setForm({ ...form, fallbackAction: event.target.value })}>
              {ACTIONS.filter(([value]) => value !== "ai_answer").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Descriere"><TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <Toggle checked={form.scheduleEnabled} onChange={(scheduleEnabled) => setForm({ ...form, scheduleEnabled })} label="Limitează regula la un program" />
          {form.scheduleEnabled ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, index) => (
                  <button
                    type="button"
                    key={label}
                    className={`rounded-full px-3 py-1 text-xs ${form.days.includes(index) ? "bg-[var(--button)] text-white" : "border border-[var(--line)]"}`}
                    onClick={() => setForm((current) => ({
                      ...current,
                      days: current.days.includes(index) ? current.days.filter((day) => day !== index) : [...current.days, index],
                    }))}
                  >{label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextInput type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
                <TextInput type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
              </div>
            </div>
          ) : null}
          <Toggle checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} label="Regula este activă" />
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Se salvează…" : "Salvează regula"}</Button>
        </form>
      </Modal>
    </div>
  );
}
