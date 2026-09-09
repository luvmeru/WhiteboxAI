ALTER TABLE applications
  ADD COLUMN retention_status text NOT NULL DEFAULT 'active',
  ADD COLUMN retention_started_at timestamptz,
  ADD COLUMN anonymized_at timestamptz,
  ADD COLUMN retention_completed_at timestamptz;

ALTER TABLE application_recordings
  ADD COLUMN delete_attempts integer NOT NULL DEFAULT 0
    CHECK (delete_attempts >= 0),
  ADD COLUMN delete_next_attempt_at timestamptz,
  ADD COLUMN delete_last_error text
    CHECK (delete_last_error IS NULL OR char_length(delete_last_error) <= 500);

UPDATE application_recordings
   SET delete_next_attempt_at = COALESCE(delete_next_attempt_at, now())
 WHERE status = 'delete_pending';

WITH already_anonymized AS (
  SELECT a.id,
         EXISTS (
           SELECT 1
             FROM application_recordings r
            WHERE r.application_id = a.id
              AND r.status <> 'deleted'
         ) AS has_pending_objects
    FROM applications a
   WHERE a.state ->> 'sessionTokenHash' = 'expired'
)
UPDATE applications a
   SET retention_status = CASE
                            WHEN historical.has_pending_objects
                              THEN 'object_delete_pending'
                            ELSE 'complete'
                          END,
       retention_started_at = COALESCE(a.retention_started_at, a.updated_at, now()),
       anonymized_at = COALESCE(a.anonymized_at, a.updated_at, now()),
       retention_completed_at = CASE
                                  WHEN historical.has_pending_objects THEN NULL
                                  ELSE COALESCE(
                                    a.retention_completed_at,
                                    a.updated_at,
                                    now()
                                  )
                                END
  FROM already_anonymized historical
 WHERE a.id = historical.id;

ALTER TABLE applications
  ADD CONSTRAINT applications_retention_status_check
  CHECK (
    retention_status IN (
      'active',
      'processing',
      'object_delete_pending',
      'complete'
    )
  ),
  ADD CONSTRAINT applications_retention_timestamps_check
  CHECK (
    (
      retention_status = 'active'
      AND retention_started_at IS NULL
      AND anonymized_at IS NULL
      AND retention_completed_at IS NULL
    )
    OR (
      retention_status = 'processing'
      AND retention_started_at IS NOT NULL
      AND anonymized_at IS NULL
      AND retention_completed_at IS NULL
    )
    OR (
      retention_status = 'object_delete_pending'
      AND retention_started_at IS NOT NULL
      AND anonymized_at IS NOT NULL
      AND retention_completed_at IS NULL
    )
    OR (
      retention_status = 'complete'
      AND retention_started_at IS NOT NULL
      AND anonymized_at IS NOT NULL
      AND retention_completed_at IS NOT NULL
    )
  );

CREATE INDEX applications_retention_work_idx
  ON applications (retention_deadline, id)
  WHERE retention_status IN ('active', 'processing');

CREATE INDEX application_recordings_delete_retry_idx
  ON application_recordings (delete_next_attempt_at, retention_deadline, id)
  WHERE status = 'delete_pending';
