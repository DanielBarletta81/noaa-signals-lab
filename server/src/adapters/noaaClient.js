const BASE_URL =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

export async function fetchNoaaProduct({
  station = "8454000",
  product = "water_temperature",
  range = 24,
  interval = "h",
}) {
  const params = new URLSearchParams({
    product,
    application: "noaa_signal_explorer",
    station,
    range: String(range),
    time_zone: "lst_ldt",
    units: "metric",
    format: "json",
  });

  if (interval) {
    params.set("interval", interval);
  }

  const url = `${BASE_URL}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NOAA request failed: ${response.status}`);
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(json.error.message || "NOAA API returned an error.");
  }

  return normalizeNoaaResponse(json, { station, product });
}

function normalizeNoaaResponse(json, meta) {
  const rows = json.data || [];

  return rows
    .map((row) => ({
      station: meta.station,
      product: meta.product,
      timestamp: row.t,
      value: Number(row.v),
      flags: {
        quality: row.q ?? null,
        flag: row.f ?? null,
      },
    }))
    .filter((point) => Number.isFinite(point.value));
}