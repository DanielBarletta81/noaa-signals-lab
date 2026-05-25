import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function SignalChart({ series }) {
  return (
    <section className="card">
      <p className="eyebrow">NOAA Signal</p>
      <h2>Water Temperature — Last 24 Hours</h2>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={series}>
            <XAxis dataKey="time" hide />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#38bdf8" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}