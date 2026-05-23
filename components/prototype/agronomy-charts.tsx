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

export type MultiSeriesPoint = {
  date: string;
  [seriesKey: string]: number | string | null;
};

export type ChartSeries = {
  key: string;
  name: string;
  color: string;
};

export function WeatherForecastChart({
  data,
  series,
}: {
  data: MultiSeriesPoint[];
  series?: ChartSeries[];
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
        Save fields with acquisition windows to load Open-Meteo temperatures.
      </p>
    );
  }

  const lines = series?.length
    ? series
    : [
        { key: "tmax", name: "Daily max", color: "#86efac" },
        { key: "tmin", name: "Daily min", color: "#4ade80" },
      ];

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
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GddChart({
  data,
  series,
}: {
  data: MultiSeriesPoint[];
  series?: ChartSeries[];
}) {
  if (!data.length) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
        Save fields with acquisition windows to compute GDD from Open-Meteo daily highs/lows.
      </p>
    );
  }

  const lines = series?.length
    ? series
    : [{ key: "cumulative", name: "GDD (°C·d)", color: "#fbbf24" }];

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
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
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
