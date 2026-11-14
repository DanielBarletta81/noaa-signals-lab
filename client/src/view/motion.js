import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// True when the operating system asks for reduced motion. Used to switch off
// chart animation. CSS transitions are switched off separately in index.css.
export function prefersReducedMotion(win = globalThis.window) {
  return Boolean(win?.matchMedia?.(QUERY).matches);
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());

  useEffect(() => {
    const media = globalThis.window?.matchMedia?.(QUERY);
    if (!media) return undefined;
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
