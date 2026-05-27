export function SummaryCards({ summary }: { summary?: { latestValue: number; average: number; trend: string; count: number } }) {
  if (!summary) return null;

  return (
    <section className="grid">
      <Card label="Latest" value={`${summary.latestValue} °C`} />
      <Card label="Average" value={`${summary.average} °C`} />
      <Card label="Trend" value={summary.trend} />
      <Card label="Samples" value={summary.count} />
    </section>
    
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}