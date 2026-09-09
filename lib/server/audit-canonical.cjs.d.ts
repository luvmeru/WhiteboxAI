export interface CanonicalAuditEventInput {
  id: string;
  organizationId: string;
  hashVersion: 2;
  sequence: number;
  actor: {
    type: string;
    id: string;
  };
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string | null;
  payload?: Record<string, unknown>;
  previousHash: string;
  createdAt: string;
}

export function stableJsonStringify(value: unknown): string;
export function canonicalAuditEvent(input: CanonicalAuditEventInput): string;
