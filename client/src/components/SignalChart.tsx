
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

export function SignalChart({ series }: SignalChartProps) {
  return (
    <section className="card">
      <p className="eyebrow">NOAA Signal</p>
      <h2>Water Temperature — Last 24 Hours</h2>
      <pre>{JSON.stringify(series?.slice?.(0, 3), null, 2)}</pre>
      <ResponsiveContainer width="100%" height={300} >
        <LineChart data={series}>
          <XAxis dataKey="time" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} domain={["dataMin - 5", "dataMax + 5"]} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#8884d8" dot={false} />
        </LineChart>
      </ResponsiveContainer>    
    </section>
  );
}