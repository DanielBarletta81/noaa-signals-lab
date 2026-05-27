export function InsightPanel({ insight = "" }: { insight?: string }) {
  return (
    <section className="card insight">
      <p className="eyebrow">Interpretation Layer</p>
      <h2>What This Means</h2>
      <p>{insight}</p>
    </section>
  );
}