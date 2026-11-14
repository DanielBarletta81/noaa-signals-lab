// Shows the neutral summary produced by the server, followed by its limitations.
// The text is measured values and caveats only. It contains no judgment about
// whether the temperature is healthy, harmful, or unusual.
export function InsightPanel({
  insight = "",
  limitations = [],
}: {
  insight?: string;
  limitations?: string[];
}) {
  return (
    <section className="card insight">
      <p className="eyebrow">Summary of observations</p>
      <h2>What the observations show</h2>
      <p>{insight}</p>
      {limitations.length > 0 && (
        <>
          <h3>Limits of this summary</h3>
          <ul>
            {limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
