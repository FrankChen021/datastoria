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
