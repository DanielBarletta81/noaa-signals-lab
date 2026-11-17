import { useEffect, useState } from "react";
import { PHONE_QUERY, prefersPhoneLayout } from "../view/viewport.js";

// True while the viewport is at or below the phone breakpoint. Updates when the window
// is resized or rotated across it.
export function usePhoneLayout() {
  const [phone, setPhone] = useState(() => prefersPhoneLayout());

  useEffect(() => {
    const media = globalThis.window?.matchMedia?.(PHONE_QUERY);
    if (!media) return undefined;
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return phone;
}
