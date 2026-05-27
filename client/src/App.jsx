import { useNoaaSignal } from "./hooks/useNoaaSignal";
import { SummaryCards } from "./components/SummaryCards.tsx";
import { SignalChart } from "./components/SignalChart.tsx";
import { InsightPanel } from "./components/InsightPanel.tsx";
import {LocationData} from "./components/LocationData.tsx";


export default function App() {
  const { data, status, error } = useNoaaSignal();

  const processed = data?.processed;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">NOAA Signal Explorer</p>
        <h1>Modern interpretation layer for coastal station data</h1>
        <p>
          Pulling real NOAA coastal observations into a clean visualization and
          plain-English ecological insight system.
        </p>
        <span className="status-pill">{status}</span>
      </section>

      {error && <section className="card error">{error}</section>}

      {processed && (
        <>
          <SummaryCards summary={processed.summary} />
          <SignalChart series={processed.series} />
          <InsightPanel insight={processed.insight} />
        </>
      )}
      <LocationData location="newport" />
    </main>
  );
}