export type DailyTemps = {
  dates: string[];
  tmax: (number | null)[];
  tmin: (number | null)[];
};

export async function fetchForecastDaily(
  lat: number,
  lon: number,
  days = 14,
): Promise<DailyTemps> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,temperature_2m_mean",
  );
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo forecast failed: ${res.status}`);
  const json = (await res.json()) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
  };
  const d = json.daily ?? {};
  return {
    dates: d.time ?? [],
    tmax: d.temperature_2m_max ?? [],
    tmin: d.temperature_2m_min ?? [],
  };
}

export async function fetchArchiveDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<DailyTemps> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo archive failed: ${res.status}`);
  const json = (await res.json()) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
  };
  const d = json.daily ?? {};
  return {
    dates: d.time ?? [],
    tmax: d.temperature_2m_max ?? [],
    tmin: d.temperature_2m_min ?? [],
  };
}
