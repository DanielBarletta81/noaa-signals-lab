// Reads and writes saved snapshots. Every statement uses bound parameters. A snapshot
// and all of its observations are written in one transaction, so either all of them
// are stored or none are.

import { EXCLUSION_REASONS, FLAG_POLICY } from "../adapters/noaaClient.js";
import { PRODUCTS } from "../config/allowlist.js";
import { buildSignalBody, SOURCE_NAME } from "../signals/buildResponse.js";

// Upper bound on rows in one snapshot. A request can ask for at most 72 hours, so a
// normal snapshot is far below this. The bound protects storage from abnormal input.
export const MAX_SNAPSHOT_ROWS = 200;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;
export const SNAPSHOT_SOURCE_MODES = Object.freeze(["live", "demonstration"]);

export class SnapshotTooLargeError extends Error {
  constructor(rowCount) {
    super(`A snapshot may hold at most ${MAX_SNAPSHOT_ROWS} rows; this one has ${rowCount}.`);
    this.name = "SnapshotTooLargeError";
  }
}

export function withTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// JSON text keeps NOAA's value exactly as received: string or number, and null when
// absent. SQLite columns are typed loosely, so this is the only faithful encoding.
const encode = (value) => JSON.stringify(value === undefined ? null : value);
const decode = (text) => JSON.parse(text);

export function saveSnapshot(
  db,
  { body, points, sourceMode, demoLabel = null, savedAt = new Date().toISOString() }
) {
  if (!SNAPSHOT_SOURCE_MODES.includes(sourceMode)) {
    throw new Error(`Unknown source mode: ${sourceMode}`);
  }
  if (sourceMode === "demonstration" && (typeof demoLabel !== "string" || demoLabel === "")) {
    throw new Error("A demonstration snapshot must carry a demonstration label.");
  }
  if (sourceMode === "live" && demoLabel !== null) {
    throw new Error("A live snapshot must not carry a demonstration label.");
  }

  const quality = body.quality;
  if (!PRODUCTS[body.product]) throw new Error(`Snapshot product is not allowlisted: ${body.product}`);
  if (body.source?.name !== SOURCE_NAME || body.source?.timeZone !== "GMT" || body.source?.interval !== "hourly") {
    throw new Error("Snapshot source metadata does not match the documented contract.");
  }

  const rows = [
    ...points.map((point) => ({
      rowOrder: point.rowIndex,
      observedAtUtc: point.timestampUtc,
      observedAtRaw: point.observedAtRaw,
      rawValue: point.rawValue,
      value: point.value,
      accepted: 1,
      exclusionReason: null,
      flags: point.flags,
    })),
    ...quality.excluded.map((item) => ({
      rowOrder: item.index,
      observedAtUtc: null,
      observedAtRaw: item.rawTimestamp,
      rawValue: item.rawValue,
      value: null,
      accepted: 0,
      exclusionReason: item.reason,
      flags: item.flags,
    })),
  ].sort((a, b) => a.rowOrder - b.rowOrder);

  if (rows.length > MAX_SNAPSHOT_ROWS) throw new SnapshotTooLargeError(rows.length);
  if (rows.length !== quality.receivedRows) {
    throw new Error(
      `Observation count (${rows.length}) does not match the rows NOAA returned (${quality.receivedRows}).`
    );
  }

  return withTransaction(db, () => {
    const header = db
      .prepare(
        `INSERT INTO snapshots (
           station_id, station_name, product, product_units, range_hours, interval_label,
           time_zone, status, empty_reason, absence_status, noaa_message, source_name,
           source_url, retrieved_at, saved_at, source_mode, demo_label, flag_policy,
           received_rows, accepted_rows, excluded_rows
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.station,
        body.stationName ?? null,
        body.product,
        PRODUCTS[body.product].units,
        body.range,
        body.source.interval,
        body.source.timeZone,
        body.status,
        body.emptyReason ?? null,
        body.absenceStatus ?? null,
        body.source.noaaMessage ?? null,
        body.source.name,
        body.source.url,
        body.source.retrievedAt,
        savedAt,
        sourceMode,
        demoLabel,
        quality.flagPolicy ?? FLAG_POLICY,
        quality.receivedRows,
        quality.acceptedRows,
        quality.excludedRows
      );
    const snapshotId = Number(header.lastInsertRowid);

    const insertObservation = db.prepare(
      `INSERT INTO observations (
         snapshot_id, row_order, observed_at_utc, observed_at_raw, raw_value, value,
         accepted, exclusion_reason, flag_quality, flag_flag
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows) {
      insertObservation.run(
        snapshotId,
        row.rowOrder,
        row.observedAtUtc,
        encode(row.observedAtRaw),
        encode(row.rawValue),
        row.value,
        row.accepted,
        row.exclusionReason,
        encode(row.flags?.quality),
        encode(row.flags?.flag)
      );
    }
    return snapshotId;
  });
}

export function toSnapshotMeta(row) {
  return {
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_name,
    product: row.product,
    productUnits: row.product_units,
    requestedHours: row.range_hours,
    timeZone: row.time_zone,
    status: row.status,
    emptyReason: row.empty_reason,
    absenceStatus: row.absence_status,
    retrievedAt: row.retrieved_at,
    savedAt: row.saved_at,
    sourceMode: row.source_mode,
    demoLabel: row.demo_label,
    receivedRows: row.received_rows,
    acceptedRows: row.accepted_rows,
    excludedRows: row.excluded_rows,
  };
}

export function listSnapshots(db, { limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  const total = Number(db.prepare("SELECT COUNT(*) AS total FROM snapshots").get().total);
  const rows = db
    .prepare("SELECT * FROM snapshots ORDER BY saved_at DESC, id DESC LIMIT ? OFFSET ?")
    .all(Number(limit), Number(offset));
  return { total, snapshots: rows.map(toSnapshotMeta) };
}

// Rebuilds the same body GET /api/signals returns, from stored rows, through the same
// builder. Returns null when no snapshot has the given ID.
export function getSnapshot(db, id) {
  const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(Number(id));
  if (!row) return null;

  const accepted = db
    .prepare(
      `SELECT * FROM observations WHERE snapshot_id = ? AND accepted = 1
       ORDER BY observed_at_utc ASC, row_order ASC`
    )
    .all(row.id);
  const excludedRows = db
    .prepare("SELECT * FROM observations WHERE snapshot_id = ? AND accepted = 0 ORDER BY row_order ASC")
    .all(row.id);

  const points = accepted.map((obs) => ({
    station: row.station_id,
    product: row.product,
    rowIndex: obs.row_order,
    timestampUtc: obs.observed_at_utc,
    observedAtRaw: decode(obs.observed_at_raw),
    value: obs.value,
    rawValue: decode(obs.raw_value),
    flags: { quality: decode(obs.flag_quality), flag: decode(obs.flag_flag) },
  }));

  const excluded = excludedRows.map((obs) => ({
    index: obs.row_order,
    reason: obs.exclusion_reason,
    rawTimestamp: decode(obs.observed_at_raw),
    rawValue: decode(obs.raw_value),
    flags: { quality: decode(obs.flag_quality), flag: decode(obs.flag_flag) },
  }));

  const excludedByReason = Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0]));
  for (const item of excluded) excludedByReason[item.reason] += 1;

  const body = buildSignalBody({
    station: row.station_id,
    product: row.product,
    range: row.range_hours,
    result: {
      status: row.status,
      emptyReason: row.empty_reason,
      absenceStatus: row.absence_status,
      points,
      stationName: row.station_name,
      sourceUrl: row.source_url,
      retrievedAt: row.retrieved_at,
      noaaMessage: row.noaa_message,
      quality: {
        receivedRows: row.received_rows,
        acceptedRows: row.accepted_rows,
        excludedRows: row.excluded_rows,
        excludedByReason,
        excluded,
        flagPolicy: row.flag_policy,
      },
    },
  });

  return { snapshot: toSnapshotMeta(row), body };
}
