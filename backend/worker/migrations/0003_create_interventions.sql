CREATE TABLE interventions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  decision          TEXT NOT NULL,
  reasoning         TEXT,
  biometric_ids     TEXT,
  caption_ids       TEXT,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
