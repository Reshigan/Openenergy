-- ════════════════════════════════════════════════════════════════════════
-- 069_ai_assistant.sql — Conversational AI assistant.
--
--   • oe_ai_sessions     — per-user chat sessions
--   • oe_ai_messages     — chat history with tool-call audit
--   • oe_ai_actions      — actions the assistant proposed + user accepted
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_ai_sessions (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  surface_context TEXT,                 -- 'esums-om' / 'trading' / 'settlement' / etc.
  title           TEXT,
  pinned          INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT,
  message_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oe_ai_sess_part ON oe_ai_sessions(participant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS oe_ai_messages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  role            TEXT NOT NULL,        -- 'user' | 'assistant' | 'system' | 'tool'
  content         TEXT NOT NULL,
  tool_calls_json TEXT,                 -- JSON of suggested tool calls
  citations_json  TEXT,                 -- JSON of citations (tables / record ids)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_ai_msg_sess ON oe_ai_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS oe_ai_actions (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  action_kind     TEXT NOT NULL,        -- 'create_wo' | 'acknowledge_fault' | ...
  payload_json    TEXT NOT NULL,
  outcome         TEXT NOT NULL DEFAULT 'proposed',
                                         -- proposed | accepted | rejected | executed | failed
  executed_at     TEXT,
  result_json     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_ai_actions_msg ON oe_ai_actions(message_id);
