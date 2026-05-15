"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function WeatherForecastChart({
  data,
}: {
  data: { date: string; tmax: number | null; tmin: number | null }[];
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
        Draw a field polygon to load Open-Meteo forecast at the centroid.
      </p>
    );
  }

  return (
    <div className="h-56 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#1e2a1e" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "#8aab8a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8aab8a", fontSize: 10 }} unit="°C" />
          <Tooltip
            contentStyle={{
              background: "#111811",
              border: "1px solid #1e2a1e",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "#f0faf0" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="tmax" name="Daily max" stroke="#86efac" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="tmin" name="Daily min" stroke="#4ade80" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GddChart({ data }: { data: { date: string; cumulative: number }[] }) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
        Set planting date and base temperature to compute GDD from Open-Meteo archive (daily highs/lows).
      </p>
    );
  }

  return (
    <div className="h-56 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#1e2a1e" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "#8aab8a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8aab8a", fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "#111811",
              border: "1px solid #1e2a1e",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line type="monotone" dataKey="cumulative" name="GDD (°C·d)" stroke="#fbbf24" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NdviDemoChart({ data }: { data: { date: string; ndvi: number }[] }) {
  return (
    <div className="h-56 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#1e2a1e" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "#8aab8a", fontSize: 10 }} />
          <YAxis domain={[0, 1]} tick={{ fill: "#8aab8a", fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "#111811",
              border: "1px solid #1e2a1e",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line type="monotone" dataKey="ndvi" name="NDVI (demo)" stroke="#38bdf8" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function buildNdviDemoSeries(days = 90): { date: string; ndvi: number }[] {
  const out: { date: string; ndvi: number }[] = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toISOString().slice(0, 10);
    const wave = 0.55 + 0.2 * Math.sin(i / 11) + 0.08 * Math.sin(i / 4);
    const ndvi = Math.min(0.92, Math.max(0.25, wave));
    out.push({ date: label, ndvi: Math.round(ndvi * 1000) / 1000 });
  }
  return out;
}
