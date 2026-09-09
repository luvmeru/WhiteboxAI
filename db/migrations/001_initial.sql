CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Owner', 'HiringManager', 'TechnicalReviewer', 'Observer')),
  pii_reveal boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS vacancies (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS vacancies_org_status_idx ON vacancies (organization_id, status);

CREATE TABLE IF NOT EXISTS vacancy_versions (
  vacancy_id text NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  config jsonb NOT NULL,
  content_hash text NOT NULL,
  published_at timestamptz,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vacancy_id, version),
  FOREIGN KEY (organization_id, vacancy_id) REFERENCES vacancies(organization_id, id)
);

CREATE TABLE IF NOT EXISTS applications (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  vacancy_id text NOT NULL REFERENCES vacancies(id) ON DELETE RESTRICT,
  vacancy_version integer NOT NULL,
  internal_candidate_id text NOT NULL,
  session_token_hash text NOT NULL UNIQUE,
  stage text NOT NULL,
  state jsonb NOT NULL,
  lock_version integer NOT NULL DEFAULT 1,
  retention_deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vacancy_id, vacancy_version) REFERENCES vacancy_versions(vacancy_id, version),
  UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS applications_org_vacancy_stage_idx
  ON applications (organization_id, vacancy_id, stage);
CREATE INDEX IF NOT EXISTS applications_retention_idx
  ON applications (retention_deadline);

CREATE TABLE IF NOT EXISTS candidate_identities (
  application_id text PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  notice_version integer NOT NULL,
  purpose text NOT NULL,
  accepted boolean NOT NULL,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('ai', 'candidate')),
  topic text,
  kind text,
  content text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, turn_number, speaker)
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  input_hash text NOT NULL,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS human_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  request_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text NOT NULL,
  hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_org_created_idx
  ON audit_events (organization_id, created_at, id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

