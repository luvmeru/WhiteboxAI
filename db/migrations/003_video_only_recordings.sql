ALTER TABLE application_recordings
  DROP CONSTRAINT IF EXISTS application_recordings_content_type_check;

ALTER TABLE application_recordings
  ADD CONSTRAINT application_recordings_content_type_check
  CHECK (content_type IN ('video/webm', 'video/mp4'));
