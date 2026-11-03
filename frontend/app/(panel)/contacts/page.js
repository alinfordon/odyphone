"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Select, TextArea, TextInput, Toggle } from "../../../components/ui";
import { api } from "../../../lib/api";
import { CATEGORIES, categoryLabel } from "../../../lib/labels";

const EMPTY = {
  name: "",
  phoneNumber: "",
  category: "Other",
  description: "",
  relationship: "",
  aiEnabled: false,
  greeting: "",
  customInstructions: "",
  priority: 0,
  enabled: true,
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback((nextQuery = query, nextCategory = category) => {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (nextCategory) params.set("category", nextCategory);
    return api(`/api/v1/contacts?${params.toString()}`)
      .then((result) => setContacts(result.data))
      .catch((loadError) => setError(loadError.message));
  }, [query, category]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);

  function edit(contact) {
    setEditing(contact.id);
    setForm({
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      category: contact.category,
      description: contact.description || "",
      relationship: contact.relationship || "",
      aiEnabled: contact.aiEnabled,
      greeting: contact.greeting || "",
      customInstructions: contact.customInstructions || "",
      priority: contact.priority,
      enabled: contact.enabled,
    });
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const body = { ...form, priority: Number(form.priority) };
      if (editing) await api(`/api/v1/contacts/${editing}`, { method: "PATCH", body });
      else await api("/api/v1/contacts", { method: "POST", body });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPending(false);
    }
  }

  async function remove(contact) {
    if (!window.confirm(`Ștergi contactul ${contact.name}?`)) return;
    await api(`/api/v1/contacts/${contact.id}`, { method: "DELETE" });
    await load();
  }

  async function toggleAi(contact) {
    await api(`/api/v1/contacts/${contact.id}`, { method: "PATCH", body: { aiEnabled: !contact.aiEnabled } });
    await load();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Contacte"
        title="Persoane autorizate"
        description="Un apelant este autorizat doar printr-un număr salvat. Numele afișat nu este suficient. Numerele se salvează în format E.164."
        actions={<Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }}>Adaugă contact</Button>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <TextInput placeholder="Caută nume sau număr" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="sm:max-w-48">
          <option value="">Toate categoriile</option>
          {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
      {contacts.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="Niciun contact încă" body="Adaugă o persoană înainte de o regulă care îi preia apelurile. Numerele necunoscute rămân fără răspuns până schimbi acea politică." />
      ) : (
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <article key={contact.id} className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">{contact.name}</h2>
                  <Badge>{categoryLabel(contact.category)}</Badge>
                  <Badge tone={contact.aiEnabled ? "good" : "neutral"}>{contact.aiEnabled ? "AI permis" : "AI oprit"}</Badge>
                  {contact.priority >= 80 ? <Badge tone="warn">Prioritate {contact.priority}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{contact.phoneNumber} · {contact.normalizedPhoneNumber}</p>
                {contact.greeting ? <p className="mt-2 text-sm">{contact.greeting}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" onClick={() => toggleAi(contact)}>{contact.aiEnabled ? "Oprește AI" : "Permite AI"}</Button>
                <Button variant="quiet" onClick={() => edit(contact)}>Editează</Button>
                <Button variant="danger" onClick={() => remove(contact)}>Șterge</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={open} title={editing ? "Editează contactul" : "Adaugă contact"} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <Field label="Nume"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Număr de telefon" hint="Exemplu: 0722 123 456 sau +40 722 123 456"><TextInput value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} required /></Field>
          <Field label="Categorie">
            <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Relație"><TextInput value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} /></Field>
          <Field label="Descriere"><TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="Formulă de salut personală"><TextArea value={form.greeting} onChange={(event) => setForm({ ...form, greeting: event.target.value })} /></Field>
          <Field label="Instrucțiuni doar pentru acest contact"><TextArea value={form.customInstructions} onChange={(event) => setForm({ ...form, customInstructions: event.target.value })} /></Field>
          <Field label="Prioritate" hint="80 sau mai mult este protejat de regulile generale de blocare."><TextInput type="number" min="0" max="100" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /></Field>
          <Toggle checked={form.aiEnabled} onChange={(aiEnabled) => setForm({ ...form, aiEnabled })} label="AI poate răspunde acestui contact când o regulă o cere" />
          <Toggle checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} label="Contactul este activ" />
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Se salvează…" : "Salvează contactul"}</Button>
        </form>
      </Modal>
    </div>
  );
}
