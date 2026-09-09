DO $$
DECLARE
  constraint_name name;
  constraint_count integer;
BEGIN
  SELECT count(*), min(pc.conname)
    INTO constraint_count, constraint_name
    FROM pg_constraint pc
   WHERE pc.conrelid = 'application_artifacts'::regclass
     AND pc.contype = 'c'
     AND pg_get_constraintdef(pc.oid) LIKE '%original_filename%';
  IF constraint_count <> 1 OR constraint_name IS NULL THEN
    RAISE EXCEPTION
      'Expected exactly one application_artifacts filename check, found %',
      constraint_count;
  END IF;
  EXECUTE format(
    'ALTER TABLE application_artifacts DROP CONSTRAINT %I',
    constraint_name
  );
END;
$$;

UPDATE application_artifacts
   SET original_filename = NULL
 WHERE status = 'delete_pending';

ALTER TABLE application_artifacts
  ADD CONSTRAINT application_artifacts_filename_retention_check
  CHECK (
    (
      status IN ('delete_pending', 'deleted')
      AND original_filename IS NULL
    )
    OR
    (
      status IN ('uploading', 'stored')
      AND original_filename IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION redact_pending_artifact_filename()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('delete_pending', 'deleted') THEN
    NEW.original_filename := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_artifacts_redact_filename
  ON application_artifacts;
CREATE TRIGGER application_artifacts_redact_filename
BEFORE INSERT OR UPDATE OF status ON application_artifacts
FOR EACH ROW
EXECUTE FUNCTION redact_pending_artifact_filename();

ALTER TABLE application_recordings
  DROP CONSTRAINT IF EXISTS application_recordings_transcription_shape_check;

UPDATE application_recordings
   SET provider_transcript = NULL,
       provider_transcript_sha256 = CASE
         WHEN status = 'deleted' THEN NULL
         ELSE provider_transcript_sha256
       END
 WHERE status IN ('delete_pending', 'deleted');

ALTER TABLE application_recordings
  ADD CONSTRAINT application_recordings_transcription_shape_check
  CHECK (
    (
      status = 'delete_pending'
      AND provider_transcript IS NULL
    )
    OR
    (
      status = 'deleted'
      AND provider_transcript IS NULL
      AND provider_transcript_sha256 IS NULL
    )
    OR
    (
      status NOT IN ('delete_pending', 'deleted')
      AND (
        (
          transcription_status = 'pending'
          AND provider_transcript IS NULL
          AND provider_transcript_sha256 IS NULL
          AND provider_model IS NULL
          AND transcribed_at IS NULL
        )
        OR
        (
          transcription_status = 'succeeded'
          AND provider_transcript IS NOT NULL
          AND length(provider_transcript) > 0
          AND provider_transcript_sha256 ~ '^[0-9a-f]{64}$'
          AND provider_model IS NOT NULL
          AND transcribed_at IS NOT NULL
        )
        OR
        (
          transcription_status = 'unavailable'
          AND provider_transcript IS NULL
          AND provider_transcript_sha256 IS NULL
          AND provider_model IS NOT NULL
          AND transcribed_at IS NOT NULL
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION redact_deleted_recording_transcript()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('delete_pending', 'deleted') THEN
    NEW.provider_transcript := NULL;
  END IF;
  IF NEW.status = 'deleted' THEN
    NEW.provider_transcript_sha256 := NULL;
  END IF;
  RETURN NEW;
END;
$$;
