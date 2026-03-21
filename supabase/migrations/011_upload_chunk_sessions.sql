-- 上传分块持久化表：避免 Vercel 无状态实例丢失上传会话
-- 说明：建议在生产数据库中预先执行，避免首次上传时依赖运行时建表

CREATE TABLE IF NOT EXISTS upload_chunk_sessions (
  id text PRIMARY KEY,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  total_chunks integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_id text NOT NULL,
  semester text NOT NULL DEFAULT '',
  course text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_id text NOT NULL,
  is_admin_or_volunteer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_chunk_parts (
  session_id text NOT NULL REFERENCES upload_chunk_sessions(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS upload_chunk_sessions_created_at_idx
  ON upload_chunk_sessions(created_at);

CREATE INDEX IF NOT EXISTS upload_chunk_parts_session_idx
  ON upload_chunk_parts(session_id);
