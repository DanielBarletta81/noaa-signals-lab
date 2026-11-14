import { useState, useRef } from "react";
import { describeSlot, formatUtcClock } from "../view/format.js";

// Hour-by-hour coverage. Observed hours are solid. Excluded hours are hatched. Hours
// with no row are outlined only. Every hour is a button with a full accessible name:
// arrow keys move between hours (one tab stop for the whole row), and Enter or Space
// selects an hour so its exact status can be read in the readout.
export function CoverageTimeline({ slots, selectedIso, onSelect, idPrefix = "timeline" }) {
  const [focusIndex, setFocusIndex] = useState(() => {
    const selected = slots.findIndex((slot) => slot.iso === selectedIso);
    return selected >= 0 ? selected : Math.max(slots.length - 1, 0);
  });
  const buttons = useRef([]);

  if (slots.length === 0) {
    return <p className="timeline-empty">No hourly slots to show for this window.</p>;
  }

  function moveFocus(next) {
    const clamped = Math.min(Math.max(next, 0), slots.length - 1);
    setFocusIndex(clamped);
    buttons.current[clamped]?.focus();
  }

  function onKeyDown(event, index) {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: slots.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    }
  }

  const counts = { observed: 0, excluded: 0, missing: 0 };
  for (const slot of slots) counts[slot.status] += 1;

  return (
    <figure className="timeline" aria-labelledby={`${idPrefix}-caption`}>
      <figcaption id={`${idPrefix}-caption`} className="timeline-caption">
        Hourly coverage from {formatUtcClock(slots[0].iso)} to {formatUtcClock(slots.at(-1).iso)} UTC:
        {" "}{counts.observed} observed, {counts.excluded} excluded, {counts.missing} with no row returned.
        The window's start and end are inferred from the requested range, not confirmed by NOAA.
      </figcaption>
      <div className="timeline-track" role="group" aria-label="Hours in the requested window">
        {slots.map((slot, index) => (
          <button
            key={slot.iso}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            className={`cell cell-${slot.status}`}
            data-status={slot.status}
            aria-label={describeSlot(slot)}
            aria-pressed={slot.iso === selectedIso}
            tabIndex={index === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onSelect(slot)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        ))}
      </div>
      <div className="timeline-scale" aria-hidden="true">
        <span>{formatUtcClock(slots[0].iso)}</span>
        <span>{formatUtcClock(slots[Math.floor(slots.length / 2)].iso)}</span>
        <span>{formatUtcClock(slots.at(-1).iso)}</span>
      </div>
      <ul className="timeline-legend">
        <li><span className="swatch swatch-observed" aria-hidden="true" /> observed value</li>
        <li><span className="swatch swatch-excluded" aria-hidden="true" /> row excluded, never plotted</li>
        <li><span className="swatch swatch-missing" aria-hidden="true" /> no row returned</li>
      </ul>
    </figure>
  );
}
