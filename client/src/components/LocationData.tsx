export function LocationData({ }: { location: string }): import("react/jsx-runtime").JSX.Element {
  return (
    <section className="card">
      <p className="eyebrow">NOAA Signal</p>
      <h2>Location Data</h2>
    
      <div className="data-grid">
  <div className="data-field gloss-card">
    <p className="data-label">Station</p>
    <p className="data-value">Newport Harbor</p>
    <p className="data-sub">NOAA coastal signal feed</p>
  </div>

  <div className="data-field gloss-card">
    <p className="data-label">Water Temp</p>
    <p className="data-value">58.4°F</p>
    <p className="data-sub">Last observed reading</p>
  </div>

  <div className="data-field gloss-card">
    <p className="data-label">Signal Trend</p>
    <p className="data-value">Rising</p>
    <p className="data-sub">+1.2°F over 24 hours</p>
  </div>

  <div className="data-field gloss-card">
    <p className="data-label">Status</p>
    <p className="data-value">Watch</p>
    <p className="data-sub">Change exceeds baseline drift</p>
  </div>
</div>
    </section>
  );
}