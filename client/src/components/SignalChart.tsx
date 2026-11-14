import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type SignalPoint = {
  time: string;
  value: number;
};

type SignalChartProps = {
  series: SignalPoint[];
};

// "2026-11-13T23:00:00.000Z" -> "11-13 23:00"
function formatTick(iso: string): string {
  return iso.slice(5, 16).replace("T", " ");
}

export function SignalChart({ series }: SignalChartProps) {
  return (
    <section className="card">
      <p className="eyebrow">NOAA Signal</p>
      <h2>Water temperature: {series.length} hourly observations (UTC)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={series}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            tickFormatter={formatTick}
            label={{ value: "Time (UTC)", position: "insideBottom", offset: -4 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: "°C", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            labelFormatter={(label) => `${formatTick(String(label))} UTC`}
            formatter={(value) => [`${value} °C`, "Water temperature"]}
          />
          <Line type="monotone" dataKey="value" stroke="#8884d8" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
