import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SIGNAL_QUERY,
  buildSignalUrl,
  fetchSignal,
  resolveApiBaseUrl,
  stateFromError,
  stateFromResult,
} from "../api/signalApi.js";

// status: "loading" | "ready" | "empty" | "error"
//   ready: at least one NOAA observation passed validation
//   empty: a valid request with no plottable observations (see data.status and
//          data.absenceStatus for what may be claimed)
//   error: the request failed; errorCode is a machine-readable reason
//
// reload() repeats the same request. It exists for the "Try again" action on
// transient failures. It does not change the query.
const LOADING_STATE = Object.freeze({
  data: null,
  status: "loading",
  error: null,
  errorCode: null,
});

export function useNoaaSignal() {
  const [state, setState] = useState(LOADING_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSignal() {
      setState(LOADING_STATE);
      try {
        const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
        const url = buildSignalUrl(baseUrl, DEFAULT_SIGNAL_QUERY);
        const result = await fetchSignal({ url, signal: controller.signal });
        if (!controller.signal.aborted) setState(stateFromResult(result));
      } catch (error) {
        const next = stateFromError(error);
        if (next && !controller.signal.aborted) setState(next);
      }
    }

    loadSignal();
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  return { ...state, reload };
}
