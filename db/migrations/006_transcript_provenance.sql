-- Bind each recorded answer to immutable provider and reviewed transcript data.
ALTER TABLE application_recordings
  ADD COLUMN IF NOT EXISTS transcription_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider_transcript text,
  ADD COLUMN IF NOT EXISTS provider_transcript_sha256 text,
  ADD COLUMN IF NOT EXISTS provider_model text,
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;

ALTER TABLE application_recordings
  DROP CONSTRAINT IF EXISTS application_recordings_transcription_status_check;
ALTER TABLE application_recordings
  ADD CONSTRAINT application_recordings_transcription_status_check
  CHECK (transcription_status IN ('pending', 'succeeded', 'unavailable'));

ALTER TABLE application_recordings
  DROP CONSTRAINT IF EXISTS application_recordings_transcription_shape_check;
ALTER TABLE application_recordings
  ADD CONSTRAINT application_recordings_transcription_shape_check
  CHECK (
    (status = 'deleted' AND provider_transcript IS NULL)
    OR
    (transcription_status = 'pending'
      AND provider_transcript IS NULL
      AND provider_transcript_sha256 IS NULL
      AND provider_model IS NULL
      AND transcribed_at IS NULL)
    OR
    (transcription_status = 'succeeded'
      AND provider_transcript IS NOT NULL
      AND length(provider_transcript) > 0
      AND provider_transcript_sha256 ~ '^[0-9a-f]{64}$'
      AND provider_model IS NOT NULL
      AND transcribed_at IS NOT NULL)
    OR
    (transcription_status = 'unavailable'
      AND provider_transcript IS NULL
      AND provider_transcript_sha256 IS NULL
      AND provider_model IS NOT NULL
      AND transcribed_at IS NOT NULL)
  );

ALTER TABLE interview_turns
  ADD COLUMN IF NOT EXISTS recording_id uuid,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_model text,
  ADD COLUMN IF NOT EXISTS provider_transcript text,
  ADD COLUMN IF NOT EXISTS provider_transcript_sha256 text,
  ADD COLUMN IF NOT EXISTS candidate_correction text,
  ADD COLUMN IF NOT EXISTS candidate_correction_sha256 text,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS correction_diff jsonb,
  ADD COLUMN IF NOT EXISTS transcript_review_status text,
  ADD COLUMN IF NOT EXISTS reviewed_content text,
  ADD COLUMN IF NOT EXISTS reviewed_content_sha256 text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text;

ALTER TABLE interview_turns
  DROP CONSTRAINT IF EXISTS interview_turns_recording_id_fkey;
ALTER TABLE interview_turns
  ADD CONSTRAINT interview_turns_recording_id_fkey
  FOREIGN KEY (recording_id) REFERENCES application_recordings(id)
  ON DELETE SET NULL;

ALTER TABLE interview_turns
  DROP CONSTRAINT IF EXISTS interview_turns_provider_status_check;
ALTER TABLE interview_turns
  ADD CONSTRAINT interview_turns_provider_status_check
  CHECK (provider_status IS NULL OR provider_status IN ('succeeded', 'unavailable'));

ALTER TABLE interview_turns
  DROP CONSTRAINT IF EXISTS interview_turns_review_status_check;
ALTER TABLE interview_turns
  ADD CONSTRAINT interview_turns_review_status_check
  CHECK (
    transcript_review_status IS NULL
    OR transcript_review_status IN (
      'provider_verified',
      'candidate_correction_pending',
      'provider_unavailable',
      'human_verified'
    )
  );

CREATE OR REPLACE FUNCTION redact_deleted_recording_transcript()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted' THEN
    NEW.provider_transcript := NULL;
    NEW.provider_transcript_sha256 := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_recordings_redact_transcript
  ON application_recordings;
CREATE TRIGGER application_recordings_redact_transcript
BEFORE UPDATE OF status ON application_recordings
FOR EACH ROW
EXECUTE FUNCTION redact_deleted_recording_transcript();
