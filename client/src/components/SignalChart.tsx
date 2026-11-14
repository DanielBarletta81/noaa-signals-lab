import { useEffect, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCelsius, formatUtcAxis, formatUtcLong } from "../view/format.js";

type SignalPoint = {
  time: string;
  value: number;
};

type SignalChartProps = {
  series: SignalPoint[];
  selectedIso?: string | null;
  reducedMotion?: boolean;
};

// Palette values match the --sea, --rule, and --muted tokens in index.css.
const SEA = "#7fd0c0";
const RULE = "#2b4558";
const MUTED = "#9fb3c1";
const NUMERAL = "#f4efe3";

// The chart is a picture of the accepted observations only. Every value is also
// listed in the table beneath it, so the chart is not the only route to the data.
export function SignalChart({ series, selectedIso = null, reducedMotion = false }: SignalChartProps) {
  // Animate the line once, on first render only. A later re-render (for example, when an
  // hour is selected) must not replay the entrance, or the series would vanish briefly.
  const hasAnimated = useRef(false);
  useEffect(() => {
    hasAnimated.current = true;
  }, []);
  const animate = !reducedMotion && !hasAnimated.current;

  if (series.length === 0) return null;

  const values = series.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const first = series[0].time;
  const last = series[series.length - 1].time;
  const summary =
    `Line chart of ${series.length} accepted hourly water temperature values, ` +
    `from ${formatUtcLong(first)} to ${formatUtcLong(last)}, ` +
    `ranging from ${low} to ${high} °C. Values are in the table below.`;

  return (
    <figure className="chart" aria-labelledby="chart-title">
      <figcaption id="chart-title" className="chart-title">
        Water temperature, hourly, accepted observations (°C, UTC)
      </figcaption>
      <div className="chart-frame" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 16, right: 44, bottom: 8, left: 4 }}>
            <CartesianGrid stroke={RULE} strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={formatUtcAxis}
              tick={{ fill: MUTED, fontSize: 12 }}
              stroke={RULE}
              minTickGap={28}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: MUTED, fontSize: 12 }}
              stroke={RULE}
              width={56}
              tickFormatter={(value: number) => `${value}`}
              label={{ value: "°C", angle: -90, position: "insideLeft", fill: MUTED, fontSize: 12, offset: 14 }}
            />
            <Tooltip
              cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
              labelFormatter={(label) => formatUtcLong(String(label))}
              formatter={(value) => [formatCelsius(Number(value)), "Observed"]}
              contentStyle={{
                background: "#061018",
                border: `1px solid ${RULE}`,
                borderRadius: 6,
                color: NUMERAL,
              }}
            />
            {selectedIso && (
              <ReferenceLine x={selectedIso} stroke={NUMERAL} strokeWidth={1} strokeDasharray="4 3" />
            )}
            <Line
              type="linear"
              dataKey="value"
              stroke={SEA}
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: SEA, stroke: SEA }}
              activeDot={{ r: 5, fill: NUMERAL, stroke: SEA }}
              isAnimationActive={animate}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
