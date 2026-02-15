CREATE TABLE caption_windows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  window_id       TEXT NOT NULL,
  timestamp       REAL NOT NULL,
  chunk_start_s   REAL NOT NULL,
  chunk_end_s     REAL NOT NULL,
  caption         TEXT NOT NULL,
  latency_ms      INTEGER,
  tokens_generated INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(window_id)
);
