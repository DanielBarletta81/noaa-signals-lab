type Summary = {
  average: number;
  min: number;
  max: number;
  count: number;
};

// Derived numbers from the accepted observations. They are labelled as derived, so
// they are not mistaken for separate measurements. The latest value is shown in the
// readout, not repeated here. No trend is shown: it is not calculated in this version.
export function SummaryCards({ summary }: { summary?: Summary | null }) {
  if (!summary) return null;

  return (
    <section className="panel panel--instrument" aria-labelledby="derived-title">
      <p className="panel-kicker">Instrument · derived from accepted observations</p>
      <h2 id="derived-title">Summary of this window</h2>
      <dl className="derived-list">
        <div>
          <dt>Mean</dt>
          <dd>{summary.average} °C</dd>
        </div>
        <div>
          <dt>Minimum</dt>
          <dd>{summary.min} °C</dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>{summary.max} °C</dd>
        </div>
        <div>
          <dt>Accepted observations</dt>
          <dd>{summary.count}</dd>
        </div>
      </dl>
    </section>
  );
}
