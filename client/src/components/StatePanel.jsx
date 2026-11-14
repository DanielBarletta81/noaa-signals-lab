// A state panel for loading, empty, and error outcomes. Error panels use role="alert"
// so the failure is announced. Color is never the only signal: each panel has a
// text label, and a visible retry action appears only when a retry can help.
export function StatePanel({ tone, label, title, body, code, children, onRetry }) {
  const isError = tone === "error";
  return (
    <section
      className={`state-panel state-${tone}${tone === "loading" ? "" : " panel--field"}`}
      aria-labelledby="state-title"
      role={isError ? "alert" : undefined}
    >
      <p className="state-label">{label}</p>
      <h2 id="state-title">{title}</h2>
      <p className="state-body">{body}</p>
      {children}
      {code && <p className="state-code">Code: <code>{code}</code></p>}
      {onRetry && (
        <button type="button" className="state-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}
