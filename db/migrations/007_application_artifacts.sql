CREATE TABLE IF NOT EXISTS application_artifacts (
  id uuid PRIMARY KEY,
  application_id text NOT NULL,
  organization_id text NOT NULL,
  application_lock_version integer NOT NULL
    CHECK (application_lock_version > 0),
  block_id text NOT NULL
    CHECK (
      char_length(block_id) BETWEEN 1 AND 160
      AND block_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  purpose text NOT NULL CHECK (
    purpose IN (
      'cv_intake',
      'document_check',
      'work_sample',
      'coding',
      'case_study',
      'custom'
    )
  ),
  idempotency_key_hash text NOT NULL
    CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  file_index integer NOT NULL CHECK (file_index >= 0 AND file_index < 8),
  original_filename text,
  storage_provider text NOT NULL
    CHECK (storage_provider IN ('s3', 'local-demo')),
  storage_bucket text,
  storage_key text NOT NULL UNIQUE
    CHECK (storage_key ~ '^artifacts/v1/[a-z0-9/_-]+$'),
  content_type text NOT NULL CHECK (
    content_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/zip'
    )
  ),
  byte_size bigint NOT NULL
    CHECK (byte_size > 0 AND byte_size <= 20971520),
  content_sha256 text NOT NULL
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (
    status IN ('uploading', 'stored', 'delete_pending', 'deleted')
  ),
  retention_deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  deleted_at timestamptz,
  delete_attempts integer NOT NULL DEFAULT 0
    CHECK (delete_attempts >= 0),
  delete_next_attempt_at timestamptz,
  delete_last_error text
    CHECK (delete_last_error IS NULL OR char_length(delete_last_error) <= 500),
  FOREIGN KEY (organization_id, application_id)
    REFERENCES applications(organization_id, id) ON DELETE CASCADE,
  UNIQUE (
    organization_id,
    application_id,
    application_lock_version,
    block_id,
    idempotency_key_hash,
    file_index
  ),
  CHECK (
    (storage_provider = 's3' AND storage_bucket IS NOT NULL)
    OR (storage_provider = 'local-demo' AND storage_bucket IS NULL)
  ),
  CHECK (
    (status = 'deleted' AND original_filename IS NULL)
    OR (status <> 'deleted' AND original_filename IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS application_artifacts_application_idx
  ON application_artifacts (
    organization_id,
    application_id,
    application_lock_version,
    block_id
  );

CREATE INDEX IF NOT EXISTS application_artifacts_delete_retry_idx
  ON application_artifacts (delete_next_attempt_at, retention_deadline, id)
  WHERE status = 'delete_pending';

CREATE INDEX IF NOT EXISTS application_artifacts_retention_idx
  ON application_artifacts (retention_deadline, id)
  WHERE status <> 'deleted';
