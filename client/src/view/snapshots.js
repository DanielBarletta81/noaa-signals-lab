// Presentation rules for saved snapshots. These are pure functions, so the claims made
// about a saved copy (what it is, when it was retrieved, when it was saved, whether it
// can be saved again) can be tested without rendering.

import { formatUtcLong } from "./format.js";

const PRODUCT_LABELS = Object.freeze({ water_temperature: "Water temperature" });

// Used only when a demonstration snapshot has no label of its own. Every demonstration
// snapshot saved by the seed script carries a full label.
export const DEMO_FALLBACK_LABEL = "Demonstration data from a captured NOAA response. Not current data.";

export function productLabel(product) {
  return PRODUCT_LABELS[product] ?? String(product ?? "Observations");
}

// The live set can be saved only when it has loaded, carries a retrieval ID, and has
// not already been saved in this session. A reopened snapshot has no retrieval ID, so
// it can never be saved again from its own view.
export function canSaveLive({ status, data, savedAs = {} }) {
  if (status !== "ready" && status !== "empty") return false;
  const retrievalId = data?.retrievalId;
  return typeof retrievalId === "string" && retrievalId !== "" && !Object.hasOwn(savedAs, retrievalId);
}

// The view for a reopened snapshot. It uses the rebuilt signal body, so the chart,
// coverage, and quality panels read the same structure as a live response.
export function viewFromSnapshot({ snapshot, signal }) {
  return {
    snapshot,
    data: signal,
    status: signal?.status === "ok" ? "ready" : "empty",
    error: null,
    errorCode: null,
  };
}

// What the copy says about its origin. A demonstration copy keeps its full label.
export function sourceNoteFor(snapshot) {
  if (snapshot.sourceMode === "demonstration") {
    return { demonstration: true, text: snapshot.demoLabel || DEMO_FALLBACK_LABEL };
  }
  return {
    demonstration: false,
    text: "Saved copy of a NOAA response retrieved by this app. It does not update when NOAA's data changes.",
  };
}

// The two times are different facts and are always labelled apart.
export function snapshotTimes(snapshot) {
  return {
    retrieved: formatUtcLong(snapshot.retrievedAt),
    saved: formatUtcLong(snapshot.savedAt),
  };
}

export function snapshotStatusLine(snapshot, data) {
  const count = data?.processed?.summary?.count ?? 0;
  const times = snapshotTimes(snapshot);
  const noun = count === 1 ? "observation" : "observations";
  return `Saved snapshot ${snapshot.id} · ${count} accepted ${noun} · originally retrieved ${times.retrieved} · saved ${times.saved}`;
}

// Appends a later page, keeping the first occurrence of each ID and the list order.
export function mergeSnapshotPages(existing, incoming) {
  const seen = new Set(existing.map((snapshot) => snapshot.id));
  const merged = [...existing];
  for (const snapshot of incoming) {
    if (!seen.has(snapshot.id)) {
      seen.add(snapshot.id);
      merged.push(snapshot);
    }
  }
  return merged;
}

export function hasMoreSnapshots({ loaded, total }) {
  return loaded < total;
}

// Stated wherever the list appears. The archive has no owners and no private copies.
export const ARCHIVE_NOTE =
  "Saved copies are shared. Everyone who uses this server sees the same list and can open any copy. There are no accounts, and copies cannot be deleted here. Each copy holds only public NOAA data.";

// What the save panel offers after a failed save. A retrieval that has expired, was
// evicted, or was lost in a restart returns retrieval_not_found. Saving it again cannot
// succeed, so the only useful action is to load the observations again.
export function saveFailureAction(code) {
  if (code === "retrieval_not_found") return { kind: "reload", label: "Load observations again" };
  return null;
}
