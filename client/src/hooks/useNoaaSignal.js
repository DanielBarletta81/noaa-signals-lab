import { useEffect, useState } from "react";

export function useNoaaSignal() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSignal() {
      try {
        setStatus("loading");
        const res = await fetch(
          "http://localhost:4200/api/signals?station=8454000&product=water_temperature&range=24"
        );
        const json = await res.json();

        if (!json.ok) throw new Error(json.message || "NOAA request failed");

        setData(json);
        setStatus("ready");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    }

    loadSignal();
  }, []);

  return { data, status, error };
}