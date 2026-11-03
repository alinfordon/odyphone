"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Badge, Button, EmptyState, PageHeader, Select, TextInput } from "../../../components/ui";
import { api } from "../../../lib/api";
import { formatDuration, formatWhen, statusLabel } from "../../../lib/format";
import { intentLabel, requestLabel } from "../../../lib/labels";

export default function CallsPage() {
  const [calls, setCalls] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 0, total: 0 });
  const [filters, setFilters] = useState({ q: "", status: "", sort: "startedAt", page: 1, actionRequired: false });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("follow") === "1") {
      setFilters((current) => ({ ...current, actionRequired: true, status: "", page: 1 }));
    }
    const id = params.get("id");
    if (!id) return;
    api(`/api/v1/calls/${id}`).then((result) => setSelected(result.data)).catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(filters.page), limit: "20", sort: filters.sort });
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.actionRequired) params.set("actionRequired", "true");
    api(`/api/v1/calls?${params.toString()}`)
      .then((result) => {
        setCalls(result.data);
        setMeta(result.meta);
      })
      .catch((loadError) => setError(loadError.message));
  }, [filters]);

  async function exportCalls(format) {
    const response = await fetch(`/api/v1/calls/export?format=${format}`, { credentials: "include" });
    if (!response.ok) {
      setError("Exportul a eșuat.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = format === "csv" ? "ody-calls.csv" : "ody-calls.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Istoric apeluri"
        title="Apeluri salvate"
        description="Aici apar doar apelurile scrise de serviciul de telefonie. Înregistrarea este oprită. Identificatorul apelantului nu dovedește identitatea."
        actions={
          <>
            <Button variant="quiet" onClick={() => exportCalls("csv")}>Exportă CSV</Button>
            <Button variant="quiet" onClick={() => exportCalls("json")}>Exportă JSON</Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <TextInput placeholder="Caută număr, nume sau rezumat" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} />
        <Select value={filters.actionRequired ? "follow" : filters.status} onChange={(event) => {
          const value = event.target.value;
          if (value === "follow") setFilters({ ...filters, actionRequired: true, status: "", page: 1 });
          else setFilters({ ...filters, actionRequired: false, status: value, page: 1 });
        }}>
          <option value="">Toate stările</option>
          <option value="follow">De urmărit</option>
          {["ringing", "answered", "completed", "missed", "rejected", "failed", "ignored", "voicemail"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </Select>
        <Select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
          <option value="startedAt">Cele mai noi</option>
          <option value="duration">Cele mai lungi</option>
          <option value="status">Stare</option>
        </Select>
      </div>
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
      {calls.length === 0 ? (
        <EmptyState icon={<History size={22} />} title="Niciun apel în istoric" body="Căutarea și filtrele sunt gata. Nu există nimic de afișat până se salvează un apel real." />
      ) : (
        <div className="panel overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2">Apelant</th>
                <th className="py-2">Când</th>
                <th className="py-2">Durată</th>
                <th className="py-2">Stare</th>
                <th className="py-2">AI</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="cursor-pointer border-t border-[var(--line)]" onClick={() => setSelected(call)}>
                  <td className="py-3">{call.contactName || "Necunoscut"}<div className="text-xs text-[var(--muted)]">{call.callerNumber}</div></td>
                  <td className="py-3">{formatWhen(call.startedAt)}</td>
                  <td className="py-3">{formatDuration(call.duration)}</td>
                  <td className="py-3">{statusLabel(call.callStatus)}</td>
                  <td className="py-3">{call.aiHandled ? "Preluat" : "Nepreluat"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">{meta.total} înregistrări</span>
            <div className="flex gap-2">
              <Button variant="quiet" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Înapoi</Button>
              <Button variant="quiet" disabled={filters.page >= meta.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Înainte</Button>
            </div>
          </div>
        </div>
      )}
      {selected ? (
        <aside className="panel mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">{selected.contactName || selected.callerNumber}</h2>
              <p className="text-sm text-[var(--muted)]">{selected.callerNumber} · {statusLabel(selected.callStatus)} · {selected.execution}</p>
            </div>
            <Button variant="quiet" onClick={() => setSelected(null)}>Închide</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{selected.aiHandled ? "Preluat de AI" : "Nepreluat de AI"}</Badge>
            {selected.actionRequired && !selected.attentionResolved ? <Badge tone="warn">{requestLabel(selected.requestedAction)}</Badge> : null}
            {selected.simulated ? <Badge tone="warn">Simulat</Badge> : null}
          </div>
          <p className="mt-4 text-sm leading-6">{selected.summary || "Nu există un rezumat salvat. Rezumatul citează apelantul și nu promite o oră de revenire."}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Intenție: {intentLabel(selected.callerIntent)}</p>
          <h3 className="mt-4 text-sm font-semibold">Transcriere</h3>
          {selected.transcript?.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {selected.transcript.map((line, index) => <li key={`${line.at}-${index}`}><span className="text-[var(--muted)]">{line.role === "caller" ? "apelant" : line.role === "assistant" ? "asistent" : "sistem"}: </span>{line.text}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-[var(--muted)]">Nu există o transcriere salvată. Înregistrarea este oprită.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="quiet" onClick={async () => {
              try {
                const result = await api(`/api/v1/calls/${selected.id}/summary`, { method: "POST" });
                setSelected(result.data);
                setFilters({ ...filters });
              } catch (summaryError) {
                setError(summaryError.message);
              }
            }}>Actualizează rezumatul</Button>
            <Button variant="quiet" onClick={async () => {
              const result = await api(`/api/v1/calls/${selected.id}`, { method: "PATCH", body: { attentionResolved: true, read: true } });
              setSelected(result.data);
              setFilters({ ...filters });
            }}>Marchează urmărirea ca rezolvată</Button>
            <Button variant="danger" onClick={async () => {
              await api(`/api/v1/calls/${selected.id}`, { method: "DELETE" });
              setSelected(null);
              setFilters({ ...filters });
            }}>Șterge înregistrarea</Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Rezolvarea marchează cererea în panou. Nu stabilește o oră la care proprietarul va suna.</p>
        </aside>
      ) : null}
    </div>
  );
}
