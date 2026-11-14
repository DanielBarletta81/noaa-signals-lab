// The method, written for a student and for a scientist. It describes what the page
// did, not what the water is doing. Shown in the page even when the data failed to
// load, so the reader can always see how a result would have been produced.
export function MethodPanel() {
  return (
    <details className="panel panel--lab method" id="method">
      <summary>
        <span className="panel-kicker">Lab bench · methodology</span>
        <span className="method-title">What was measured, and how</span>
      </summary>
      <ol className="method-steps">
        <li>
          <strong>Request.</strong> NOAA CO-OPS station 8454000 (Providence), product water temperature,
          metric units (°C), one value per hour, timestamps in GMT.
        </li>
        <li>
          <strong>Accept or exclude each row.</strong> A row is used only when its time and its
          value are both valid. Blank, missing, non-numeric, and non-finite values are excluded and
          counted. An excluded value is never replaced with zero. A real reading of 0 is kept.
        </li>
        <li>
          <strong>Order and de-duplicate.</strong> Accepted rows are sorted by their UTC time. If
          NOAA repeats an hour, the first row is kept and later copies are counted as excluded.
        </li>
        <li>
          <strong>Summarize accepted values only.</strong> Latest, minimum, maximum, and mean are
          computed from accepted observations. They are derived numbers, not separate measurements.
        </li>
        <li>
          <strong>Map coverage.</strong> The hourly strip places each hour in the requested window
          as observed, excluded, or with no row returned. The window is inferred from the requested
          range and the newest row; NOAA's alignment is assumed, not confirmed.
        </li>
        <li>
          <strong>Not calculated.</strong> No time-window trend, threshold, or ecological judgment.
          NOAA quality flags are kept but not interpreted.
        </li>
      </ol>
    </details>
  );
}
