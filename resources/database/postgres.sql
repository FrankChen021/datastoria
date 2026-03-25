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

CREATE TABLE IF NOT EXISTS ai_skills (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  skill_id VARCHAR(255) NULL,
  meta TEXT NULL,
  content TEXT NOT NULL,
  state VARCHAR(32) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  version VARCHAR(255) NULL,
  owner_id VARCHAR(255) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_type_state_scope
  ON ai_skills (type, state, scope);

CREATE INDEX IF NOT EXISTS idx_ai_skills_owner_scope
  ON ai_skills (owner_id, scope);

CREATE INDEX IF NOT EXISTS idx_ai_skills_skill_id
  ON ai_skills (skill_id);

CREATE TABLE IF NOT EXISTS feedback_events (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  source VARCHAR(128) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  solved BOOLEAN NOT NULL,
  reason_code VARCHAR(128) NULL,
  payload_text TEXT NOT NULL,
  free_text TEXT NULL,
  recovery_action_taken BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (user_id, source, message_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_source_created_at
  ON feedback_events (source, created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_events_message
  ON feedback_events (user_id, session_id, message_id);
