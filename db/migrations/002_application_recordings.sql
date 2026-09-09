CREATE TABLE IF NOT EXISTS application_recordings (
  id uuid PRIMARY KEY,
  application_id text NOT NULL,
  organization_id text NOT NULL,
  application_lock_version integer NOT NULL CHECK (application_lock_version > 0),
  turn_number integer NOT NULL CHECK (turn_number > 0),
  storage_provider text NOT NULL CHECK (storage_provider IN ('s3', 'local-demo')),
  storage_bucket text,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (
    content_type IN ('video/webm', 'video/mp4', 'audio/webm')
  ),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 25165824),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (
    status IN ('uploading', 'stored', 'delete_pending', 'deleted')
  ),
  retention_deadline timestamptz NOT NULL,
  receipt_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  deleted_at timestamptz,
  FOREIGN KEY (organization_id, application_id)
    REFERENCES applications(organization_id, id) ON DELETE CASCADE,
  UNIQUE (application_id, application_lock_version, turn_number),
  CHECK (
    (storage_provider = 's3' AND storage_bucket IS NOT NULL)
    OR (storage_provider = 'local-demo' AND storage_bucket IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS application_recordings_retention_idx
  ON application_recordings (retention_deadline, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS application_recordings_application_idx
  ON application_recordings (organization_id, application_id, turn_number);
