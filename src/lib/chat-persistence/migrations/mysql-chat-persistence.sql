CREATE TABLE chat_sessions (
  id VARCHAR(64) PRIMARY KEY,
  owner_user_id VARCHAR(255) NOT NULL,
  connection_id VARCHAR(255) NOT NULL,
  title TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_sessions_owner_connection (owner_user_id, connection_id)
);

CREATE TABLE chat_messages (
  id VARCHAR(64) PRIMARY KEY,
  chat_id VARCHAR(64) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  parts_text LONGTEXT NOT NULL,
  metadata_text LONGTEXT NULL,
  sequence INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_messages_chat_id (chat_id),
  KEY idx_chat_messages_chat_sequence (chat_id, sequence),
  UNIQUE KEY idx_chat_messages_chat_sequence_unique (chat_id, sequence)
);
