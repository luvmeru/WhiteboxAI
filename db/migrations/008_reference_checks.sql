CREATE TABLE IF NOT EXISTS reference_check_invitations (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id text NOT NULL,
  vacancy_id text NOT NULL,
  vacancy_version integer NOT NULL,
  block_id text NOT NULL,
  referee_ordinal integer NOT NULL CHECK (referee_ordinal BETWEEN 1 AND 4),
  relationship text NOT NULL CHECK (relationship IN ('manager', 'peer', 'report')),
  contact_hash text NOT NULL,
  role_title text NOT NULL,
  questionnaire jsonb NOT NULL,
  questionnaire_hash text NOT NULL,
  fraud_controls boolean NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'responded', 'revoked')),
  expires_at timestamptz NOT NULL,
  response_id uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id, application_id)
    REFERENCES applications(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id, vacancy_version)
    REFERENCES vacancy_versions(vacancy_id, version) ON DELETE RESTRICT,
  UNIQUE (application_id, block_id, referee_ordinal, created_at),
  CHECK (
    (status = 'responded' AND response_id IS NOT NULL AND responded_at IS NOT NULL)
    OR
    (status <> 'responded' AND response_id IS NULL AND responded_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reference_check_invitation_active_idx
  ON reference_check_invitations (application_id, block_id, referee_ordinal)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS reference_check_invitation_expiry_idx
  ON reference_check_invitations (expires_at, id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS reference_check_responses (
  id uuid PRIMARY KEY,
  invitation_id uuid NOT NULL UNIQUE
    REFERENCES reference_check_invitations(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id text NOT NULL,
  vacancy_id text NOT NULL,
  vacancy_version integer NOT NULL,
  block_id text NOT NULL,
  referee_ordinal integer NOT NULL CHECK (referee_ordinal BETWEEN 1 AND 4),
  relationship text NOT NULL CHECK (relationship IN ('manager', 'peer', 'report')),
  questionnaire_hash text NOT NULL,
  response_hash text NOT NULL UNIQUE,
  answers jsonb NOT NULL,
  consent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  request_fingerprint_hash text,
  FOREIGN KEY (organization_id, application_id)
    REFERENCES applications(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (vacancy_id, vacancy_version)
    REFERENCES vacancy_versions(vacancy_id, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS reference_check_response_application_idx
  ON reference_check_responses
    (organization_id, application_id, block_id, received_at, id);

CREATE OR REPLACE FUNCTION prevent_reference_response_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reference_check_responses are append-only';
END;
$$;

DROP TRIGGER IF EXISTS reference_response_append_only
  ON reference_check_responses;
CREATE TRIGGER reference_response_append_only
BEFORE UPDATE ON reference_check_responses
FOR EACH ROW
EXECUTE FUNCTION prevent_reference_response_update();
