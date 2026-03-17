CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  connection_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  title TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_connection
  ON chat_sessions (user_id, connection_id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_chat_sessions_user_connection_session
  ON chat_sessions (user_id, connection_id, session_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  parts_text TEXT NOT NULL,
  metadata_text TEXT NULL,
  sequence INT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (user_id, session_id, message_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session
  ON chat_messages (user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session_sequence
  ON chat_messages (user_id, session_id, sequence);
