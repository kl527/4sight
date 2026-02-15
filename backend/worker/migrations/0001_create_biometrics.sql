CREATE TABLE biometric_windows (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  window_id  TEXT NOT NULL,
  timestamp  REAL NOT NULL,
  duration_ms REAL NOT NULL,
  features   TEXT NOT NULL,
  risk       TEXT,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(window_id)
);
