CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  title TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_connection
  ON chat_sessions (user_id, connection_id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_chat_sessions_user_connection_session
  ON chat_sessions (user_id, connection_id, session_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts_text TEXT NOT NULL,
  metadata_text TEXT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  UNIQUE (user_id, session_id, message_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session
  ON chat_messages (user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session_sequence
  ON chat_messages (user_id, session_id, sequence);

CREATE TABLE IF NOT EXISTS ai_skills (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  skill_id TEXT NULL,
  meta TEXT NULL,
  content TEXT NOT NULL,
  state TEXT NOT NULL,
  scope TEXT NOT NULL,
  version TEXT NULL,
  owner_id TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_type_state_scope
  ON ai_skills (type, state, scope);

CREATE INDEX IF NOT EXISTS idx_ai_skills_owner_scope
  ON ai_skills (owner_id, scope);

CREATE INDEX IF NOT EXISTS idx_ai_skills_skill_id
  ON ai_skills (skill_id);

CREATE TABLE IF NOT EXISTS feedback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  solved INTEGER NOT NULL,
  reason_code TEXT NULL,
  payload_text TEXT NOT NULL,
  free_text TEXT NULL,
  recovery_action_taken INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
  UNIQUE (user_id, source, message_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_source_created_at
  ON feedback_events (source, created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_events_message
  ON feedback_events (user_id, session_id, message_id);
