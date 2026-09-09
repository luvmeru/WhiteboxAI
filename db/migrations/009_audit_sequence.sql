ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS sequence bigint,
  ADD COLUMN IF NOT EXISTS hash_version smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM audit_events
     WHERE hash_version <> 2
        OR sequence IS NULL
  ) THEN
    RAISE EXCEPTION
      'Unverifiable legacy audit events require an approved, anchored upgrade procedure; automatic re-signing is forbidden';
  END IF;

  IF EXISTS (
    SELECT organization_id
      FROM audit_events
     GROUP BY organization_id
    HAVING count(*) FILTER (WHERE previous_hash = 'genesis') <> 1
  ) THEN
    RAISE EXCEPTION
      'Audit migration requires exactly one genesis event per organization';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM audit_events child
     WHERE child.previous_hash <> 'genesis'
       AND NOT EXISTS (
         SELECT 1
           FROM audit_events parent
          WHERE parent.organization_id = child.organization_id
            AND parent.hash = child.previous_hash
       )
  ) THEN
    RAISE EXCEPTION
      'Audit migration found an orphaned previous_hash';
  END IF;

  IF EXISTS (
    SELECT organization_id, previous_hash
      FROM audit_events
     WHERE previous_hash <> 'genesis'
     GROUP BY organization_id, previous_hash
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Audit migration found a branched chain; repair it under an approved incident procedure';
  END IF;

  IF EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, organization_id, hash, 1::bigint AS sequence
        FROM audit_events
       WHERE previous_hash = 'genesis'
      UNION ALL
      SELECT child.id,
             child.organization_id,
             child.hash,
             parent.sequence + 1
        FROM audit_events child
        JOIN chain parent
          ON parent.organization_id = child.organization_id
         AND child.previous_hash = parent.hash
    ),
    totals AS (
      SELECT organization_id, count(*)::bigint AS event_count
        FROM audit_events
       GROUP BY organization_id
    ),
    reached AS (
      SELECT organization_id, count(*)::bigint AS event_count
        FROM chain
       GROUP BY organization_id
    )
    SELECT 1
      FROM totals
      LEFT JOIN reached USING (organization_id)
     WHERE totals.event_count <> COALESCE(reached.event_count, 0)
  ) THEN
    RAISE EXCEPTION
      'Audit migration found a cycle or disconnected chain';
  END IF;
END;
$$;

WITH RECURSIVE chain AS (
  SELECT id, organization_id, hash, 1::bigint AS sequence
    FROM audit_events
   WHERE previous_hash = 'genesis'
  UNION ALL
  SELECT child.id,
         child.organization_id,
         child.hash,
         parent.sequence + 1
    FROM audit_events child
    JOIN chain parent
      ON parent.organization_id = child.organization_id
     AND child.previous_hash = parent.hash
)
UPDATE audit_events event
   SET sequence = chain.sequence
  FROM chain
 WHERE event.id = chain.id;

ALTER TABLE audit_events
  ALTER COLUMN sequence SET NOT NULL;

ALTER TABLE audit_events
  ALTER COLUMN hash_version SET DEFAULT 2;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_hash_version_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_hash_version_check
  CHECK (hash_version = 2);

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_sequence_positive_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_sequence_positive_check
  CHECK (sequence > 0);

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_org_sequence_idx
  ON audit_events (organization_id, sequence);

CREATE TABLE IF NOT EXISTS audit_chain_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL
    REFERENCES organizations(id) ON DELETE RESTRICT,
  operation text NOT NULL
    CHECK (operation IN ('retention_redaction')),
  old_root_hash text NOT NULL,
  new_root_hash text NOT NULL,
  event_count bigint NOT NULL CHECK (event_count > 0),
  first_sequence bigint NOT NULL CHECK (first_sequence > 0),
  last_sequence bigint NOT NULL CHECK (last_sequence >= first_sequence),
  signature text NOT NULL
    CHECK (signature ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, old_root_hash, new_root_hash)
);

CREATE OR REPLACE FUNCTION reject_audit_checkpoint_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit chain checkpoints are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_chain_checkpoints_append_only
  ON audit_chain_checkpoints;
CREATE TRIGGER audit_chain_checkpoints_append_only
BEFORE UPDATE OR DELETE ON audit_chain_checkpoints
FOR EACH ROW
EXECUTE FUNCTION reject_audit_checkpoint_mutation();
