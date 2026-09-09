export const APPLICATION_RETENTION_BATCH_SIZE = 500;
export const RECORDING_DELETE_BATCH_SIZE = 2_000;
export const ARTIFACT_DELETE_BATCH_SIZE = 2_000;
export const RECORDING_DELETE_RETRY_BASE_SECONDS = 60;
export const RECORDING_DELETE_RETRY_MAX_SECONDS = 86_400;

export function recordingDeleteRetryDelaySeconds(attempt) {
  const normalizedAttempt = Math.max(1, Math.trunc(Number(attempt) || 1));
  const exponent = Math.min(normalizedAttempt - 1, 11);
  return Math.min(
    RECORDING_DELETE_RETRY_MAX_SECONDS,
    RECORDING_DELETE_RETRY_BASE_SECONDS * (2 ** exponent),
  );
}

export function artifactDeleteRetryDelaySeconds(attempt) {
  return recordingDeleteRetryDelaySeconds(attempt);
}
