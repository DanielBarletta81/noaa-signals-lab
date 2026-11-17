-- 001: saved observation snapshots.
--
-- A snapshot is one retrieved window, or one labelled demonstration window. Its
-- observations are every row NOAA returned, accepted or excluded, in NOAA's original
-- order. An hour that NOAA did not return has no row here, and no row is invented for it.
-- Excluded rows keep their raw text and flags but no parsed value.

CREATE TABLE snapshots (
  id              INTEGER PRIMARY KEY,
  station_id      TEXT    NOT NULL CHECK (length(station_id) BETWEEN 1 AND 20),
  station_name    TEXT,
  product         TEXT    NOT NULL CHECK (length(product) BETWEEN 1 AND 64),
  product_units   TEXT    NOT NULL,
  range_hours     INTEGER NOT NULL CHECK (range_hours BETWEEN 1 AND 72),
  interval_label  TEXT    NOT NULL,
  time_zone       TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('ok', 'empty', 'no_valid_observations')),
  empty_reason    TEXT,
  absence_status  TEXT,
  noaa_message    TEXT,
  source_name     TEXT    NOT NULL,
  source_url      TEXT    NOT NULL,
  retrieved_at    TEXT    NOT NULL,
  saved_at        TEXT    NOT NULL,
  source_mode     TEXT    NOT NULL CHECK (source_mode IN ('live', 'demonstration')),
  demo_label      TEXT,
  flag_policy     TEXT    NOT NULL,
  received_rows   INTEGER NOT NULL CHECK (received_rows >= 0),
  accepted_rows   INTEGER NOT NULL CHECK (accepted_rows >= 0),
  excluded_rows   INTEGER NOT NULL CHECK (excluded_rows >= 0),
  CHECK (received_rows = accepted_rows + excluded_rows),
  CHECK ((source_mode = 'demonstration') = (demo_label IS NOT NULL))
);

CREATE TABLE observations (
  id               INTEGER PRIMARY KEY,
  snapshot_id      INTEGER NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
  row_order        INTEGER NOT NULL CHECK (row_order >= 0),
  observed_at_utc  TEXT,
  observed_at_raw  TEXT    NOT NULL,
  raw_value        TEXT    NOT NULL,
  value            REAL,
  accepted         INTEGER NOT NULL CHECK (accepted IN (0, 1)),
  exclusion_reason TEXT CHECK (exclusion_reason IS NULL OR exclusion_reason IN (
    'malformed_row', 'malformed_timestamp', 'missing_value', 'blank_value',
    'malformed_value', 'non_finite_value', 'duplicate_timestamp')),
  flag_quality     TEXT    NOT NULL,
  flag_flag        TEXT    NOT NULL,
  UNIQUE (snapshot_id, row_order),
  CHECK (
    (accepted = 1 AND value IS NOT NULL AND observed_at_utc IS NOT NULL AND exclusion_reason IS NULL)
    OR
    (accepted = 0 AND value IS NULL AND exclusion_reason IS NOT NULL)
  )
);

CREATE INDEX observations_snapshot_time ON observations (snapshot_id, observed_at_utc);
CREATE INDEX snapshots_saved_at ON snapshots (saved_at DESC, id DESC);
