-- MonkaMemory private database schema. Already applied to the MonkaMemory Neon project.
-- Use a direct Neon connection for migrations. Do not run on another game's database.
CREATE TABLE IF NOT EXISTS mm_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_key_hash TEXT NOT NULL UNIQUE,
  display_name VARCHAR(24) NOT NULL DEFAULT 'Monke',
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0 AND coins <= 2000000000),
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason VARCHAR(300),
  banned_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_players_last_seen_idx ON mm_players(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS mm_players_display_idx ON mm_players(lower(display_name));
CREATE TABLE IF NOT EXISTS mm_player_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES mm_players(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_player_sessions_player_idx ON mm_player_sessions(player_id);
CREATE INDEX IF NOT EXISTS mm_player_sessions_exp_idx ON mm_player_sessions(expires_at);
CREATE TABLE IF NOT EXISTS mm_catalog (
  item_id VARCHAR(64) PRIMARY KEY,
  catalog VARCHAR(64) NOT NULL DEFAULT 'main',
  display_name VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mm_inventory (
  player_id UUID NOT NULL REFERENCES mm_players(id) ON DELETE CASCADE,
  item_id VARCHAR(64) NOT NULL REFERENCES mm_catalog(item_id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id,item_id)
);
CREATE INDEX IF NOT EXISTS mm_inventory_item_idx ON mm_inventory(item_id);
CREATE TABLE IF NOT EXISTS mm_game_config (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO mm_game_config(key,value) VALUES
 ('MOTD','Welcome to Monka VR!'),('MinimumClientVersion','0.0.0'),('MaintenanceMode','false')
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS mm_admin_users (
  username VARCHAR(60) PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mm_admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  username VARCHAR(60) NOT NULL REFERENCES mm_admin_users(username) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_admin_sessions_exp_idx ON mm_admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS mm_photon_tickets (
  token_hash CHAR(64) PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES mm_players(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mm_photon_tickets_exp_idx ON mm_photon_tickets(expires_at);
CREATE TABLE IF NOT EXISTS mm_currency_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES mm_players(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  actor VARCHAR(60) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_ledger_player_idx ON mm_currency_ledger(player_id,created_at DESC);
CREATE TABLE IF NOT EXISTS mm_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor VARCHAR(60) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_audit_recent_idx ON mm_audit_log(created_at DESC);
