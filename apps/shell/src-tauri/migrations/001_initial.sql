CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_name TEXT,
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  origin_server_ts INTEGER NOT NULL,
  is_agent INTEGER NOT NULL DEFAULT 0,
  thread_root_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_room_ts ON events(room_id, origin_server_ts);
CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_root_id) WHERE thread_root_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  name TEXT,
  member_count INTEGER DEFAULT 0,
  is_space INTEGER DEFAULT 0,
  parent_space_id TEXT,
  last_event_ts INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  homeserver_url TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  device_id TEXT
);
