"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge, Button, EmptyState, PageHeader } from "../../../components/ui";
import { api } from "../../../lib/api";
import { formatWhen, statusLabel } from "../../../lib/format";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [fcm, setFcm] = useState(null);
  const [error, setError] = useState("");

  function load() {
    return api("/api/v1/notifications")
      .then((result) => {
        setItems(result.data.items);
        setFcm(result.data.fcm);
      })
      .catch((loadError) => setError(loadError.message));
  }

  useEffect(() => {
    let cancelled = false;
    api("/api/v1/notifications")
      .then((result) => {
        if (cancelled) return;
        setItems(result.data.items);
        setFcm(result.data.fcm);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Notificări"
        title="Centru intern"
        description="Evenimentele rămân în acest centru. Push-ul pleacă doar dacă Firebase este configurat și telefonul are un dispozitiv înregistrat."
        actions={<Button variant="quiet" onClick={async () => { await api("/api/v1/notifications/read-all", { method: "POST" }); await load(); }}>Marchează toate ca citite</Button>}
      />
      {fcm ? <div className="mb-4"><Badge>{fcm.detail}</Badge></div> : null}
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
      {items.length === 0 ? (
        <EmptyState icon={<Bell size={22} />} title="Nicio notificare" body="Un apel AI nou, un apel pierdut, o cerere urgentă, o revenire, o deconectare a telefoniei sau o eroare a furnizorului vor apărea aici când evenimentul este înregistrat." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{item.title}</h2>
                <Badge>{statusLabel(item.type)}</Badge>
                {!item.read ? <Badge tone="warn">Necitită</Badge> : null}
              </div>
              <p className="mt-2 text-sm leading-6">{item.body}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{formatWhen(item.createdAt)} · {item.delivery?.fcmDetail || statusLabel(item.delivery?.fcm || "not_configured")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.callId ? <Link className="inline-flex items-center rounded-full px-3 py-2 text-sm text-[var(--accent)]" href={`/calls?id=${item.callId}`}>Deschide apelul</Link> : null}
                {!item.read ? <Button variant="quiet" onClick={async () => { await api(`/api/v1/notifications/${item.id}/read`, { method: "PATCH" }); await load(); }}>Marchează ca citită</Button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
