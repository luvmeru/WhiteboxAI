import {
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";

import type {
  PipelineBlock,
  ReferenceCheckSettings,
} from "../types";
import { appendAuditEvent } from "./audit";
import {
  constantTimeEqual,
  effectiveSecret,
  hmacSha256,
  randomToken,
  sha256,
} from "./crypto";
import {
  databaseConfigured,
  query,
  transaction,
} from "./db";
import {
  getServerEnv,
  isDevelopmentDemoMode,
} from "./env";
import {
  getTenantApplication,
  type StoredCandidateApplication,
} from "./repository";

export const REFERENCE_INVITATION_SCHEMA_VERSION =
  "reference-invitation-v1" as const;
export const REFERENCE_RESPONSE_SCHEMA_VERSION =
  "reference-response-v1" as const;

const DEV_STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "reference-checks.dev.json",
);
const TOKEN_PREFIX = "wbr1";
const TOKEN_PATTERN =
  /^wbr1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{40,100})$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface ReferenceQuestionSnapshot {
  id: string;
  text: string;
  attributeId: string | null;
  type: "rating" | "open";
}

export interface ReferenceInvitationRecord {
  schemaVersion: typeof REFERENCE_INVITATION_SCHEMA_VERSION;
  id: string;
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  refereeOrdinal: number;
  relationship: "manager" | "peer" | "report";
  contactHash: string;
  roleTitle: string;
  questionnaire: ReferenceQuestionSnapshot[];
  questionnaireHash: string;
  fraudControls: boolean;
  tokenHash: string;
  status: "pending" | "responded" | "revoked";
  expiresAt: string;
  responseId: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export type ReferenceResponseAnswer =
  | {
      questionId: string;
      type: "rating";
      unableToObserve: boolean;
      rating: 1 | 2 | 3 | 4 | 5 | null;
      text: null;
    }
  | {
      questionId: string;
      type: "open";
      unableToObserve: boolean;
      rating: null;
      text: string | null;
    };

export interface ReferenceResponseRecord {
  schemaVersion: typeof REFERENCE_RESPONSE_SCHEMA_VERSION;
  id: string;
  invitationId: string;
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  refereeOrdinal: number;
  relationship: "manager" | "peer" | "report";
  questionnaireHash: string;
  responseHash: string;
  answers: ReferenceResponseAnswer[];
  consentAt: string;
  receivedAt: string;
  requestFingerprintHash: string | null;
}

export interface ReferenceEvidencePointer {
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  receiptId: string;
  invitationId: string;
  refereeOrdinal: number;
  questionnaireHash: string;
  responseHash: string;
  respondedAt: string;
  sourceItemIds: string[];
}

export interface IssuedReferenceInvitation {
  invitationId: string;
  refereeOrdinal: number;
  relationship: "manager" | "peer" | "report";
  expiresAt: string;
  deliveryUrl: string;
}

export interface ReferenceInvitationScope {
  organizationId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  internalCandidateId: string;
}

export interface CandidateRefereeContact {
  email: string;
  relationship: "manager" | "peer" | "report";
}

export interface PublicReferenceQuestionnaire {
  invitationId: string;
  roleTitle: string;
  relationship: "manager" | "peer" | "report";
  expiresAt: string;
  questions: ReferenceQuestionSnapshot[];
}

export interface HrReferenceResponseView {
  receiptId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  relationship: "manager" | "peer" | "report";
  refereeOrdinal: number;
  questionnaireHash: string;
  responseHash: string;
  consentAt: string;
  receivedAt: string;
  questions: ReferenceQuestionSnapshot[];
  answers: ReferenceResponseAnswer[];
}

export interface HrReferenceResponseEvidence {
  receiptId: string;
  applicationId: string;
  vacancyId: string;
  vacancyVersion: number;
  blockId: string;
  relationship: "manager" | "peer" | "report";
  refereeOrdinal: number;
  questionnaireHash: string;
  responseHash: string;
  receivedAt: string;
  question: ReferenceQuestionSnapshot;
  answer: ReferenceResponseAnswer;
}

interface DevReferenceStore {
  invitations: Record<string, ReferenceInvitationRecord>;
  responses: Record<string, ReferenceResponseRecord>;
  audit: {
    at: string;
    action: string;
    targetId: string;
    applicationId: string;
    organizationId: string;
  }[];
}

export class ReferenceCheckError extends Error {
  constructor(
    readonly code:
      | "INVALID_TOKEN"
      | "TOKEN_EXPIRED"
      | "TOKEN_USED"
      | "INVALID_SCOPE"
      | "INVALID_RESPONSE"
      | "RESPONSE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ReferenceCheckError";
  }
}

let devWriteQueue: Promise<void> = Promise.resolve();

function emptyDevStore(): DevReferenceStore {
  return { invitations: {}, responses: {}, audit: [] };
}

function assertDevStore(): void {
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "Reference checks require PostgreSQL outside explicit development demo mode.",
    );
  }
}

async function readDevStore(): Promise<DevReferenceStore> {
  assertDevStore();
  try {
    const raw = await readFile(DEV_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DevReferenceStore>;
    return {
      invitations: parsed.invitations ?? {},
      responses: parsed.responses ?? {},
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return emptyDevStore();
    }
    throw error;
  }
}

async function writeDevStoreSnapshot(
  store: DevReferenceStore,
): Promise<void> {
  const directory = path.dirname(DEV_STORE_PATH);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${DEV_STORE_PATH}.${process.pid}.${randomToken(8)}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(store, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await rename(temporaryPath, DEV_STORE_PATH);
}

async function mutateDevStore<T>(
  mutation: (store: DevReferenceStore) => T | Promise<T>,
): Promise<T> {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  devWriteQueue = devWriteQueue.then(async () => {
    try {
      const store = await readDevStore();
      const value = await mutation(store);
      await writeDevStoreSnapshot(store);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  });
  await devWriteQueue.catch(() => undefined);
  return result;
}

function referenceSecret(): string {
  const env = getServerEnv();
  if (
    env.NODE_ENV === "production" &&
    !env.WBX_AUTH_SECRET
  ) {
    throw new Error(
      "WBX_AUTH_SECRET is required for reference invitation bindings.",
    );
  }
  return effectiveSecret(env.WBX_AUTH_SECRET);
}

function normalizeContactEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new ReferenceCheckError(
      "INVALID_SCOPE",
      "A referee contact email is invalid.",
    );
  }
  return normalized;
}

function contactHash(email: string): string {
  return hmacSha256(
    `reference-contact-v1:${normalizeContactEmail(email)}`,
    referenceSecret(),
  );
}

function stableQuestionnaire(
  scope: ReferenceInvitationScope,
  block: PipelineBlock & { settings: ReferenceCheckSettings },
): ReferenceQuestionSnapshot[] {
  if (
    block.settings.questionnaire.length === 0 ||
    new Set(
      block.settings.questionnaire.map((question) => question.id),
    ).size !== block.settings.questionnaire.length
  ) {
    throw new ReferenceCheckError(
      "INVALID_SCOPE",
      "The frozen reference questionnaire is empty or ambiguous.",
    );
  }
  return block.settings.questionnaire.map((question) => ({
    id: question.id,
    text: question.text,
    attributeId: question.attributeId ?? null,
    type: question.type,
  }));
}

function questionnaireHashFor(
  scope: ReferenceInvitationScope,
  blockId: string,
  questions: ReferenceQuestionSnapshot[],
): string {
  return sha256(
    JSON.stringify({
      schemaVersion: REFERENCE_INVITATION_SCHEMA_VERSION,
      organizationId: scope.organizationId,
      applicationId: scope.applicationId,
      vacancyId: scope.vacancyId,
      vacancyVersion: scope.vacancyVersion,
      blockId,
      questions,
    }),
  );
}

function responseHashFor(
  response: Omit<
    ReferenceResponseRecord,
    | "schemaVersion"
    | "responseHash"
    | "requestFingerprintHash"
  >,
): string {
  return sha256(
    JSON.stringify({
      schemaVersion: REFERENCE_RESPONSE_SCHEMA_VERSION,
      id: response.id,
      invitationId: response.invitationId,
      organizationId: response.organizationId,
      applicationId: response.applicationId,
      vacancyId: response.vacancyId,
      vacancyVersion: response.vacancyVersion,
      blockId: response.blockId,
      refereeOrdinal: response.refereeOrdinal,
      relationship: response.relationship,
      questionnaireHash: response.questionnaireHash,
      answers: response.answers,
      consentAt: response.consentAt,
      receivedAt: response.receivedAt,
    }),
  );
}

function publicOrigin(requestUrl: string): string {
  const env = getServerEnv();
  const configured = env.NEXT_PUBLIC_APP_URL
    ? new URL(env.NEXT_PUBLIC_APP_URL)
    : null;
  const requested = new URL(requestUrl);
  const origin = configured ?? requested;
  if (
    env.NODE_ENV === "production" &&
    origin.protocol !== "https:"
  ) {
    throw new Error(
      "Reference invitation links require NEXT_PUBLIC_APP_URL with HTTPS in production.",
    );
  }
  if (
    env.NODE_ENV !== "production" &&
    origin.protocol !== "http:" &&
    origin.protocol !== "https:"
  ) {
    throw new Error("Reference invitation origin is invalid.");
  }
  return origin.origin;
}

function invitationToken(
  invitationId: string,
): { token: string; tokenHash: string } {
  // The bearer secret is reproducible only by this server. This lets an
  // authenticated candidate recover a pending manual-delivery URL after an
  // ambiguous HTTP commit without persisting plaintext credentials.
  const secret = hmacSha256(
    `reference-bearer-v1:${invitationId}`,
    referenceSecret(),
  );
  return {
    token: `${TOKEN_PREFIX}.${invitationId}.${secret}`,
    tokenHash: sha256(`${TOKEN_PREFIX}:${invitationId}:${secret}`),
  };
}

function parseToken(
  token: string,
): { invitationId: string; tokenHash: string } | null {
  if (token.length > 180) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const invitationId = match[1];
  const secret = match[2];
  return {
    invitationId,
    tokenHash: sha256(`${TOKEN_PREFIX}:${invitationId}:${secret}`),
  };
}

function verifyToken(
  invitation: ReferenceInvitationRecord,
  parsed: ReturnType<typeof parseToken>,
): void {
  if (
    !parsed ||
    parsed.invitationId !== invitation.id ||
    !constantTimeEqual(parsed.tokenHash, invitation.tokenHash)
  ) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is invalid.",
    );
  }
}

function assertInvitationActive(
  invitation: ReferenceInvitationRecord,
  now: Date,
): void {
  if (invitation.status === "responded") {
    throw new ReferenceCheckError(
      "TOKEN_USED",
      "This reference invitation has already been completed.",
    );
  }
  if (invitation.status === "revoked") {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is no longer active.",
    );
  }
  if (
    !Number.isFinite(Date.parse(invitation.expiresAt)) ||
    Date.parse(invitation.expiresAt) <= now.getTime()
  ) {
    throw new ReferenceCheckError(
      "TOKEN_EXPIRED",
      "This reference invitation has expired.",
    );
  }
}

function assertInvitationMatchesApplication(
  invitation: ReferenceInvitationRecord,
  application: StoredCandidateApplication | null,
): void {
  const expectedQuestionnaireHash = questionnaireHashFor(
    {
      organizationId: invitation.organizationId,
      applicationId: invitation.applicationId,
      vacancyId: invitation.vacancyId,
      vacancyVersion: invitation.vacancyVersion,
      internalCandidateId: "",
    },
    invitation.blockId,
    invitation.questionnaire,
  );
  if (
    !application ||
    application.vacancyId !== invitation.vacancyId ||
    application.vacancyVersion !== invitation.vacancyVersion ||
    !constantTimeEqual(
      invitation.questionnaireHash,
      expectedQuestionnaireHash,
    ) ||
    !application.assessmentPlan ||
    !application.blockResults
  ) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is not bound to an active frozen application.",
    );
  }
  const planBlock = application.assessmentPlan.blocks.find(
    (block) => block.id === invitation.blockId,
  );
  const result = application.blockResults.find(
    (candidate) => candidate.blockId === invitation.blockId,
  );
  if (
    !planBlock ||
    planBlock.kind !== "reference_check" ||
    !result ||
    result.kind !== "reference_check" ||
    !result.payload ||
    typeof result.payload !== "object" ||
    Array.isArray(result.payload)
  ) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is not bound to a submitted frozen reference stage.",
    );
  }
  const referees = (
    result.payload as { referees?: unknown }
  ).referees;
  const referee =
    Array.isArray(referees) &&
    referees[invitation.refereeOrdinal - 1] &&
    typeof referees[invitation.refereeOrdinal - 1] === "object" &&
    !Array.isArray(referees[invitation.refereeOrdinal - 1])
      ? (referees[
          invitation.refereeOrdinal - 1
        ] as Record<string, unknown>)
      : null;
  if (
    !referee ||
    typeof referee.email !== "string" ||
    referee.relationship !== invitation.relationship ||
    !constantTimeEqual(
      contactHash(referee.email),
      invitation.contactHash,
    )
  ) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation no longer matches its frozen referee binding.",
    );
  }
}

async function assertInvitationApplicationBinding(
  invitation: ReferenceInvitationRecord,
): Promise<void> {
  const application = await getTenantApplication(
    invitation.applicationId,
    invitation.organizationId,
  );
  assertInvitationMatchesApplication(invitation, application);
}

function rowToInvitation(
  row: Record<string, unknown>,
): ReferenceInvitationRecord {
  return {
    schemaVersion: REFERENCE_INVITATION_SCHEMA_VERSION,
    id: String(row.id),
    organizationId: String(row.organization_id),
    applicationId: String(row.application_id),
    vacancyId: String(row.vacancy_id),
    vacancyVersion: Number(row.vacancy_version),
    blockId: String(row.block_id),
    refereeOrdinal: Number(row.referee_ordinal),
    relationship: row.relationship as ReferenceInvitationRecord["relationship"],
    contactHash: String(row.contact_hash),
    roleTitle: String(row.role_title),
    questionnaire: row.questionnaire as ReferenceQuestionSnapshot[],
    questionnaireHash: String(row.questionnaire_hash),
    fraudControls: Boolean(row.fraud_controls),
    tokenHash: String(row.token_hash),
    status: row.status as ReferenceInvitationRecord["status"],
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    responseId: row.response_id ? String(row.response_id) : null,
    respondedAt: row.responded_at
      ? new Date(String(row.responded_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function rowToResponse(
  row: Record<string, unknown>,
): ReferenceResponseRecord {
  return {
    schemaVersion: REFERENCE_RESPONSE_SCHEMA_VERSION,
    id: String(row.id),
    invitationId: String(row.invitation_id),
    organizationId: String(row.organization_id),
    applicationId: String(row.application_id),
    vacancyId: String(row.vacancy_id),
    vacancyVersion: Number(row.vacancy_version),
    blockId: String(row.block_id),
    refereeOrdinal: Number(row.referee_ordinal),
    relationship: row.relationship as ReferenceResponseRecord["relationship"],
    questionnaireHash: String(row.questionnaire_hash),
    responseHash: String(row.response_hash),
    answers: row.answers as ReferenceResponseAnswer[],
    consentAt: new Date(String(row.consent_at)).toISOString(),
    receivedAt: new Date(String(row.received_at)).toISOString(),
    requestFingerprintHash: row.request_fingerprint_hash
      ? String(row.request_fingerprint_hash)
      : null,
  };
}

function invitationValues(
  record: ReferenceInvitationRecord,
): unknown[] {
  return [
    record.id,
    record.organizationId,
    record.applicationId,
    record.vacancyId,
    record.vacancyVersion,
    record.blockId,
    record.refereeOrdinal,
    record.relationship,
    record.contactHash,
    record.roleTitle,
    JSON.stringify(record.questionnaire),
    record.questionnaireHash,
    record.fraudControls,
    record.tokenHash,
    record.status,
    record.expiresAt,
    record.responseId,
    record.respondedAt,
    record.createdAt,
  ];
}

async function insertInvitation(
  client: PoolClient,
  record: ReferenceInvitationRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO reference_check_invitations
       (id, organization_id, application_id, vacancy_id, vacancy_version,
        block_id, referee_ordinal, relationship, contact_hash, role_title,
        questionnaire, questionnaire_hash, fraud_controls, token_hash, status,
        expires_at, response_id, responded_at, created_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
        $14, $15, $16, $17, $18, $19)`,
    invitationValues(record),
  );
}

export async function issueReferenceInvitations(input: {
  scope: ReferenceInvitationScope;
  roleTitle: string;
  block: PipelineBlock & { settings: ReferenceCheckSettings };
  referees: CandidateRefereeContact[];
  requestUrl: string;
  requestId?: string;
  now?: Date;
}): Promise<IssuedReferenceInvitation[]> {
  const {
    scope,
    block,
    roleTitle,
    referees,
    requestUrl,
    requestId,
  } = input;
  const now = input.now ?? new Date();
  if (
    block.kind !== "reference_check" ||
    block.settings.kind !== "reference_check" ||
    block.id.length === 0 ||
    scope.vacancyVersion < 1 ||
    referees.length !== block.settings.referees.count
  ) {
    throw new ReferenceCheckError(
      "INVALID_SCOPE",
      "Reference invitation scope does not match the frozen block.",
    );
  }
  const questions = stableQuestionnaire(scope, block);
  const questionnaireHash = questionnaireHashFor(
    scope,
    block.id,
    questions,
  );
  const origin = publicOrigin(requestUrl);
  const expiresAt = new Date(
    now.getTime() +
      Math.max(1, block.settings.collectionWindowDays) *
        24 *
        60 *
        60 *
        1_000,
  ).toISOString();
  const records = referees.map((referee, index) => {
    if (
      !block.settings.referees.relationships.includes(
        referee.relationship,
      )
    ) {
      throw new ReferenceCheckError(
        "INVALID_SCOPE",
        "A referee relationship is outside the frozen options.",
      );
    }
    const id = randomUUID();
    const issued = invitationToken(id);
    const record: ReferenceInvitationRecord = {
      schemaVersion: REFERENCE_INVITATION_SCHEMA_VERSION,
      id,
      organizationId: scope.organizationId,
      applicationId: scope.applicationId,
      vacancyId: scope.vacancyId,
      vacancyVersion: scope.vacancyVersion,
      blockId: block.id,
      refereeOrdinal: index + 1,
      relationship: referee.relationship,
      contactHash: contactHash(referee.email),
      roleTitle: roleTitle.trim().slice(0, 300),
      questionnaire: questions,
      questionnaireHash,
      fraudControls: block.settings.fraudControls,
      tokenHash: issued.tokenHash,
      status: "pending",
      expiresAt,
      responseId: null,
      respondedAt: null,
      createdAt: now.toISOString(),
    };
    return {
      record,
      delivery: {
        invitationId: id,
        refereeOrdinal: index + 1,
        relationship: referee.relationship,
        expiresAt,
        deliveryUrl: `${origin}/reference/${encodeURIComponent(issued.token)}`,
      } satisfies IssuedReferenceInvitation,
    };
  });
  if (
    new Set(records.map(({ record }) => record.contactHash)).size !==
    records.length
  ) {
    throw new ReferenceCheckError(
      "INVALID_SCOPE",
      "Each frozen referee position requires a distinct contact.",
    );
  }
  let delivered: IssuedReferenceInvitation[] = [];

  if (databaseConfigured()) {
    await transaction(async (client) => {
      const locked = await client.query<{
        state: StoredCandidateApplication;
      }>(
        `SELECT state
           FROM applications
          WHERE organization_id = $1
            AND id = $2
            AND vacancy_id = $3
            AND vacancy_version = $4
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          FOR UPDATE`,
        [
          scope.organizationId,
          scope.applicationId,
          scope.vacancyId,
          scope.vacancyVersion,
        ],
      );
      if (locked.rowCount !== 1) {
        throw new ReferenceCheckError(
          "INVALID_SCOPE",
          "The frozen application cannot receive reference invitations.",
        );
      }
      for (const { record } of records) {
        assertInvitationMatchesApplication(
          record,
          locked.rows[0]?.state ?? null,
        );
      }
      const prior = await client.query(
        `SELECT *
           FROM reference_check_invitations
          WHERE organization_id = $1
            AND application_id = $2
            AND block_id = $3
            AND status IN ('pending', 'responded')
          ORDER BY created_at DESC, id DESC
          FOR UPDATE`,
        [scope.organizationId, scope.applicationId, block.id],
      );
      const existing = prior.rows.map((row) =>
        rowToInvitation(row as Record<string, unknown>),
      );
      const nextDeliveries: IssuedReferenceInvitation[] = [];
      let createdCount = 0;
      let recoveredCount = 0;
      for (const prepared of records) {
        const responded = existing.find(
          (candidate) =>
            candidate.refereeOrdinal ===
              prepared.record.refereeOrdinal &&
            candidate.status === "responded",
        );
        if (responded) {
          if (
            responded.relationship !==
              prepared.record.relationship ||
            !constantTimeEqual(
              responded.contactHash,
              prepared.record.contactHash,
            ) ||
            !constantTimeEqual(
              responded.questionnaireHash,
              prepared.record.questionnaireHash,
            )
          ) {
            throw new ReferenceCheckError(
              "INVALID_SCOPE",
              "A completed referee position does not match the frozen contact binding.",
            );
          }
          continue;
        }
        const pending = existing.find(
          (candidate) =>
            candidate.refereeOrdinal ===
              prepared.record.refereeOrdinal &&
            candidate.status === "pending",
        );
        if (pending) {
          const regenerated = invitationToken(pending.id);
          const reusable =
            Date.parse(pending.expiresAt) > now.getTime() &&
            pending.relationship ===
              prepared.record.relationship &&
            constantTimeEqual(
              pending.contactHash,
              prepared.record.contactHash,
            ) &&
            constantTimeEqual(
              pending.questionnaireHash,
              prepared.record.questionnaireHash,
            ) &&
            constantTimeEqual(
              pending.tokenHash,
              regenerated.tokenHash,
            );
          if (reusable) {
            nextDeliveries.push({
              invitationId: pending.id,
              refereeOrdinal: pending.refereeOrdinal,
              relationship: pending.relationship,
              expiresAt: pending.expiresAt,
              deliveryUrl: `${origin}/reference/${encodeURIComponent(regenerated.token)}`,
            });
            recoveredCount += 1;
            continue;
          }
          await client.query(
            `UPDATE reference_check_invitations
                SET status = 'revoked'
              WHERE id = $1
                AND status = 'pending'`,
            [pending.id],
          );
        }
        await insertInvitation(client, prepared.record);
        nextDeliveries.push(prepared.delivery);
        createdCount += 1;
      }
      delivered = nextDeliveries;
      await appendAuditEvent(client, {
        organizationId: scope.organizationId,
        actor: {
          type: "candidate",
          id: scope.internalCandidateId,
        },
        action: "REFERENCE_INVITATIONS_ISSUED",
        targetType: "application",
        targetId: scope.applicationId,
        requestId,
        payload: {
          vacancyId: scope.vacancyId,
          vacancyVersion: scope.vacancyVersion,
          blockId: block.id,
          invitationCount: nextDeliveries.length,
          createdCount,
          recoveredCount,
          expiresAt,
        },
      });
    });
  } else {
    for (const { record } of records) {
      await assertInvitationApplicationBinding(record);
    }
    delivered = await mutateDevStore((store) => {
      const existing = Object.values(store.invitations)
        .filter(
          (invitation) =>
            invitation.organizationId === scope.organizationId &&
            invitation.applicationId === scope.applicationId &&
            invitation.blockId === block.id &&
            (invitation.status === "pending" ||
              invitation.status === "responded"),
        )
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        );
      const nextDeliveries: IssuedReferenceInvitation[] = [];
      for (const prepared of records) {
        const responded = existing.find(
          (candidate) =>
            candidate.refereeOrdinal ===
              prepared.record.refereeOrdinal &&
            candidate.status === "responded",
        );
        if (responded) {
          if (
            responded.relationship !==
              prepared.record.relationship ||
            !constantTimeEqual(
              responded.contactHash,
              prepared.record.contactHash,
            ) ||
            !constantTimeEqual(
              responded.questionnaireHash,
              prepared.record.questionnaireHash,
            )
          ) {
            throw new ReferenceCheckError(
              "INVALID_SCOPE",
              "A completed referee position does not match the frozen contact binding.",
            );
          }
          continue;
        }
        const pending = existing.find(
          (candidate) =>
            candidate.refereeOrdinal ===
              prepared.record.refereeOrdinal &&
            candidate.status === "pending",
        );
        if (pending) {
          const regenerated = invitationToken(pending.id);
          const reusable =
            Date.parse(pending.expiresAt) > now.getTime() &&
            pending.relationship ===
              prepared.record.relationship &&
            constantTimeEqual(
              pending.contactHash,
              prepared.record.contactHash,
            ) &&
            constantTimeEqual(
              pending.questionnaireHash,
              prepared.record.questionnaireHash,
            ) &&
            constantTimeEqual(
              pending.tokenHash,
              regenerated.tokenHash,
            );
          if (reusable) {
            nextDeliveries.push({
              invitationId: pending.id,
              refereeOrdinal: pending.refereeOrdinal,
              relationship: pending.relationship,
              expiresAt: pending.expiresAt,
              deliveryUrl: `${origin}/reference/${encodeURIComponent(regenerated.token)}`,
            });
            continue;
          }
          pending.status = "revoked";
        }
        store.invitations[prepared.record.id] =
          prepared.record;
        nextDeliveries.push(prepared.delivery);
      }
      store.audit.push({
        at: now.toISOString(),
        action: "REFERENCE_INVITATIONS_ISSUED",
        targetId: scope.applicationId,
        applicationId: scope.applicationId,
        organizationId: scope.organizationId,
      });
      return nextDeliveries;
    });
  }
  return delivered;
}

async function invitationById(
  invitationId: string,
  client?: PoolClient,
): Promise<ReferenceInvitationRecord | null> {
  if (databaseConfigured()) {
    const statement = `SELECT *
                         FROM reference_check_invitations
                        WHERE id = $1
                        LIMIT 1`;
    const values = [invitationId];
    const result = client
      ? await client.query(statement, values)
      : await query(statement, values);
    return result.rows[0]
      ? rowToInvitation(result.rows[0] as Record<string, unknown>)
      : null;
  }
  const store = await readDevStore();
  return store.invitations[invitationId] ?? null;
}

export async function getPublicReferenceQuestionnaire(
  token: string,
  now = new Date(),
): Promise<PublicReferenceQuestionnaire> {
  const parsed = parseToken(token);
  if (!parsed) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is invalid.",
    );
  }
  const invitation = await invitationById(parsed.invitationId);
  if (!invitation) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is invalid.",
    );
  }
  verifyToken(invitation, parsed);
  assertInvitationActive(invitation, now);
  await assertInvitationApplicationBinding(invitation);
  return {
    invitationId: invitation.id,
    roleTitle: invitation.roleTitle,
    relationship: invitation.relationship,
    expiresAt: invitation.expiresAt,
    questions: invitation.questionnaire,
  };
}

function normalizeAnswers(
  questionnaire: ReferenceQuestionSnapshot[],
  input: unknown,
): ReferenceResponseAnswer[] {
  if (!Array.isArray(input) || input.length !== questionnaire.length) {
    throw new ReferenceCheckError(
      "INVALID_RESPONSE",
      "Every frozen reference question requires one response.",
    );
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const candidate of input) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "A reference answer is malformed.",
      );
    }
    const answer = candidate as Record<string, unknown>;
    if (
      typeof answer.questionId !== "string" ||
      byId.has(answer.questionId)
    ) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "Reference answer identifiers must be unique.",
      );
    }
    byId.set(answer.questionId, answer);
  }
  return questionnaire.map((question) => {
    const answer = byId.get(question.id);
    if (!answer) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "A frozen reference question is unanswered.",
      );
    }
    const allowed = new Set([
      "questionId",
      "unableToObserve",
      question.type === "rating" ? "rating" : "text",
    ]);
    if (Object.keys(answer).some((key) => !allowed.has(key))) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "A reference answer contains unsupported fields.",
      );
    }
    const unableToObserve = answer.unableToObserve === true;
    if (
      answer.unableToObserve !== true &&
      answer.unableToObserve !== false
    ) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "Each response must state whether the behavior was observable.",
      );
    }
    if (question.type === "rating") {
      const rating = unableToObserve ? null : answer.rating;
      if (
        !unableToObserve &&
        (!Number.isInteger(rating) ||
          Number(rating) < 1 ||
          Number(rating) > 5)
      ) {
        throw new ReferenceCheckError(
          "INVALID_RESPONSE",
          "Observable rating questions require a value from 1 to 5.",
        );
      }
      return {
        questionId: question.id,
        type: "rating" as const,
        unableToObserve,
        rating: rating as 1 | 2 | 3 | 4 | 5 | null,
        text: null,
      };
    }
    const text =
      typeof answer.text === "string" ? answer.text.trim() : "";
    if (
      !unableToObserve &&
      (text.length < 20 || text.length > 4_000)
    ) {
      throw new ReferenceCheckError(
        "INVALID_RESPONSE",
        "Observable open responses must contain 20 to 4000 characters.",
      );
    }
    return {
      questionId: question.id,
      type: "open" as const,
      unableToObserve,
      rating: null,
      text: unableToObserve ? null : text,
    };
  });
}

function requestFingerprint(
  invitation: ReferenceInvitationRecord,
  metadata: { clientAddress?: string; userAgent?: string },
): string | null {
  if (!invitation.fraudControls) return null;
  const address = metadata.clientAddress?.trim().slice(0, 200) ?? "";
  const userAgent = metadata.userAgent?.trim().slice(0, 1_000) ?? "";
  if (!address && !userAgent) return null;
  return hmacSha256(
    JSON.stringify({
      schema: "reference-request-fingerprint-v1",
      address,
      userAgent,
    }),
    referenceSecret(),
  );
}

function evidencePointer(
  response: ReferenceResponseRecord,
): ReferenceEvidencePointer {
  return {
    organizationId: response.organizationId,
    applicationId: response.applicationId,
    vacancyId: response.vacancyId,
    vacancyVersion: response.vacancyVersion,
    blockId: response.blockId,
    receiptId: response.id,
    invitationId: response.invitationId,
    refereeOrdinal: response.refereeOrdinal,
    questionnaireHash: response.questionnaireHash,
    responseHash: response.responseHash,
    respondedAt: response.receivedAt,
    sourceItemIds: response.answers.map((answer) => answer.questionId),
  };
}

export async function submitReferenceResponse(input: {
  token: string;
  consent: boolean;
  relationshipConfirmed: boolean;
  answers: unknown;
  clientAddress?: string;
  userAgent?: string;
  requestId?: string;
  now?: Date;
}): Promise<ReferenceEvidencePointer> {
  if (!input.consent || !input.relationshipConfirmed) {
    throw new ReferenceCheckError(
      "INVALID_RESPONSE",
      "Consent and relationship confirmation are required.",
    );
  }
  const parsed = parseToken(input.token);
  if (!parsed) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is invalid.",
    );
  }
  const now = input.now ?? new Date();
  const preflight = await invitationById(parsed.invitationId);
  if (!preflight) {
    throw new ReferenceCheckError(
      "INVALID_TOKEN",
      "This reference invitation is invalid.",
    );
  }
  verifyToken(preflight, parsed);
  assertInvitationActive(preflight, now);
  await assertInvitationApplicationBinding(preflight);

  const createResponse = (
    invitation: ReferenceInvitationRecord,
  ): ReferenceResponseRecord => {
    verifyToken(invitation, parsed);
    assertInvitationActive(invitation, now);
    const answers = normalizeAnswers(
      invitation.questionnaire,
      input.answers,
    );
    const id = randomUUID();
    const consentAt = now.toISOString();
    const receivedAt = consentAt;
    const hashInput = {
      id,
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      applicationId: invitation.applicationId,
      vacancyId: invitation.vacancyId,
      vacancyVersion: invitation.vacancyVersion,
      blockId: invitation.blockId,
      refereeOrdinal: invitation.refereeOrdinal,
      relationship: invitation.relationship,
      questionnaireHash: invitation.questionnaireHash,
      answers,
      consentAt,
      receivedAt,
    };
    const responseHash = responseHashFor(hashInput);
    return {
      schemaVersion: REFERENCE_RESPONSE_SCHEMA_VERSION,
      id,
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      applicationId: invitation.applicationId,
      vacancyId: invitation.vacancyId,
      vacancyVersion: invitation.vacancyVersion,
      blockId: invitation.blockId,
      refereeOrdinal: invitation.refereeOrdinal,
      relationship: invitation.relationship,
      questionnaireHash: invitation.questionnaireHash,
      responseHash,
      answers,
      consentAt,
      receivedAt,
      requestFingerprintHash: requestFingerprint(invitation, {
        clientAddress: input.clientAddress,
        userAgent: input.userAgent,
      }),
    };
  };

  if (databaseConfigured()) {
    return transaction(async (client) => {
      const selected = await client.query(
        `SELECT *
           FROM reference_check_invitations
          WHERE id = $1
          FOR UPDATE`,
        [parsed.invitationId],
      );
      if (!selected.rows[0]) {
        throw new ReferenceCheckError(
          "INVALID_TOKEN",
          "This reference invitation is invalid.",
        );
      }
      const invitation = rowToInvitation(
        selected.rows[0] as Record<string, unknown>,
      );
      const response = createResponse(invitation);
      const activeApplication = await client.query(
        `SELECT 1
           FROM applications
          WHERE id = $1
            AND organization_id = $2
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()`,
        [invitation.applicationId, invitation.organizationId],
      );
      if (activeApplication.rowCount !== 1) {
        throw new ReferenceCheckError(
          "TOKEN_EXPIRED",
          "This reference invitation is no longer within the application retention window.",
        );
      }
      await client.query(
        `INSERT INTO reference_check_responses
           (id, invitation_id, organization_id, application_id, vacancy_id,
            vacancy_version, block_id, referee_ordinal, relationship,
            questionnaire_hash, response_hash, answers, consent_at, received_at,
            request_fingerprint_hash)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
            $13, $14, $15)`,
        [
          response.id,
          response.invitationId,
          response.organizationId,
          response.applicationId,
          response.vacancyId,
          response.vacancyVersion,
          response.blockId,
          response.refereeOrdinal,
          response.relationship,
          response.questionnaireHash,
          response.responseHash,
          JSON.stringify(response.answers),
          response.consentAt,
          response.receivedAt,
          response.requestFingerprintHash,
        ],
      );
      const updated = await client.query(
        `UPDATE reference_check_invitations
            SET status = 'responded',
                response_id = $2,
                responded_at = $3
          WHERE id = $1
            AND status = 'pending'`,
        [invitation.id, response.id, response.receivedAt],
      );
      if (updated.rowCount !== 1) {
        throw new ReferenceCheckError(
          "TOKEN_USED",
          "This reference invitation has already been completed.",
        );
      }
      await appendAuditEvent(client, {
        organizationId: response.organizationId,
        actor: {
          type: "system",
          id: `reference-participant:${invitation.id}`,
        },
        action: "REFERENCE_RESPONSE_RECEIVED",
        targetType: "application",
        targetId: response.applicationId,
        requestId: input.requestId,
        payload: {
          vacancyId: response.vacancyId,
          vacancyVersion: response.vacancyVersion,
          blockId: response.blockId,
          receiptId: response.id,
          questionnaireHash: response.questionnaireHash,
          responseHash: response.responseHash,
          sourceItemIds: response.answers.map(
            (answer) => answer.questionId,
          ),
        },
      });
      return evidencePointer(response);
    });
  }

  return mutateDevStore((store) => {
    const invitation = store.invitations[parsed.invitationId];
    if (!invitation) {
      throw new ReferenceCheckError(
        "INVALID_TOKEN",
        "This reference invitation is invalid.",
      );
    }
    const response = createResponse(invitation);
    store.responses[response.id] = response;
    invitation.status = "responded";
    invitation.responseId = response.id;
    invitation.respondedAt = response.receivedAt;
    store.audit.push({
      at: response.receivedAt,
      action: "REFERENCE_RESPONSE_RECEIVED",
      targetId: response.id,
      applicationId: response.applicationId,
      organizationId: response.organizationId,
    });
    return evidencePointer(response);
  });
}

export async function resolveConsumedReferenceResponse(
  token: string,
): Promise<ReferenceEvidencePointer | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const invitation = await invitationById(parsed.invitationId);
  if (!invitation) return null;
  verifyToken(invitation, parsed);
  if (
    invitation.status !== "responded" ||
    !invitation.responseId
  ) {
    return null;
  }
  await assertInvitationApplicationBinding(invitation);
  let response: ReferenceResponseRecord | null = null;
  if (databaseConfigured()) {
    const result = await query(
      `SELECT *
         FROM reference_check_responses
        WHERE id = $1
          AND invitation_id = $2
        LIMIT 1`,
      [invitation.responseId, invitation.id],
    );
    response = result.rows[0]
      ? rowToResponse(result.rows[0] as Record<string, unknown>)
      : null;
  } else {
    const store = await readDevStore();
    response = store.responses[invitation.responseId] ?? null;
  }
  return response &&
    constantTimeEqual(
      response.responseHash,
      responseHashFor(response),
    )
    ? evidencePointer(response)
    : null;
}

export async function getHrReferenceResponse(
  receiptId: string,
  organizationId: string,
): Promise<HrReferenceResponseView | null> {
  let response: ReferenceResponseRecord | null = null;
  let invitation: ReferenceInvitationRecord | null = null;
  if (databaseConfigured()) {
    const result = await query(
      `SELECT r.*,
              i.questionnaire AS frozen_questionnaire
         FROM reference_check_responses r
         JOIN reference_check_invitations i
           ON i.id = r.invitation_id
        WHERE r.id = $1
          AND r.organization_id = $2
        LIMIT 1`,
      [receiptId, organizationId],
    );
    if (!result.rows[0]) return null;
    response = rowToResponse(
      result.rows[0] as Record<string, unknown>,
    );
    invitation = {
      ...(await invitationById(response.invitationId)),
      questionnaire: result.rows[0]
        .frozen_questionnaire as ReferenceQuestionSnapshot[],
    } as ReferenceInvitationRecord;
  } else {
    const store = await readDevStore();
    const candidate = store.responses[receiptId];
    if (!candidate || candidate.organizationId !== organizationId) {
      return null;
    }
    response = candidate;
    invitation = store.invitations[candidate.invitationId] ?? null;
  }
  if (
    !response ||
    !invitation ||
    response.organizationId !== organizationId ||
    response.questionnaireHash !== invitation.questionnaireHash ||
    !constantTimeEqual(
      response.responseHash,
      responseHashFor(response),
    )
  ) {
    return null;
  }
  return {
    receiptId: response.id,
    applicationId: response.applicationId,
    vacancyId: response.vacancyId,
    vacancyVersion: response.vacancyVersion,
    blockId: response.blockId,
    relationship: response.relationship,
    refereeOrdinal: response.refereeOrdinal,
    questionnaireHash: response.questionnaireHash,
    responseHash: response.responseHash,
    consentAt: response.consentAt,
    receivedAt: response.receivedAt,
    questions: invitation.questionnaire,
    answers: response.answers,
  };
}

/**
 * Resolves one exact frozen questionnaire item for an authenticated tenant.
 * The caller may additionally compare application/block/version to its review
 * target; no contact hash, network fingerprint, consent metadata, or other
 * questionnaire answers are returned.
 */
export async function getHrReferenceResponseEvidence(input: {
  receiptId: string;
  sourceItemId: string;
  organizationId: string;
}): Promise<HrReferenceResponseEvidence | null> {
  const response = await getHrReferenceResponse(
    input.receiptId,
    input.organizationId,
  );
  if (!response) return null;
  const question = response.questions.find(
    (candidate) => candidate.id === input.sourceItemId,
  );
  const answer = response.answers.find(
    (candidate) => candidate.questionId === input.sourceItemId,
  );
  if (
    !question ||
    !answer ||
    question.type !== answer.type
  ) {
    return null;
  }
  return {
    receiptId: response.receiptId,
    applicationId: response.applicationId,
    vacancyId: response.vacancyId,
    vacancyVersion: response.vacancyVersion,
    blockId: response.blockId,
    relationship: response.relationship,
    refereeOrdinal: response.refereeOrdinal,
    questionnaireHash: response.questionnaireHash,
    responseHash: response.responseHash,
    receivedAt: response.receivedAt,
    question,
    answer,
  };
}
