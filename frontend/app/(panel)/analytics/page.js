"use client";

import { useEffect, useState } from "react";
import { ChartColumn } from "lucide-react";
import { AnsweredMissedChart, CallsOverTime } from "../../../components/CallCharts";
import { EmptyState, PageHeader } from "../../../components/ui";
import { api } from "../../../lib/api";
import { formatDuration } from "../../../lib/format";

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/v1/analytics").then((result) => setData(result.data)).catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Analiză"
        title="Trafic înregistrat"
        description="Graficele folosesc apelurile salvate din ultimele 14 zile. O bază de date goală rămâne o stare goală."
      />
      {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
      {data && data.totals.calls === 0 ? (
        <EmptyState icon={<ChartColumn size={22} />} title="Nicio analiză încă" body="Numărul de apeluri răspunse și pierdute se calculează din documentele reale de apel. Nimic nu este completat înainte." />
      ) : null}
      {data && data.totals.calls > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <h2 className="font-display mb-2 text-lg font-semibold">Apeluri în timp</h2>
            <CallsOverTime series={data.series} />
          </section>
          <section className="panel p-4">
            <h2 className="font-display mb-2 text-lg font-semibold">Răspunse și pierdute</h2>
            <AnsweredMissedChart distribution={data.distribution} />
            <p className="text-sm text-[var(--muted)]">
              {data.totals.calls} apeluri · {data.totals.aiAnswered} preluate de AI · {data.totals.missed} pierdute · medie {formatDuration(data.totals.averageDurationSeconds)}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
