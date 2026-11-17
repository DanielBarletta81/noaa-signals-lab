import { useCallback, useEffect, useRef, useState } from "react";
import { resolveApiBaseUrl } from "../api/signalApi.js";
import {
  SNAPSHOT_PAGE_SIZE,
  SnapshotRequestError,
  fetchSnapshot,
  listSnapshots,
  saveSnapshot,
} from "../api/snapshotApi.js";
import { mergeSnapshotPages } from "../view/snapshots.js";

const UNEXPECTED = "An unexpected error occurred while handling saved snapshots.";

// Only errors the client raised on purpose carry a message that is safe to show.
function messageFor(error) {
  if (error instanceof SnapshotRequestError || error?.name === "SignalRequestError") return error.message;
  return UNEXPECTED;
}

// The machine-readable code from the server, such as retrieval_not_found, when there is one.
function codeFor(error) {
  return error instanceof SnapshotRequestError && typeof error.code === "string" ? error.code : null;
}

function currentBaseUrl() {
  return resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

// State and actions for saved snapshots. Stale responses are ignored with sequence
// numbers, so an older list or open request can never overwrite a newer one.
export function useSnapshots() {
  const [list, setList] = useState({ status: "loading", items: [], total: 0, error: null });
  const [more, setMore] = useState({ status: "idle", error: null });
  const [saves, setSaves] = useState({ status: "idle", error: null, errorCode: null, savedAs: {}, event: 0 });
  const [opening, setOpening] = useState({ id: null, error: null });
  const listSeq = useRef(0);
  const openSeq = useRef(0);
  const savingRef = useRef(false);

  // Replaces the list with the first page. Items stay visible while it refreshes.
  const reloadList = useCallback(async () => {
    const seq = ++listSeq.current;
    setList((prev) => ({ ...prev, status: "loading" }));
    try {
      const page = await listSnapshots({ baseUrl: currentBaseUrl(), limit: SNAPSHOT_PAGE_SIZE, offset: 0 });
      if (seq !== listSeq.current) return;
      setList({ status: "ready", items: page.snapshots, total: page.total, error: null });
      setMore({ status: "idle", error: null });
    } catch (error) {
      if (seq !== listSeq.current) return;
      setList((prev) => ({ ...prev, status: "error", error: messageFor(error) }));
    }
  }, []);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  const loadOlder = useCallback(async (offset) => {
    const seq = listSeq.current;
    setMore({ status: "loading", error: null });
    try {
      const page = await listSnapshots({ baseUrl: currentBaseUrl(), limit: SNAPSHOT_PAGE_SIZE, offset });
      if (seq !== listSeq.current) return;
      setList((prev) => ({
        status: "ready",
        items: mergeSnapshotPages(prev.items, page.snapshots),
        total: page.total,
        error: null,
      }));
      setMore({ status: "idle", error: null });
    } catch (error) {
      if (seq !== listSeq.current) return;
      setMore({ status: "error", error: messageFor(error) });
    }
  }, []);

  // Saves the live retrieval. Resolves with the new snapshot, or null on failure.
  const saveRetrieval = useCallback(
    async (retrievalId) => {
      if (savingRef.current) return null;
      savingRef.current = true;
      setSaves((prev) => ({ ...prev, status: "saving", error: null, errorCode: null }));
      try {
        const meta = await saveSnapshot({ baseUrl: currentBaseUrl(), retrievalId });
        setSaves((prev) => ({
          status: "saved",
          error: null,
          errorCode: null,
          savedAs: { ...prev.savedAs, [retrievalId]: meta.id },
          event: prev.event + 1,
        }));
        reloadList();
        return meta;
      } catch (error) {
        setSaves((prev) => ({ ...prev, status: "error", error: messageFor(error), errorCode: codeFor(error) }));
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [reloadList]
  );

  // Clears a failed save once the observations have been loaded again, so an error about
  // an expired retrieval does not stay on screen next to a retrieval that is new.
  const clearSaveError = useCallback(() => {
    setSaves((prev) => (prev.status === "error" ? { ...prev, status: "idle", error: null, errorCode: null } : prev));
  }, []);

  // Opens one saved copy. Resolves with { snapshot, signal }, or null when the request
  // failed or was superseded. Opening never contacts NOAA.
  const openSaved = useCallback(async (id) => {
    const seq = ++openSeq.current;
    setOpening({ id, error: null });
    try {
      const opened = await fetchSnapshot({ baseUrl: currentBaseUrl(), id });
      if (seq !== openSeq.current) return null;
      setOpening({ id: null, error: null });
      return opened;
    } catch (error) {
      if (seq !== openSeq.current) return null;
      setOpening({ id: null, error: messageFor(error) });
      return null;
    }
  }, []);

  // Drops an open that is still in flight, so it cannot replace a view the user chose.
  const cancelOpen = useCallback(() => {
    openSeq.current += 1;
    setOpening({ id: null, error: null });
  }, []);

  return {
    list,
    more,
    savedAs: saves.savedAs,
    saveStatus: saves.status,
    saveError: saves.error,
    saveErrorCode: saves.errorCode,
    saveEvent: saves.event,
    opening,
    reloadList,
    loadOlder,
    saveRetrieval,
    clearSaveError,
    openSaved,
    cancelOpen,
  };
}
