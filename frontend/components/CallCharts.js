"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#4c6fff", "#d9893b", "#7d8da8"];

export function CallsOverTime({ series }) {
  if (!series?.length) return null;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Area type="monotone" dataKey="total" name="Apeluri" stroke="#4c6fff" fill="#4c6fff" fillOpacity={0.18} />
          <Area type="monotone" dataKey="missed" name="Pierdute" stroke="#d9893b" fill="#d9893b" fillOpacity={0.12} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnsweredMissedChart({ distribution }) {
  if (!distribution?.length) return null;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3}>
            {distribution.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
