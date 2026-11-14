// The neutral summary produced by the server, followed by its limitations. The text
// contains measured values and caveats only. It makes no judgment about whether the
// temperature is healthy, harmful, or unusual.
export function InsightPanel({
  insight = "",
  limitations = [],
}: {
  insight?: string;
  limitations?: string[];
}) {
  return (
    <section className="panel" aria-labelledby="insight-title">
      <p className="panel-kicker">Context</p>
      <h2 id="insight-title">What the observations show</h2>
      <p className="panel-body">{insight}</p>
      {limitations.length > 0 && (
        <>
          <h3>Limits of this summary</h3>
          <ul className="plain-list">
            {limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
