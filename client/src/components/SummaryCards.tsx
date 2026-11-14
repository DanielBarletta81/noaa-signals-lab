type Summary = {
  latestValue: number;
  latestTimestampUtc: string;
  average: number;
  min: number;
  max: number;
  count: number;
};

// The former "Trend" card is removed. It was a last-step comparison presented as a
// trend. A time-window trend will be added with its own method and tests.
export function SummaryCards({ summary }: { summary?: Summary | null }) {
  if (!summary) return null;

  return (
    <section className="grid">
      <Card
        label="Latest"
        value={`${summary.latestValue} °C`}
        sub={`Observed ${formatUtc(summary.latestTimestampUtc)}`}
      />
      <Card
        label="Average"
        value={`${summary.average} °C`}
        sub={`Mean of ${summary.count} accepted observations`}
      />
      <Card label="Minimum" value={`${summary.min} °C`} />
      <Card label="Maximum" value={`${summary.max} °C`} />
    </section>
  );
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <span className="data-sub">{sub}</span>}
    </div>
  );
}

// "2026-11-14T00:00:00.000Z" -> "2026-11-14 00:00 UTC"
function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
