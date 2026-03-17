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
