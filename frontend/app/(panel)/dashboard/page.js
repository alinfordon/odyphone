"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneOff } from "lucide-react";
import { CallsOverTime } from "../../../components/CallCharts";
import { Badge, EmptyState, PageHeader } from "../../../components/ui";
import { api } from "../../../lib/api";
import { formatDuration, formatWhen, statusLabel } from "../../../lib/format";

export default function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/v1/analytics/overview"), api("/api/v1/analytics"), api("/api/v1/status")])
      .then(([overviewResult, analyticsResult, statusResult]) => {
        setOverview(overviewResult.data);
        setAnalytics(analyticsResult.data);
        setStatus(statusResult.data);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  const today = overview?.today;
  const cards = [
    ["Apeluri azi", today ? String(today.total) : "—", "Numărate din înregistrările de apeluri"],
    ["Răspuns AI", today ? String(today.aiAnswered) : "—", "Înregistrări marcate ca preluate de AI"],
    ["Pierdute", today ? String(today.missed) : "—", "Apeluri pierdute salvate"],
    ["Durată medie", today ? formatDuration(today.averageDurationSeconds) : "—", today?.averageDurationSeconds == null ? "Niciun apel încheiat" : "Apeluri încheiate azi"],
    ["Necesită atenție", today ? String(today.needsAttention) : "—", "Marcaje de urmărire nerezolvate"],
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Privire de ansamblu"
        title="Azi"
        description="Cifrele vin din apelurile înregistrate în MongoDB. Apelurile simulate nu intră în numărătoare."
      />
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}. Nu se afișează statistici.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value, hint]) => (
          <article key={label} className="panel p-4">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="font-display mt-2 text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
            {label === "Necesită atenție" ? <Link className="mt-2 inline-block text-xs text-[var(--accent)]" href="/calls?follow=1">Deschide urmăririle</Link> : null}
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="panel p-4 xl:col-span-2">
          <h2 className="font-display text-lg font-semibold">Apeluri în timp</h2>
          {analytics?.series?.length ? <CallsOverTime series={analytics.series} /> : <div className="mt-4"><EmptyState icon={<PhoneOff size={22} />} title="Nicio cronologie a apelurilor" body="Graficul apare după ce baza de date conține cel puțin un apel care nu este simulat." /></div>}
        </section>
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">Starea serviciilor</h2>
          <StatusRow label="Disponibilitate AI" value={status?.aiAnsweringEnabled ? "Comutator pornit" : "Comutator oprit"} />
          <StatusRow label="SIP" value={status?.sip?.state || "unknown"} detail={status?.sip?.message} />
          <StatusRow label="Asterisk" value={status?.asterisk?.state || "unknown"} detail={status?.asterisk?.message} />
          <StatusRow label="Evenimente ARI" value={status?.ariEvents?.connected ? "Conectate" : "Neconectate"} detail={status?.ariEvents?.detail} />
          <StatusRow label="Cale vocală" value={status?.voicePipeline?.connected ? "Conectată" : "Neconectată"} detail={status?.voicePipeline?.message} />
        </section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="font-display mb-3 text-lg font-semibold">Apeluri recente</h2>
          {overview?.recentCalls?.length ? (
            <CallTable calls={overview.recentCalls} />
          ) : (
            <EmptyState icon={<PhoneOff size={22} />} title="Niciun apel înregistrat" body="Apelurile primite apar aici după ce serviciul de telefonie le scrie. Acest ecran nu inventează apeluri de exemplu." />
          )}
        </section>
        <div className="space-y-4">
          <section className="panel p-4">
            <h2 className="font-display mb-3 text-lg font-semibold">Activitate recentă a apelanților</h2>
            {overview?.recentActivity?.length ? (
              <ul className="space-y-3 text-sm">
                {overview.recentActivity.map((item) => (
                  <li key={item.callerNumber} className="flex items-center justify-between gap-3">
                    <span>{item.contactName || item.callerNumber}</span>
                    <span className="text-[var(--muted)]">{formatWhen(item.lastAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--muted)]">Nu există activitate a apelanților.</p>}
          </section>
          <section className="panel p-4">
            <h2 className="font-display mb-3 text-lg font-semibold">Reveniri în așteptare</h2>
            {overview?.pendingCallbacks?.length ? (
              <ul className="space-y-3 text-sm">
                {overview.pendingCallbacks.map((item) => (
                  <li key={item.id}>
                    <p className="font-medium">{item.callerNumber}</p>
                    <p className="text-[var(--muted)]">{item.summary || "Revenire cerută"}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--muted)]">Nu există cereri de revenire.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, detail }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--muted)]">{label}</span>
        <Badge>{statusLabel(value)}</Badge>
      </div>
      {detail ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}

function CallTable({ calls }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[var(--muted)]">
          <tr>
            <th className="py-2 font-medium">Apelant</th>
            <th className="py-2 font-medium">Când</th>
            <th className="py-2 font-medium">Stare</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id} className="border-t border-[var(--line)]">
              <td className="py-2">{call.contactName || call.callerNumber}</td>
              <td className="py-2">{formatWhen(call.startedAt)}</td>
              <td className="py-2">{statusLabel(call.callStatus)}{call.execution === "not_executed" ? " · netrimis în rețea" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
