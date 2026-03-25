CREATE TABLE chat_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  connection_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  title TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_chat_sessions_user_connection_session (user_id, connection_id, session_id),
  KEY idx_chat_sessions_user_connection (user_id, connection_id)
);

CREATE TABLE chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  parts_text LONGTEXT NOT NULL,
  metadata_text LONGTEXT NULL,
  sequence INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_messages_user_session (user_id, session_id),
  KEY idx_chat_messages_user_session_sequence (user_id, session_id, sequence),
  UNIQUE KEY uk_chat_messages_user_session_message_sequence (user_id, session_id, message_id, sequence)
);

CREATE TABLE ai_skills (
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  skill_id VARCHAR(255) NULL,
  meta LONGTEXT NULL,
  content LONGTEXT NOT NULL,
  state VARCHAR(32) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  version VARCHAR(255) NULL,
  owner_id VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_ai_skills_type_state_scope (type, state, scope),
  KEY idx_ai_skills_owner_scope (owner_id, scope),
  KEY idx_ai_skills_skill_id (skill_id)
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  source VARCHAR(128) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  solved BOOLEAN NOT NULL,
  reason_code VARCHAR(128) NULL,
  payload_text LONGTEXT NOT NULL,
  free_text LONGTEXT NULL,
  recovery_action_taken BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_feedback_events_user_source_message (user_id, source, message_id),
  KEY idx_feedback_events_source_created_at (source, created_at),
  KEY idx_feedback_events_message (user_id, session_id, message_id)
);
