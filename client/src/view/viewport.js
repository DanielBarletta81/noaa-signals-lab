// The phone breakpoint, in one place. The stylesheet uses the same value: phone rules
// are `max-width: 699px` and wider rules are `min-width: 700px`. test/viewport.test.js
// reads index.css and fails if the two drift apart.
export const PHONE_MAX_WIDTH = 699;
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

export function isPhoneWidth(width) {
  return Number.isFinite(width) && width <= PHONE_MAX_WIDTH;
}

// Reads the current match without subscribing. Returns false when matchMedia is missing,
// so a browser without it gets the full layout.
export function prefersPhoneLayout(win = globalThis.window) {
  return Boolean(win?.matchMedia?.(PHONE_QUERY).matches);
}
