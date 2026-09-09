CREATE TABLE IF NOT EXISTS api_rate_limits (
  namespace text NOT NULL,
  client_key text NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, client_key)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_reset_idx
  ON api_rate_limits (reset_at);
