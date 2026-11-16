// Saved observation snapshots.
//   POST /api/snapshots           save the retrieval identified by retrievalId
//   GET  /api/snapshots           list saved snapshots (newest first, bounded)
//   GET  /api/snapshots/:id       one snapshot and its observations
// Every input is validated. No request can name a file path or a database location.
//
// The archive is shared. Anyone who can reach this server can list, open, and save into
// it, because there are no accounts. Two bounds protect storage: a cap on the number of
// copies (507 when reached) and a per-address limit on saves (429 when exceeded).

import express from "express";
import { ApiError, ValidationError } from "../errors.js";
import { DEFAULT_MAX_SNAPSHOTS } from "../config/storage.js";
import { createOriginPolicy } from "../http/cors.js";
import { DEFAULT_ALLOWED_ORIGINS } from "../config/security.js";
import { createFixedWindowLimiter, DEFAULT_WRITE_LIMIT } from "../http/rateLimit.js";
import { RETRIEVAL_ID_PATTERN } from "../retrievals/store.js";
import {
  DEFAULT_LIST_LIMIT,
  getSnapshot,
  getSnapshotMeta,
  listSnapshots,
  MAX_LIST_LIMIT,
  MAX_SNAPSHOT_ROWS,
  saveSnapshotDescribed,
  SnapshotCapacityError,
  SnapshotTextTooLargeError,
  SnapshotTooLargeError,
} from "../snapshots/repository.js";

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const INTEGER_PATTERN = /^\d{1,9}$/;
const MAX_OFFSET = 100000;
const LIST_PARAMS = Object.freeze(["limit", "offset"]);
const SAVE_BODY_LIMIT = "1kb";
const BODY_MESSAGE = "The save request is not valid.";

// Errors from the database. The detail is logged on the server only.
export class StorageError extends ApiError {
  constructor() {
    super(503, "storage_unavailable", "The snapshot store could not complete the request. Nothing was saved.");
  }
}

export function createSnapshotsRouter({
  db,
  retrievals,
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
  writeLimit = DEFAULT_WRITE_LIMIT,
  originPolicy = createOriginPolicy(DEFAULT_ALLOWED_ORIGINS),
}) {
  const router = express.Router();
  const saveLimiter = createFixedWindowLimiter(writeLimit);

  // Saved copies and the list can change, and a retrieval ID is never cached by a browser
  // or an intermediary.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/snapshots", express.json({ limit: SAVE_BODY_LIMIT, strict: true }), (req, res) => {
    try {
      // A write from a browser page on a site that is not allowed is refused before it
      // counts toward the save limit. This is not authentication. See http/cors.js.
      if (!originPolicy.isWriteAllowed(req)) {
        throw new ApiError(403, "origin_not_allowed", "Saving is not allowed from this website.");
      }

      // Every save attempt counts, including ones that turn out to be duplicates.
      const admission = saveLimiter.hit(req.ip ?? "unknown");
      if (!admission.allowed) {
        res.set("Retry-After", String(admission.retryAfterSeconds));
        throw new ApiError(
          429,
          "rate_limited",
          "Too many saves from this connection. Wait a moment, then try again."
        );
      }

      const retrievalId = readRetrievalId(req.body);
      const retrieval = retrievals.get(retrievalId);
      if (!retrieval) {
        throw new ApiError(
          404,
          "retrieval_not_found",
          "That observation set is no longer available. Load the observations again, then save."
        );
      }

      // A second save of the same retrieval returns the copy already made, so repeated
      // clicks or a repeated request cannot fill the archive with duplicates.
      const earlierId = retrievals.savedSnapshotId(retrievalId);
      if (earlierId !== null) {
        const existing = guardStorage(() => getSnapshotMeta(db, earlierId));
        if (existing) {
          res.status(200).json({ ok: true, created: false, snapshot: existing });
          return;
        }
      }

      const rowCount = retrieval.body.quality.receivedRows;
      if (rowCount > MAX_SNAPSHOT_ROWS) {
        throw new ApiError(413, "snapshot_too_large", "That observation set is too large to save.");
      }

      const { id, snapshot } = guardStorage(() =>
        saveSnapshotDescribed(db, {
          body: retrieval.body,
          points: retrieval.points,
          sourceMode: "live",
          maxSnapshots,
        })
      );
      retrievals.recordSave(retrievalId, id);
      res.status(201).json({ ok: true, created: true, snapshot });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/snapshots", (req, res) => {
    try {
      const { limit, offset } = parseListParams(req.query);
      const { total, snapshots } = guardStorage(() => listSnapshots(db, { limit, offset }));
      res.json({ ok: true, total, limit, offset, snapshots });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/snapshots/:id", (req, res) => {
    try {
      const id = req.params.id;
      if (!ID_PATTERN.test(id)) {
        throw new ValidationError(
          [{ field: "id", message: "Must be a positive whole number." }],
          "The snapshot ID is not valid."
        );
      }
      const found = guardStorage(() => getSnapshot(db, Number(id)));
      if (!found) {
        throw new ApiError(404, "snapshot_not_found", "No saved snapshot has that ID.");
      }
      res.json({ ok: true, snapshot: found.snapshot, signal: found.body });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Body-parser failures (malformed JSON, oversized body) arrive here. Answer with
  // the same JSON shape as every other error, never with the default HTML page.
  router.use((error, req, res, next) => {
    if (error && error.type === "entity.too.large") {
      return sendError(res, new ApiError(413, "request_too_large", "The request body is too large."));
    }
    if (error && (error.type === "entity.parse.failed" || error.type === "charset.unsupported" || error.type === "encoding.unsupported")) {
      return sendError(res, new ValidationError([{ field: "body", message: "Send a JSON object." }], BODY_MESSAGE));
    }
    return next(error);
  });

  return router;
}

function readRetrievalId(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError([{ field: "body", message: "Send a JSON object with retrievalId." }], BODY_MESSAGE);
  }
  const extra = Object.keys(body).filter((key) => key !== "retrievalId");
  if (extra.length > 0) {
    throw new ValidationError(extra.map((field) => ({ field, message: "Unknown field." })), BODY_MESSAGE);
  }
  if (typeof body.retrievalId !== "string" || !RETRIEVAL_ID_PATTERN.test(body.retrievalId)) {
    throw new ValidationError(
      [{ field: "retrievalId", message: "Must be a retrieval ID from a successful observation load." }],
      BODY_MESSAGE
    );
  }
  return body.retrievalId;
}

function parseListParams(query) {
  const errors = [];
  for (const key of Object.keys(query)) {
    if (!LIST_PARAMS.includes(key)) errors.push({ field: key, message: "Unknown query parameter." });
  }

  let limit = DEFAULT_LIST_LIMIT;
  if (Object.hasOwn(query, "limit")) {
    const value = query.limit;
    if (typeof value !== "string" || !INTEGER_PATTERN.test(value) || Number(value) < 1 || Number(value) > MAX_LIST_LIMIT) {
      errors.push({ field: "limit", message: `Must be a whole number from 1 to ${MAX_LIST_LIMIT}.` });
    } else {
      limit = Number(value);
    }
  }

  let offset = 0;
  if (Object.hasOwn(query, "offset")) {
    const value = query.offset;
    if (typeof value !== "string" || !INTEGER_PATTERN.test(value) || Number(value) > MAX_OFFSET) {
      errors.push({ field: "offset", message: `Must be a whole number from 0 to ${MAX_OFFSET}.` });
    } else {
      offset = Number(value);
    }
  }

  if (errors.length > 0) throw new ValidationError(errors);
  return { limit, offset };
}

// Sorts failures into three groups. Each gets a response that is true about the store:
//   - ApiError, validation, and known limits pass through with their own status.
//   - A SQLite failure is a storage problem (503). The transaction was rolled back, so
//     nothing was saved, and the detail is logged on the server only.
//   - Anything else is a bug in this server (500 via sendError), not a storage problem.
function guardStorage(work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof SnapshotTooLargeError || error instanceof SnapshotTextTooLargeError) {
      throw new ApiError(413, "snapshot_too_large", "That observation set is too large to save.");
    }
    if (error instanceof SnapshotCapacityError) {
      throw new ApiError(
        507,
        "archive_full",
        `The shared archive is full (${error.limit} saved copies). Nothing was saved, and no saved copy has been removed.`,
        { limit: error.limit }
      );
    }
    if (isDatabaseError(error)) {
      console.error("Snapshot storage failure:", error);
      throw new StorageError();
    }
    throw error;
  }
}

// node:sqlite reports every database failure with an ERR_SQLITE_* code.
function isDatabaseError(error) {
  return typeof error?.code === "string" && error.code.startsWith("ERR_SQLITE");
}

function sendError(res, error) {
  if (error instanceof ApiError) {
    const body = { ok: false, code: error.code, message: error.publicMessage };
    if (error.details && Object.keys(error.details).length > 0) {
      body.details = error.details;
    }
    res.status(error.status).json(body);
    return;
  }
  console.error("Unexpected error in snapshot route:", error);
  res.status(500).json({ ok: false, code: "internal_error", message: "Unexpected server error." });
}
