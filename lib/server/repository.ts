import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import type {
  InterviewTurn,
  ProviderTranscriptStatus,
  TranscriptCorrectionDiff,
  TranscriptReviewStatus,
} from "../ai-contracts";
import {
  competitions,
  employerBrief,
  vacancyV2Demo,
  type Competition,
} from "../fixtures";
import type {
  ApplicationStage,
  AttributeSpec,
  AuthorSource,
  BlockRuntimeResult,
  CandidateEvaluation,
  QuestionType,
  ResponseModality,
  Rubric,
  VacancyV2,
} from "../types";
import { sanitizeIntegritySignals } from "../integrity-signals";
import type { HrSession } from "./auth";
import {
  applicationAiExecutionMode,
  applyPublicationAiPolicy,
  vacancyAiExecutionMode,
  type VacancyAiExecutionMode,
} from "./ai-rollout";
import { appendAuditEvent } from "./audit";
import { databaseConfigured, query, transaction } from "./db";
import {
  assertOpenAIProviderConfigured,
  getServerEnv,
  isDevelopmentDemoMode,
} from "./env";
import {
  assessmentEvidenceAccessBinding,
  hasAssessmentEvidenceAccess,
  type AssessmentEvidenceAccessAttestation,
  type AssessmentEvidenceAccessBinding,
} from "./assessment-evidence-access";
import {
  hasFreshRecordingPlaybackAccess,
  recordingPlaybackBinding,
  RecordingPlaybackAccessRequiredError,
  RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS,
  transcriptSourceReceiptSha256,
  type RecordingPlaybackAttestation,
  type RecordingPlaybackBinding,
} from "./recording-playback-access";
import { randomToken, sha256 } from "./crypto";
import { createDemoVacancyDraft } from "./legacy-demo-ai";
import { selectInterviewBlock } from "./interview-protocol";
import {
  findStoredRecordingById,
  type StoredRecording,
} from "./media";
import {
  compileCandidateAssessmentPlan,
  type CandidateAssessmentPlan,
} from "./assessment-runtime";
import { specializeCandidatePlanForApplication } from "./assessment-controls";
import {
  applyEvaluationReceiptToRuntime,
  applyGateAdjudicationToRuntime,
  applyHumanDecisionToAssessmentRuntime,
  applyAssessmentReviewToRuntime,
  addHumanStageObservation,
  initializeAssessmentRuntime,
  unlockDeferredAssessmentBlock,
  type AssessmentBlockRun,
  type AssessmentRuntimeState,
} from "./assessment-orchestrator";
import {
  assessmentReviewBindingHash,
  assessmentReviewBindingMatchesScope,
  activeAssessmentReviews,
  assessmentReviewInputHash,
  resolveAssessmentReview,
  resolveAssessmentReviewWrite,
  reviewMatchesBinding,
  ASSESSMENT_REVIEW_SCHEMA_VERSION,
  type AssessmentGateWaiverOutcome,
  type AssessmentReviewBinding,
  type AssessmentReviewEvidence,
  type AssessmentReviewRecord,
  type AssessmentVerificationOutcome,
} from "./assessment-review";
import {
  buildAssessmentReviewTargets,
  buildGateWaiverReviewTargets,
  resolveAssessmentReviewEvidenceReceipt,
} from "./application-evaluation";
import { humanVerifyTranscript } from "./transcript-provenance";
import { assertHumanDecisionEvaluationPolicy } from "./human-decision-policy";
import {
  nextVacancyConfigVersion,
  vacancyVersionStorageKey,
} from "./vacancy-version";
import type { ReferenceEvidencePointer } from "./reference-checks";
import { assertReviewerAuthorized } from "./reviewer-authorization";
import {
  CompetitionAdmissionError,
  admissionPolicyFromVacancy,
  assertCompetitionAdmission,
  type CompetitionAdmissionPolicy,
} from "./competition-admission";

export interface PublicCompetition {
  source: "database" | "demo";
  organizationId: string;
  vacancyId: string;
  version: number;
  title: string;
  code: string;
  competencies: { name: string; weight: number }[];
  questions: ServerInterviewQuestion[];
  interviewBlockId?: string;
  followUpPolicy: 0 | 1 | 2;
  aiExecutionMode: VacancyAiExecutionMode;
  independentReviews: 1 | 2 | 3;
  entry: "assessment" | "interview" | "status";
  noticeVersion: number;
  retentionDays: number;
  admission: CompetitionAdmissionPolicy;
  vacancy?: VacancyV2;
  assessmentPlan?: CandidateAssessmentPlan;
}

export interface StoredCandidateApplication {
  storage: "database" | "demo";
  id: string;
  organizationId: string;
  vacancyId: string;
  vacancyVersion: number;
  code: string;
  title: string;
  competencies: { name: string; weight: number }[];
  questions: ServerInterviewQuestion[];
  interviewBlockId?: string;
  followUpPolicy: 0 | 1 | 2;
  aiExecutionMode?: VacancyAiExecutionMode;
  requiredIndependentReviews: 1 | 2 | 3;
  internalCandidateId: string;
  sessionTokenHash: string;
  stage: ApplicationStage;
  noticeVersion: number;
  retentionDays: number;
  consentAt: string | null;
  interviewMode: "video" | "text_accommodation" | null;
  history: InterviewTurn[];
  progress: number;
  /**
   * Frozen candidate-safe execution plan. Applications created before the
   * multi-block runtime remain readable through the legacy interview fields.
   */
  assessmentPlan?: CandidateAssessmentPlan;
  blockRuns?: AssessmentBlockRun[];
  blockResults?: BlockRuntimeResult[];
  currentBlockIndex?: number;
  evaluation?: CandidateEvaluation;
  assessmentReviews?: AssessmentReviewRecord[];
  humanDecisions?: HumanDecisionRecord[];
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
}

function sanitizeCandidateEvaluationIntegrity(
  evaluation: CandidateEvaluation | undefined,
): CandidateEvaluation | undefined {
  if (!evaluation) return undefined;
  return {
    ...evaluation,
    perBlock: evaluation.perBlock.map((block) => ({
      ...block,
      integrity: sanitizeIntegritySignals(block.integrity),
    })),
  };
}

function sanitizeStoredApplicationIntegrity(
  application: StoredCandidateApplication,
): StoredCandidateApplication {
  return {
    ...application,
    history: application.history.map((turn) => ({
      ...turn,
      ...(turn.integrity === undefined
        ? {}
        : { integrity: sanitizeIntegritySignals(turn.integrity) }),
    })),
    ...(application.blockResults
      ? {
          blockResults: application.blockResults.map((result) => ({
            ...result,
            integrityEvents: sanitizeIntegritySignals(
              result.integrityEvents,
            ),
          })),
        }
      : {}),
    ...(application.evaluation
      ? {
          evaluation: sanitizeCandidateEvaluationIntegrity(
            application.evaluation,
          ),
        }
      : {}),
  };
}

export type HumanDecisionKind =
  | "advance"
  | "hold"
  | "reject"
  | "request_rescore";

export interface HumanDecisionRecord {
  id: string;
  decision: HumanDecisionKind;
  reason: string;
  actorUserId: string;
  actorEmail: string;
  resultingStage: ApplicationStage;
  createdAt: string;
}

export interface AssessmentReviewSubmission {
  binding: AssessmentReviewBinding;
  idempotencyKey: string;
  expectedLockVersion: number;
  level: 1 | 2 | 3 | 4 | 5 | null;
  verificationOutcome: AssessmentVerificationOutcome | null;
  gateWaiverOutcome: AssessmentGateWaiverOutcome | null;
  evidence: Pick<AssessmentReviewEvidence, "summary" | "locator">;
  rationale: string;
  supersedesReviewId: string | null;
}

export interface RecordedAssessmentReview {
  application: StoredCandidateApplication;
  review: AssessmentReviewRecord;
  created: boolean;
}

export interface TenantApplicationSummary {
  id: string;
  vacancyId: string;
  vacancyVersion: number;
  internalCandidateId: string;
  stage: ApplicationStage;
  evaluation?: CandidateEvaluation;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface DevAudit {
  at: string;
  actor: string;
  action: string;
  target: string;
  previousHash: string;
  hash: string;
  evidenceAccess?: AssessmentEvidenceAccessAttestation;
  recordingPlayback?: RecordingPlaybackAttestation;
}

export interface ServerInterviewCriterion {
  category: {
    id: string;
    name: string;
    weight: number;
    rationale?: string;
  };
  attribute: AttributeSpec;
}

export interface ServerInterviewQuestion {
  id: string;
  text: string;
  attributeId: string;
  secondaryAttributeId?: string;
  type: QuestionType;
  thinkTimeSec: 0 | 30 | 60 | 120 | null;
  answerCapSec: number;
  modality: ResponseModality;
  reRecordAttempts: 0 | 1 | 2 | 3;
  notesAllowed: boolean;
  probes: string[];
  clarification?: string;
  situationalFallback?: string;
  rubric?: Rubric;
  source?: AuthorSource;
  rationale?: string;
  /**
   * Immutable criterion context copied from the published vacancy version.
   * Optional because applications created before this snapshot existed must
   * remain readable.
   */
  criterion?: ServerInterviewCriterion;
  secondaryCriterion?: ServerInterviewCriterion;
}

interface DevData {
  vacancies: Record<string, { organizationId: string; vacancy: VacancyV2 }>;
  vacancyVersions?: Record<
    string,
    { organizationId: string; vacancy: VacancyV2 }
  >;
  applications: Record<string, StoredCandidateApplication>;
  audit: DevAudit[];
}

const DEV_STORE_PATH = path.join(process.cwd(), ".data", "whitebox.dev.json");
let devWriteQueue: Promise<void> = Promise.resolve();

function assertDevelopmentDemoStore(): void {
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "The local fixture store is available only in explicit development demo mode.",
    );
  }
}

function emptyDevData(): DevData {
  return {
    vacancies: {},
    vacancyVersions: {},
    applications: {},
    audit: [],
  };
}

function devVacancyVersionKey(
  organizationId: string,
  vacancy: Pick<VacancyV2, "id" | "configVersion">,
) {
  return vacancyVersionStorageKey(
    organizationId,
    vacancy.id,
    vacancy.configVersion,
  );
}

function latestDevVacancyVersion(
  data: DevData,
  organizationId: string,
  vacancyId: string,
  current: VacancyV2 | null,
): number | undefined {
  let latest: number | undefined;
  const candidates = [
    ...(current ? [current.configVersion] : []),
    ...Object.values(data.vacancyVersions ?? {})
      .filter(
        (record) =>
          record.organizationId === organizationId &&
          record.vacancy.id === vacancyId,
      )
      .map((record) => record.vacancy.configVersion),
  ];
  for (const version of candidates) {
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("A stored vacancy version is invalid.");
    }
    latest = latest === undefined ? version : Math.max(latest, version);
  }
  return latest;
}

async function readDevData(): Promise<DevData> {
  assertDevelopmentDemoStore();
  try {
    return JSON.parse(await readFile(DEV_STORE_PATH, "utf8")) as DevData;
  } catch {
    return emptyDevData();
  }
}

async function writeDevDataSnapshot(data: DevData): Promise<void> {
  assertDevelopmentDemoStore();
  const directory = path.dirname(DEV_STORE_PATH);
  await mkdir(directory, { recursive: true });
  const temporary = `${DEV_STORE_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, DEV_STORE_PATH);
}

function enqueueDevDataOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = devWriteQueue.then(operation, operation);
  devWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function writeDevData(data: DevData): Promise<void> {
  await enqueueDevDataOperation(() => writeDevDataSnapshot(data));
}

async function mutateDevData<T>(
  mutation: (data: DevData) => Promise<T> | T,
): Promise<T> {
  return enqueueDevDataOperation(async () => {
    const data = await readDevData();
    const result = await mutation(data);
    await writeDevDataSnapshot(data);
    return result;
  });
}

function competencyList(vacancy: VacancyV2): { name: string; weight: number }[] {
  return vacancy.categories.flatMap((category) =>
    category.attributes.map((attribute) => ({
      name: attribute.name,
      weight: Math.max(1, Math.round((category.weight * attribute.weight) / 100)),
    })),
  );
}

function frozenCriterion(
  vacancy: VacancyV2,
  attributeId: string | undefined,
): ServerInterviewCriterion | undefined {
  if (!attributeId) return undefined;
  for (const category of vacancy.categories) {
    const attribute = category.attributes.find(
      (candidate) => candidate.id === attributeId,
    );
    if (!attribute) continue;
    return {
      category: {
        id: category.id,
        name: category.name,
        weight: category.weight,
        rationale: category.rationale,
      },
      attribute: structuredClone(attribute),
    };
  }
  return undefined;
}

export function frozenInterviewQuestions(
  vacancy: VacancyV2,
  blockId?: string,
): ServerInterviewQuestion[] {
  const block = blockId
    ? vacancy.pipeline.find((candidate) => candidate.id === blockId)
    : selectInterviewBlock(vacancy.pipeline);
  if (
    block?.settings.kind === "async_interview" ||
    block?.settings.kind === "live_ai_interview" ||
    block?.settings.kind === "chat_interview"
  ) {
    return block.settings.questions.map((question) => ({
      id: question.id,
      text: question.text,
      attributeId: question.attributeId,
      secondaryAttributeId: question.secondaryAttributeId,
      type: question.type,
      thinkTimeSec: question.thinkTimeSec,
      answerCapSec: question.answerCapSec,
      modality: question.modality,
      reRecordAttempts: question.reRecordAttempts,
      notesAllowed: question.notesAllowed,
      probes: [...question.probes],
      clarification: question.clarification,
      situationalFallback: question.situationalFallback,
      rubric: structuredClone(question.rubric),
      source: question.source,
      rationale: question.rationale,
      criterion: frozenCriterion(vacancy, question.attributeId),
      secondaryCriterion: frozenCriterion(
        vacancy,
        question.secondaryAttributeId,
      ),
    }));
  }
  return [];
}

export function frozenInterviewFollowUpPolicy(
  vacancy: VacancyV2,
  blockId?: string,
): 0 | 1 | 2 {
  const block = blockId
    ? vacancy.pipeline.find((candidate) => candidate.id === blockId)
    : selectInterviewBlock(vacancy.pipeline);
  if (
    block?.settings.kind === "async_interview" ||
    block?.settings.kind === "chat_interview"
  ) {
    return block.settings.followUpPolicy;
  }
  if (block?.settings.kind === "live_ai_interview") {
    return block.settings.adaptivity === "probe_reorder" ? 2 : 1;
  }
  return 0;
}

function independentReviewCount(vacancy: VacancyV2): 1 | 2 | 3 {
  return vacancy.governance.reviewPolicy.independentReviews;
}

function competitionIndependentReviewCount(
  vacancy: VacancyV2,
  code: string,
): 1 | 2 | 3 {
  // The built-in development workspace has one demo reviewer. Do not claim a
  // second independent approval that the demo tenant cannot actually provide.
  return isDevelopmentDemoMode() && competitions[code] ? 1 : independentReviewCount(vacancy);
}

function frozenCandidatePlan(vacancy: VacancyV2): CandidateAssessmentPlan {
  return structuredClone(
    compileCandidateAssessmentPlan(vacancy),
  ) as CandidateAssessmentPlan;
}

function mintCompetitionCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) suffix += alphabet[bytes[i] % alphabet.length];
  return `WBX-${suffix}`;
}

function launchableFixtureVacancy(fixture: Competition): VacancyV2 {
  const source =
    fixture.code === vacancyV2Demo.code
      ? structuredClone(vacancyV2Demo)
      : createDemoVacancyDraft(fixture.title, employerBrief);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  return {
    ...source,
    id: fixture.vacancyId,
    code: fixture.code,
    status: "LIVE",
    configVersion: 1,
    profile: { ...source.profile, title: fixture.title },
    experience: {
      ...source.experience,
      notices: {
        ...source.experience.notices,
        version: 1,
        retentionDays: 180,
      },
    },
    window: {
      opensAt: new Date(nowDate.getTime() - 86_400_000).toISOString(),
      closesAt: new Date(nowDate.getTime() + 14 * 86_400_000).toISOString(),
      timezone: "UTC",
    },
    audit: [],
    createdAt: source.createdAt || now,
    publishedAt: source.publishedAt || now,
  };
}

function publishedVacancy(
  draft: VacancyV2,
  code: string,
  configVersion: number,
): VacancyV2 {
  const now = new Date();
  const nowIso = now.toISOString();
  return {
    ...draft,
    id: draft.id === "vac-draft" ? `vac-${randomUUID()}` : draft.id,
    code,
    configVersion,
    status: "LIVE",
    publishedAt: nowIso,
    createdAt: draft.createdAt || nowIso,
    window: {
      ...draft.window,
      opensAt: draft.window.opensAt || nowIso,
      closesAt: draft.window.closesAt || new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    },
  };
}

async function ensureTenantActor(client: PoolClient, session: HrSession): Promise<void> {
  const env = getServerEnv();
  const passwordHash = env.WBX_ADMIN_PASSWORD_HASH;
  if (!passwordHash && !isDevelopmentDemoMode()) {
    throw new Error(
      "WBX_ADMIN_PASSWORD_HASH is required before synchronizing a tenant actor.",
    );
  }
  await client.query(
    `INSERT INTO organizations (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [session.organizationId, session.organizationName],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
    [
      session.sub,
      session.email,
      passwordHash ?? "scrypt$development-only$00",
      session.email.split("@")[0],
    ],
  );
  await client.query(
    `INSERT INTO memberships (organization_id, user_id, role, pii_reveal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, pii_reveal = EXCLUDED.pii_reveal`,
    [session.organizationId, session.sub, session.role, session.piiReveal],
  );
}

export async function savePublishedVacancy(
  draft: VacancyV2,
  session: HrSession,
  requestId?: string,
): Promise<VacancyV2> {
  let code = draft.code || mintCompetitionCode();

  if (!databaseConfigured()) {
    if (!isDevelopmentDemoMode()) throw new Error("Database is required.");
    return mutateDevData((data) => {
      const existingEntry = Object.entries(data.vacancies).find(
        ([, record]) =>
          record.organizationId === session.organizationId &&
          record.vacancy.id === draft.id,
      );
      const existing = existingEntry?.[1].vacancy ?? null;
      code = draft.code || existingEntry?.[0] || existing?.code || code;
      while (true) {
        const occupied = data.vacancies[code];
        if (
          !occupied ||
          (occupied.organizationId === session.organizationId &&
            occupied.vacancy.id === draft.id)
        ) {
          break;
        }
        code = mintCompetitionCode();
      }
      const policyBoundDraft = applyPublicationAiPolicy(draft, existing);
      if (vacancyAiExecutionMode(policyBoundDraft) === "openai_required") {
        assertOpenAIProviderConfigured();
      }
      const configVersion = nextVacancyConfigVersion(
        latestDevVacancyVersion(
          data,
          session.organizationId,
          draft.id,
          existing,
        ),
      );
      const vacancy = publishedVacancy(
        policyBoundDraft,
        code,
        configVersion,
      );
      data.vacancyVersions ??= {};
      if (existing) {
        const existingVersionKey = devVacancyVersionKey(
          session.organizationId,
          existing,
        );
        data.vacancyVersions[existingVersionKey] ??= {
          organizationId: session.organizationId,
          vacancy: structuredClone(existing),
        };
      }
      const nextVersionKey = devVacancyVersionKey(
        session.organizationId,
        vacancy,
      );
      if (data.vacancyVersions[nextVersionKey]) {
        throw new Error(
          `Vacancy version ${vacancy.configVersion} already exists.`,
        );
      }
      data.vacancyVersions[nextVersionKey] = {
        organizationId: session.organizationId,
        vacancy: structuredClone(vacancy),
      };
      if (existingEntry && existingEntry[0] !== code) {
        delete data.vacancies[existingEntry[0]];
      }
      data.vacancies[code] = {
        organizationId: session.organizationId,
        vacancy,
      };
      const previousHash = data.audit.at(-1)?.hash ?? "genesis";
      const at = new Date().toISOString();
      const hash = sha256(
        JSON.stringify({
          previousHash,
          at,
          actor: session.sub,
          action: "VACANCY_PUBLISHED",
          target: vacancy.id,
        }),
      );
      data.audit.push({
        at,
        actor: session.sub,
        action: "VACANCY_PUBLISHED",
        target: vacancy.id,
        previousHash,
        hash,
      });
      return vacancy;
    });
  }

  return transaction(async (client) => {
    await ensureTenantActor(client, session);
    const existingResult = await client.query<{
      config: VacancyV2;
      current_code: string;
      current_version: number;
    }>(
      `SELECT vv.config, v.code AS current_code, v.current_version
         FROM vacancies v
         JOIN vacancy_versions vv
           ON vv.vacancy_id = v.id
          AND vv.version = v.current_version
        WHERE v.id = $1
          AND v.organization_id = $2
        LIMIT 1
        FOR UPDATE OF v`,
      [draft.id, session.organizationId],
    );
    const existing = existingResult.rows[0]?.config ?? null;
    const policyBoundDraft = applyPublicationAiPolicy(
      draft,
      existing,
    );
    if (vacancyAiExecutionMode(policyBoundDraft) === "openai_required") {
      assertOpenAIProviderConfigured();
    }
    code =
      draft.code ||
      existingResult.rows[0]?.current_code ||
      existing?.code ||
      code;
    while (
      (
        await client.query(
          `SELECT 1
             FROM vacancies
            WHERE code = $1
              AND NOT (id = $2 AND organization_id = $3)
            LIMIT 1`,
          [code, draft.id, session.organizationId],
        )
      ).rowCount
    ) {
      code = mintCompetitionCode();
    }
    const vacancy = publishedVacancy(
      policyBoundDraft,
      code,
      nextVacancyConfigVersion(
        existingResult.rows[0]?.current_version,
      ),
    );
    const contentHash = sha256(JSON.stringify(vacancy));

    const upsert = await client.query(
      `INSERT INTO vacancies
         (id, organization_id, code, title, status, current_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE
         SET code = EXCLUDED.code,
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             current_version = EXCLUDED.current_version,
             updated_at = now()
       WHERE vacancies.organization_id = EXCLUDED.organization_id
       RETURNING id`,
      [
        vacancy.id,
        session.organizationId,
        vacancy.code,
        vacancy.profile.title,
        vacancy.status,
        vacancy.configVersion,
        vacancy.createdAt,
      ],
    );
    if (!upsert.rowCount) throw new Error("Vacancy belongs to another organization.");

    await client.query(
      `INSERT INTO vacancy_versions
         (vacancy_id, organization_id, version, config, content_hash, published_at, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        vacancy.id,
        session.organizationId,
        vacancy.configVersion,
        JSON.stringify(vacancy),
        contentHash,
        vacancy.publishedAt,
        session.sub,
      ],
    );

    await appendAuditEvent(client, {
      organizationId: session.organizationId,
      actor: { type: "user", id: session.sub },
      action: "VACANCY_PUBLISHED",
      targetType: "vacancy",
      targetId: vacancy.id,
      requestId,
      payload: { code: vacancy.code, configVersion: vacancy.configVersion, contentHash },
    });

    await client.query(
      `INSERT INTO outbox_events (organization_id, topic, payload, idempotency_key)
       VALUES ($1, 'vacancy.published', $2::jsonb, $3)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        session.organizationId,
        JSON.stringify({ vacancyId: vacancy.id, version: vacancy.configVersion }),
        `vacancy.published:${vacancy.id}:${vacancy.configVersion}`,
      ],
    );
    return vacancy;
  });
}

export async function listTenantVacancies(organizationId: string): Promise<VacancyV2[]> {
  if (!databaseConfigured()) {
    const data = await readDevData();
    return Object.values(data.vacancies)
      .filter((record) => record.organizationId === organizationId)
      .map((record) => record.vacancy);
  }
  const result = await query<{ config: VacancyV2 }>(
    `SELECT vv.config
       FROM vacancies v
       JOIN vacancy_versions vv
         ON vv.vacancy_id = v.id AND vv.version = v.current_version
      WHERE v.organization_id = $1
      ORDER BY v.updated_at DESC`,
    [organizationId],
  );
  return result.rows.map((row) => row.config);
}

export async function resolveCompetition(rawCode: string): Promise<PublicCompetition | null> {
  const code = rawCode.trim().toUpperCase();

  if (databaseConfigured()) {
    const result = await query<{ organization_id: string; config: VacancyV2 }>(
      `SELECT v.organization_id, vv.config
         FROM vacancies v
         JOIN vacancy_versions vv
           ON vv.vacancy_id = v.id AND vv.version = v.current_version
        WHERE v.code = $1 AND v.status = 'LIVE'
        LIMIT 1`,
      [code],
    );
    const row = result.rows[0];
    if (row) {
      const executionMode = vacancyAiExecutionMode(row.config);
      const assessmentPlan =
        executionMode === "openai_required"
          ? frozenCandidatePlan(row.config)
          : undefined;
      return {
        source: "database",
        organizationId: row.organization_id,
        vacancyId: row.config.id,
        version: row.config.configVersion,
        title: row.config.profile.title,
        code: row.config.code,
        competencies: competencyList(row.config),
        questions: frozenInterviewQuestions(row.config),
        interviewBlockId: selectInterviewBlock(row.config.pipeline)?.id,
        followUpPolicy: frozenInterviewFollowUpPolicy(row.config),
        aiExecutionMode: executionMode,
        independentReviews: competitionIndependentReviewCount(
          row.config,
          row.config.code,
        ),
        entry: assessmentPlan ? "assessment" : "interview",
        noticeVersion: row.config.experience.notices.version,
        retentionDays: row.config.experience.notices.retentionDays,
        admission: admissionPolicyFromVacancy(row.config),
        vacancy: structuredClone(row.config),
        ...(assessmentPlan ? { assessmentPlan } : {}),
      };
    }
  } else {
    const data = await readDevData();
    const record = data.vacancies[code];
    if (record?.vacancy.status === "LIVE") {
      const executionMode = vacancyAiExecutionMode(record.vacancy);
      const assessmentPlan =
        executionMode === "openai_required"
          ? frozenCandidatePlan(record.vacancy)
          : undefined;
      return {
        source: "demo",
        organizationId: record.organizationId,
        vacancyId: record.vacancy.id,
        version: record.vacancy.configVersion,
        title: record.vacancy.profile.title,
        code: record.vacancy.code,
        competencies: competencyList(record.vacancy),
        questions: frozenInterviewQuestions(record.vacancy),
        interviewBlockId: selectInterviewBlock(record.vacancy.pipeline)?.id,
        followUpPolicy: frozenInterviewFollowUpPolicy(record.vacancy),
        aiExecutionMode: executionMode,
        independentReviews: competitionIndependentReviewCount(
          record.vacancy,
          record.vacancy.code,
        ),
        entry:
          competitions[code]?.entry === "status"
            ? "status"
            : assessmentPlan
              ? "assessment"
              : "interview",
        noticeVersion: record.vacancy.experience.notices.version,
        retentionDays: record.vacancy.experience.notices.retentionDays,
        admission: admissionPolicyFromVacancy(record.vacancy),
        vacancy: structuredClone(record.vacancy),
        ...(assessmentPlan ? { assessmentPlan } : {}),
      };
    }
  }

  if (!isDevelopmentDemoMode()) return null;
  const fixture = competitions[code];
  if (!fixture) return null;
  const vacancy = launchableFixtureVacancy(fixture);
  return {
    source: "demo",
    organizationId: "org-demo",
    vacancyId: fixture.vacancyId,
    version: 1,
    title: fixture.title,
    code: fixture.code,
    competencies: competencyList(vacancy),
    questions: frozenInterviewQuestions(vacancy),
    interviewBlockId: selectInterviewBlock(vacancy.pipeline)?.id,
    followUpPolicy: frozenInterviewFollowUpPolicy(vacancy),
    aiExecutionMode: vacancyAiExecutionMode(vacancy),
    independentReviews: 1,
    entry: fixture.entry === "status" ? "status" : "interview",
    noticeVersion: 1,
    retentionDays: 180,
    admission: admissionPolicyFromVacancy(vacancy),
    vacancy,
  };
}

function assertCurrentCompetitionSnapshot(
  competition: PublicCompetition,
  organizationId: string,
  vacancy: VacancyV2,
  status: string,
): void {
  if (
    status !== "LIVE" ||
    organizationId !== competition.organizationId ||
    vacancy.id !== competition.vacancyId ||
    vacancy.code !== competition.code
  ) {
    throw new CompetitionAdmissionError(
      "COMPETITION_UNAVAILABLE",
      "This competition is not accepting new applications.",
    );
  }
  if (vacancy.configVersion !== competition.version) {
    throw new CompetitionAdmissionError(
      "COMPETITION_CHANGED",
      "This competition changed while the application was being opened. Reload it and try again.",
    );
  }
}

function devSubmissionCount(
  data: DevData,
  organizationId: string,
  vacancyId: string,
): number {
  return Object.values(data.applications).filter(
    (application) =>
      application.organizationId === organizationId &&
      application.vacancyId === vacancyId,
  ).length;
}

function candidateApplicationFromCompetition(
  competition: PublicCompetition,
  applicationId: string,
  tokenHash: string,
  now: Date,
  storage: StoredCandidateApplication["storage"],
): StoredCandidateApplication {
  const assessmentPlan = competition.assessmentPlan
    ? specializeCandidatePlanForApplication(
        competition.assessmentPlan,
        applicationId,
      )
    : undefined;
  const assessmentRuntime = assessmentPlan
    ? initializeAssessmentRuntime(assessmentPlan, now.toISOString())
    : undefined;
  const currentAssessmentBlock =
    assessmentPlan && assessmentRuntime
      ? assessmentPlan.blocks[assessmentRuntime.currentBlockIndex]
      : undefined;
  const currentInterviewBlockId =
    currentAssessmentBlock &&
    [
      "async_interview",
      "live_ai_interview",
      "chat_interview",
    ].includes(currentAssessmentBlock.kind)
      ? currentAssessmentBlock.id
      : undefined;
  const activeQuestions =
    currentInterviewBlockId && competition.vacancy
      ? frozenInterviewQuestions(
          competition.vacancy,
          currentInterviewBlockId,
        )
      : assessmentPlan
        ? []
        : competition.questions;
  const activeFollowUpPolicy =
    currentInterviewBlockId && competition.vacancy
      ? frozenInterviewFollowUpPolicy(
          competition.vacancy,
          currentInterviewBlockId,
        )
      : competition.followUpPolicy;
  return {
    storage,
    id: applicationId,
    organizationId: competition.organizationId,
    vacancyId: competition.vacancyId,
    vacancyVersion: competition.version,
    code: competition.code,
    title: competition.title,
    competencies: competition.competencies,
    questions: activeQuestions,
    interviewBlockId:
      currentInterviewBlockId ??
      (assessmentPlan ? undefined : competition.interviewBlockId),
    followUpPolicy: activeFollowUpPolicy,
    aiExecutionMode: applicationAiExecutionMode(
      competition.aiExecutionMode,
    ),
    requiredIndependentReviews: competition.independentReviews,
    internalCandidateId: `CND-${randomBytes(3).toString("hex").toUpperCase()}`,
    sessionTokenHash: tokenHash,
    stage:
      competition.entry === "status"
        ? "under_review"
        : assessmentRuntime?.stage ?? "in_progress",
    noticeVersion: competition.noticeVersion,
    retentionDays: competition.retentionDays,
    consentAt: null,
    interviewMode: null,
    history: [],
    progress: assessmentRuntime?.progress ?? 0,
    ...(assessmentPlan
      ? {
          assessmentPlan,
          blockRuns: assessmentRuntime?.blockRuns ?? [],
          blockResults: assessmentRuntime?.blockResults ?? [],
          currentBlockIndex: assessmentRuntime?.currentBlockIndex ?? 0,
        }
      : {}),
    lockVersion: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function createCandidateApplication(
  competition: PublicCompetition,
): Promise<{ application: StoredCandidateApplication; token: string }> {
  const token = randomToken();
  const tokenHash = sha256(token);
  const applicationId = `app-${randomUUID()}`;
  let application: StoredCandidateApplication;

  if (databaseConfigured() && competition.source === "database") {
    application = await transaction(async (client) => {
      const selected = await client.query<{
        organization_id: string;
        status: string;
        current_version: number;
        config: VacancyV2;
      }>(
        `SELECT vacancy.organization_id,
                vacancy.status,
                vacancy.current_version,
                version.config
           FROM vacancies vacancy
           JOIN vacancy_versions version
             ON version.vacancy_id = vacancy.id
            AND version.version = vacancy.current_version
          WHERE vacancy.organization_id = $1
            AND vacancy.id = $2
            AND vacancy.code = $3
          FOR UPDATE OF vacancy`,
        [
          competition.organizationId,
          competition.vacancyId,
          competition.code,
        ],
      );
      const current = selected.rows[0];
      if (!current) {
        throw new CompetitionAdmissionError(
          "COMPETITION_UNAVAILABLE",
          "This competition is not accepting new applications.",
        );
      }
      assertCurrentCompetitionSnapshot(
        competition,
        current.organization_id,
        current.config,
        current.status,
      );
      if (current.current_version !== competition.version) {
        throw new CompetitionAdmissionError(
          "COMPETITION_CHANGED",
          "This competition changed while the application was being opened. Reload it and try again.",
        );
      }
      const clock = await client.query<{ admitted_at: Date }>(
        "SELECT clock_timestamp() AS admitted_at",
      );
      const admittedAt = clock.rows[0]?.admitted_at;
      if (!(admittedAt instanceof Date)) {
        throw new CompetitionAdmissionError(
          "COMPETITION_ADMISSION_UNAVAILABLE",
          "This competition cannot accept applications because its admission state could not be verified.",
        );
      }
      const submissions = await client.query<{ count: string }>(
        `SELECT count(*) AS count
           FROM applications
          WHERE organization_id = $1
            AND vacancy_id = $2`,
        [competition.organizationId, competition.vacancyId],
      );
      assertCompetitionAdmission(
        admissionPolicyFromVacancy(current.config),
        Number(submissions.rows[0]?.count),
        admittedAt,
      );
      const admittedApplication = candidateApplicationFromCompetition(
        competition,
        applicationId,
        tokenHash,
        admittedAt,
        "database",
      );
      await client.query(
        `INSERT INTO applications
           (id, organization_id, vacancy_id, vacancy_version, internal_candidate_id,
            session_token_hash, stage, state, retention_deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          admittedApplication.id,
          admittedApplication.organizationId,
          admittedApplication.vacancyId,
          admittedApplication.vacancyVersion,
          admittedApplication.internalCandidateId,
          admittedApplication.sessionTokenHash,
          admittedApplication.stage,
          JSON.stringify(admittedApplication),
          new Date(
            admittedAt.getTime() +
              admittedApplication.retentionDays * 86_400_000,
          ).toISOString(),
        ],
      );
      await appendAuditEvent(client, {
        organizationId: admittedApplication.organizationId,
        actor: {
          type: "candidate",
          id: admittedApplication.internalCandidateId,
        },
        action: "APPLICATION_CREATED",
        targetType: "application",
        targetId: admittedApplication.id,
        payload: {
          vacancyId: admittedApplication.vacancyId,
          vacancyVersion: admittedApplication.vacancyVersion,
        },
      });
      return admittedApplication;
    });
  } else {
    application = await mutateDevData((data) => {
      const stored = data.vacancies[competition.code];
      const currentVacancy = stored?.vacancy ?? competition.vacancy;
      const organizationId =
        stored?.organizationId ?? competition.organizationId;
      if (!currentVacancy) {
        throw new CompetitionAdmissionError(
          "COMPETITION_UNAVAILABLE",
          "This competition is not accepting new applications.",
        );
      }
      assertCurrentCompetitionSnapshot(
        competition,
        organizationId,
        currentVacancy,
        currentVacancy.status,
      );
      const admittedAt = new Date();
      assertCompetitionAdmission(
        admissionPolicyFromVacancy(currentVacancy),
        devSubmissionCount(
          data,
          competition.organizationId,
          competition.vacancyId,
        ),
        admittedAt,
      );
      const admittedApplication = candidateApplicationFromCompetition(
        competition,
        applicationId,
        tokenHash,
        admittedAt,
        "demo",
      );

      data.vacancies[competition.code] = {
        organizationId: competition.organizationId,
        vacancy: currentVacancy,
      };
      data.vacancyVersions ??= {};
      const versionKey = devVacancyVersionKey(
        competition.organizationId,
        currentVacancy,
      );
      data.vacancyVersions[versionKey] ??= {
        organizationId: competition.organizationId,
        vacancy: structuredClone(currentVacancy),
      };
      data.applications[admittedApplication.id] = admittedApplication;
      return admittedApplication;
    });
  }
  return { application, token };
}

async function readApplicationById(id: string): Promise<StoredCandidateApplication | null> {
  if (databaseConfigured()) {
    const result = await query<{ state: StoredCandidateApplication }>(
      `SELECT state
         FROM applications
        WHERE id = $1
          AND retention_status = 'active'
          AND retention_deadline > clock_timestamp()
        LIMIT 1`,
      [id],
    );
    if (result.rows[0]) {
      return sanitizeStoredApplicationIntegrity(result.rows[0].state);
    }
    // A configured database is authoritative. Development may deliberately
    // layer the fixture workspace beside it, but production and non-demo
    // development must never fall through to stale local candidate data.
    if (!isDevelopmentDemoMode()) return null;
  }
  const data = await readDevData();
  const application = data.applications[id];
  return application
    ? sanitizeStoredApplicationIntegrity(application)
    : null;
}

export async function getCandidateApplication(id: string, token: string): Promise<StoredCandidateApplication | null> {
  const application = await readApplicationById(id);
  if (!application || application.sessionTokenHash !== sha256(token)) return null;
  return application;
}

export async function saveCandidateApplication(
  application: StoredCandidateApplication,
  expectedLockVersion: number,
  auditAction: string,
): Promise<StoredCandidateApplication> {
  const sanitized = sanitizeStoredApplicationIntegrity(application);
  const next = {
    ...sanitized,
    lockVersion: expectedLockVersion + 1,
    updatedAt: new Date().toISOString(),
  };

  if (next.storage === "database") {
    const updated = await transaction(async (client) => {
      const result = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                stage = $2,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $3 AND organization_id = $4 AND lock_version = $5
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [JSON.stringify(next), next.stage, next.id, next.organizationId, expectedLockVersion],
      );
      if (!result.rowCount) throw new Error("Application was updated by another request. Reload and retry.");
      if (auditAction === "CONSENT_ACCEPTED" && next.consentAt) {
        await client.query(
          `INSERT INTO consent_events
             (application_id, notice_version, purpose, accepted, created_at)
           VALUES ($1, $2, 'ai_structured_interview', true, $3)
           ON CONFLICT DO NOTHING`,
          [next.id, next.noticeVersion, next.consentAt],
        );
      }
      if (auditAction.startsWith("INTERVIEW_")) {
        for (const [index, turn] of next.history.entries()) {
          const turnNumber = index + 1;
          await client.query(
            `INSERT INTO interview_turns
               (application_id, turn_number, speaker, topic, kind, content, input_hash)
             VALUES ($1, $2, 'ai', $3, $4, $5, $6)
             ON CONFLICT (application_id, turn_number, speaker) DO NOTHING`,
            [
              next.id,
              turnNumber,
              turn.topic,
              turn.kind,
              turn.question,
              sha256(turn.question),
            ],
          );
          if (turn.answer) {
            await client.query(
              `INSERT INTO interview_turns
                 (application_id, turn_number, speaker, topic, kind, content,
                  input_hash, recording_id, provider_status, provider_model,
                  provider_transcript, provider_transcript_sha256,
                  candidate_correction, candidate_correction_sha256,
                  correction_reason, correction_diff, transcript_review_status,
                  reviewed_content, reviewed_content_sha256, reviewed_by,
                  reviewed_at, review_reason)
               VALUES (
                 $1, $2, 'candidate', $3, $4, $5, $6, $7::uuid, $8, $9,
                 $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19,
                 $20, $21
               )
               ON CONFLICT (application_id, turn_number, speaker) DO NOTHING`,
              [
                next.id,
                turnNumber,
                turn.topic,
                turn.kind,
                turn.answer,
                sha256(turn.answer),
                turn.recordingId ?? null,
                turn.transcript?.providerStatus ?? null,
                turn.transcript?.providerModel ?? null,
                turn.transcript?.providerTranscript ?? null,
                turn.transcript?.providerTranscriptSha256 ?? null,
                turn.transcript?.candidateCorrection ?? null,
                turn.transcript?.candidateCorrectionSha256 ?? null,
                turn.transcript?.correctionReason ?? null,
                turn.transcript?.correctionDiff
                  ? JSON.stringify(turn.transcript.correctionDiff)
                  : null,
                turn.transcript?.reviewStatus ?? null,
                turn.transcript?.reviewedTranscript ?? null,
                turn.transcript?.reviewedTranscriptSha256 ?? null,
                turn.transcript?.reviewedBy ?? null,
                turn.transcript?.reviewedAt ?? null,
                turn.transcript?.reviewReason ?? null,
              ],
            );
          }
        }
      }
      await appendAuditEvent(client, {
        organizationId: next.organizationId,
        actor: { type: "candidate", id: next.internalCandidateId },
        action: auditAction,
        targetType: "application",
        targetId: next.id,
        payload: {
          lockVersion: next.lockVersion,
          stage: next.stage,
          transcripts: next.history
            .map((turn, index) => ({
              turnNumber: index + 1,
              recordingId: turn.recordingId,
              providerTranscriptSha256:
                turn.transcript?.providerTranscriptSha256,
              candidateCorrectionSha256:
                turn.transcript?.candidateCorrectionSha256,
              reviewedTranscriptSha256:
                turn.transcript?.reviewedTranscriptSha256,
              reviewStatus: turn.transcript?.reviewStatus,
            }))
            .filter((item) => item.recordingId),
        },
      });
      return next;
    });
    return updated;
  }

  const data = await readDevData();
  const current = data.applications[next.id];
  if (!current || current.lockVersion !== expectedLockVersion) {
    throw new Error("Application was updated by another request. Reload and retry.");
  }
  data.applications[next.id] = next;
  const previousHash = data.audit.at(-1)?.hash ?? "genesis";
  const at = new Date().toISOString();
  const hash = sha256(JSON.stringify({ previousHash, at, actor: next.internalCandidateId, action: auditAction, target: next.id }));
  data.audit.push({ at, actor: next.internalCandidateId, action: auditAction, target: next.id, previousHash, hash });
  await writeDevData(data);
  return next;
}

export async function getTenantApplication(
  id: string,
  organizationId: string,
): Promise<StoredCandidateApplication | null> {
  const application = await readApplicationById(id);
  return application?.organizationId === organizationId ? application : null;
}

function recordingPlaybackBindingForTurn(
  application: StoredCandidateApplication,
  turnNumber: number,
  recording: StoredRecording,
  actorUserId: string,
): RecordingPlaybackBinding {
  const turn = application.history[turnNumber - 1];
  if (
    !turn?.recordingId ||
    !turn.transcript ||
    turn.recordingId !== recording.id ||
    turn.transcript.recordingId !== recording.id ||
    turn.transcript.recordingSha256 !== recording.contentSha256 ||
    recording.organizationId !== application.organizationId ||
    recording.applicationId !== application.id ||
    recording.turnNumber !== turnNumber ||
    recording.status !== "stored"
  ) {
    throw new Error(
      "The recording does not match the exact immutable interview turn.",
    );
  }
  return recordingPlaybackBinding({
    organizationId: application.organizationId,
    applicationId: application.id,
    recordingId: recording.id,
    recordingApplicationVersion: recording.applicationVersion,
    turnNumber,
    recordingContentSha256: recording.contentSha256,
    transcriptReceiptSha256: transcriptSourceReceiptSha256(turn.transcript),
    actorUserId,
  });
}

interface DatabaseTranscriptPlaybackSource {
  recording_id: string;
  recording_application_version: number;
  turn_number: number;
  recording_content_sha256: string;
  provider_status: ProviderTranscriptStatus | null;
  provider_model: string | null;
  provider_transcript_sha256: string | null;
  candidate_correction_sha256: string | null;
  correction_reason: string | null;
  correction_diff: TranscriptCorrectionDiff | null;
  transcript_review_status: TranscriptReviewStatus | null;
}

async function databaseHasFreshRecordingPlaybackAccess(
  client: PoolClient,
  expected: RecordingPlaybackBinding,
): Promise<boolean> {
  const source = await client.query<DatabaseTranscriptPlaybackSource>(
    `SELECT r.id::text AS recording_id,
            r.application_lock_version AS recording_application_version,
            r.turn_number,
            r.content_sha256 AS recording_content_sha256,
            t.provider_status,
            t.provider_model,
            t.provider_transcript_sha256,
            t.candidate_correction_sha256,
            t.correction_reason,
            t.correction_diff,
            t.transcript_review_status
       FROM application_recordings r
       JOIN interview_turns t
         ON t.application_id = r.application_id
        AND t.turn_number = r.turn_number
        AND t.speaker = 'candidate'
        AND t.recording_id = r.id
      WHERE r.organization_id = $1
        AND r.application_id = $2
        AND r.id = $3::uuid
        AND r.application_lock_version = $4
        AND r.turn_number = $5
        AND r.content_sha256 = $6
        AND r.status = 'stored'
        AND r.retention_deadline > clock_timestamp()
      LIMIT 1
      FOR SHARE OF r, t`,
    [
      expected.organizationId,
      expected.applicationId,
      expected.recordingId,
      expected.recordingApplicationVersion,
      expected.turnNumber,
      expected.recordingContentSha256,
    ],
  );
  const row = source.rows[0];
  if (
    !row ||
    row.recording_id !== expected.recordingId ||
    row.recording_application_version !==
      expected.recordingApplicationVersion ||
    row.turn_number !== expected.turnNumber ||
    row.recording_content_sha256 !==
      expected.recordingContentSha256 ||
    (row.provider_status !== "succeeded" &&
      row.provider_status !== "unavailable") ||
    !row.provider_model ||
    (row.transcript_review_status !== "candidate_correction_pending" &&
      row.transcript_review_status !== "provider_unavailable")
  ) {
    return false;
  }
  let databaseReceiptSha256: string;
  try {
    databaseReceiptSha256 = transcriptSourceReceiptSha256({
      recordingId: row.recording_id,
      recordingSha256: row.recording_content_sha256,
      providerStatus: row.provider_status,
      providerModel: row.provider_model,
      providerTranscriptSha256:
        row.provider_transcript_sha256 ?? undefined,
      candidateCorrectionSha256:
        row.candidate_correction_sha256 ?? undefined,
      correctionReason: row.correction_reason ?? undefined,
      correctionDiff: row.correction_diff ?? undefined,
      reviewStatus: row.transcript_review_status,
    });
  } catch {
    return false;
  }
  if (databaseReceiptSha256 !== expected.transcriptReceiptSha256) {
    return false;
  }

  const access = await client.query(
    `SELECT 1
       FROM audit_events
      WHERE organization_id = $1
        AND actor_type = 'user'
        AND actor_id = $2
        AND action = 'RECORDING_ACCESSED'
        AND target_type = 'application_recording'
        AND target_id = $3
        AND payload->>'applicationId' = $4
        AND payload->>'recordingApplicationVersion' = $5
        AND payload->>'turnNumber' = $6
        AND payload->>'recordingContentSha256' = $7
        AND payload->>'transcriptReceiptSha256' = $8
        AND created_at >=
          now() - ($9::bigint * interval '1 millisecond')
        AND created_at <= now() + interval '30 seconds'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [
      expected.organizationId,
      expected.actorUserId,
      expected.recordingId,
      expected.applicationId,
      String(expected.recordingApplicationVersion),
      String(expected.turnNumber),
      expected.recordingContentSha256,
      expected.transcriptReceiptSha256,
      RECORDING_PLAYBACK_ATTESTATION_MAX_AGE_MS,
    ],
  );
  return Boolean(access.rowCount);
}

function requireFreshRecordingPlaybackAccess(accessed: boolean): void {
  if (!accessed) {
    throw new RecordingPlaybackAccessRequiredError();
  }
}

export async function verifyRecordedTranscript(
  application: StoredCandidateApplication,
  input: {
    turnNumber: number;
    reviewedTranscript: string;
    reason: string;
    expectedLockVersion: number;
    recording: StoredRecording;
  },
  session: HrSession,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  if (
    application.organizationId !== session.organizationId ||
    application.lockVersion !== input.expectedLockVersion
  ) {
    throw new Error("Application was updated by another request.");
  }
  const turnIndex = input.turnNumber - 1;
  const turn = application.history[turnIndex];
  if (!turn?.recordingId || !turn.transcript) {
    throw new Error("The recorded interview turn has no transcript provenance.");
  }
  if (application.evaluation) {
    throw new Error("A transcript cannot change after evaluation.");
  }
  if (
    turn.transcript.reviewStatus !== "candidate_correction_pending" &&
    turn.transcript.reviewStatus !== "provider_unavailable"
  ) {
    throw new Error("The transcript is already verified.");
  }
  const playbackBinding = recordingPlaybackBindingForTurn(
    application,
    input.turnNumber,
    input.recording,
    session.sub,
  );
  const transcript = humanVerifyTranscript(
    turn.transcript,
    input.reviewedTranscript,
    {
      reviewerId: session.sub,
      reason: input.reason,
    },
  );
  const history = application.history.map((item, index) =>
    index === turnIndex
      ? {
          ...item,
          answer: transcript.reviewedTranscript,
          transcript,
        }
      : item,
  );
  const next: StoredCandidateApplication = {
    ...application,
    history,
    lockVersion: application.lockVersion + 1,
    updatedAt: new Date().toISOString(),
  };

  if (application.storage === "database") {
    return transaction(async (client) => {
      requireFreshRecordingPlaybackAccess(
        await databaseHasFreshRecordingPlaybackAccess(
          client,
          playbackBinding,
        ),
      );
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND lock_version = $4
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [
          JSON.stringify(next),
          application.id,
          session.organizationId,
          input.expectedLockVersion,
        ],
      );
      if (!updated.rowCount) {
        throw new Error("Application was updated by another request.");
      }
      const transcriptUpdate = await client.query(
        `UPDATE interview_turns
            SET content = $1,
                input_hash = $2,
                transcript_review_status = 'human_verified',
                reviewed_content = $1,
                reviewed_content_sha256 = $2,
                reviewed_by = $3,
                reviewed_at = $4,
                review_reason = $5
          WHERE application_id = $6
            AND turn_number = $7
            AND speaker = 'candidate'`,
        [
          transcript.reviewedTranscript,
          transcript.reviewedTranscriptSha256,
          session.sub,
          transcript.reviewedAt,
          transcript.reviewReason,
          application.id,
          input.turnNumber,
        ],
      );
      if (!transcriptUpdate.rowCount) {
        throw new Error("The immutable interview transcript row is missing.");
      }
      await appendAuditEvent(client, {
        organizationId: application.organizationId,
        actor: { type: "user", id: session.sub },
        action: "TRANSCRIPT_HUMAN_VERIFIED",
        targetType: "application",
        targetId: application.id,
        requestId,
        payload: {
          turnNumber: input.turnNumber,
          recordingId: turn.recordingId,
          providerTranscriptSha256:
            transcript.providerTranscriptSha256,
          candidateCorrectionSha256:
            transcript.candidateCorrectionSha256,
          reviewedTranscriptSha256:
            transcript.reviewedTranscriptSha256,
          reviewReasonSha256: sha256(
            transcript.reviewReason ?? input.reason,
          ),
        },
      });
      return next;
    });
  }

  return mutateDevData(async (data) => {
    const current = data.applications[application.id];
    if (
      !current ||
      current.organizationId !== session.organizationId ||
      current.lockVersion !== input.expectedLockVersion
    ) {
      throw new Error("Application was updated by another request.");
    }
    const persistedRecording = await findStoredRecordingById({
      id: input.recording.id,
      applicationId: current.id,
      organizationId: current.organizationId,
    });
    let currentPlaybackBinding: RecordingPlaybackBinding | null = null;
    if (persistedRecording) {
      try {
        currentPlaybackBinding = recordingPlaybackBindingForTurn(
          current,
          input.turnNumber,
          persistedRecording,
          session.sub,
        );
      } catch {
        currentPlaybackBinding = null;
      }
    }
    requireFreshRecordingPlaybackAccess(
      Boolean(
        currentPlaybackBinding &&
          hasFreshRecordingPlaybackAccess(
            data.audit.flatMap((event) =>
              event.recordingPlayback
                ? [event.recordingPlayback]
                : [],
            ),
            currentPlaybackBinding,
          ),
      ),
    );
    data.applications[application.id] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const at = new Date().toISOString();
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at,
        actor: session.sub,
        action: "TRANSCRIPT_HUMAN_VERIFIED",
        target: `${next.id}:turn:${input.turnNumber}`,
        reviewedTranscriptSha256: transcript.reviewedTranscriptSha256,
      }),
    );
    data.audit.push({
      at,
      actor: session.sub,
      action: "TRANSCRIPT_HUMAN_VERIFIED",
      target: `${next.id}:turn:${input.turnNumber}`,
      previousHash,
      hash,
    });
    return next;
  });
}

export async function listTenantApplications(
  vacancyId: string,
  organizationId: string,
): Promise<TenantApplicationSummary[]> {
  if (databaseConfigured()) {
    const result = await query<{
      id: string;
      vacancy_id: string;
      vacancy_version: number;
      internal_candidate_id: string;
      stage: ApplicationStage;
      evaluation: CandidateEvaluation | null;
      lock_version: number;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id,
              vacancy_id,
              vacancy_version,
              internal_candidate_id,
              stage,
              state -> 'evaluation' AS evaluation,
              lock_version,
              created_at,
              updated_at
         FROM applications
        WHERE vacancy_id = $1
          AND organization_id = $2
          AND retention_status = 'active'
          AND retention_deadline > clock_timestamp()
        ORDER BY created_at ASC, id ASC`,
      [vacancyId, organizationId],
    );
    const iso = (value: Date | string): string =>
      value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    return result.rows.map((row) => ({
      id: row.id,
      vacancyId: row.vacancy_id,
      vacancyVersion: row.vacancy_version,
      internalCandidateId: row.internal_candidate_id,
      stage: row.stage,
      evaluation: sanitizeCandidateEvaluationIntegrity(
        row.evaluation ?? undefined,
      ),
      lockVersion: row.lock_version,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  if (!isDevelopmentDemoMode()) {
    throw new Error("PostgreSQL is required to list applications outside development demo mode.");
  }
  const data = await readDevData();
  return Object.values(data.applications)
    .filter(
      (application) =>
        application.organizationId === organizationId &&
        application.vacancyId === vacancyId,
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
    .map((application) => ({
      id: application.id,
      vacancyId: application.vacancyId,
      vacancyVersion: application.vacancyVersion,
      internalCandidateId: application.internalCandidateId,
      stage: application.stage,
      evaluation: sanitizeCandidateEvaluationIntegrity(
        application.evaluation,
      ),
      lockVersion: application.lockVersion,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    }));
}

export async function getTenantVacancy(
  id: string,
  organizationId: string,
): Promise<VacancyV2 | null> {
  if (databaseConfigured()) {
    const result = await query<{ config: VacancyV2 }>(
      `SELECT vv.config
         FROM vacancies v
         JOIN vacancy_versions vv
           ON vv.vacancy_id = v.id AND vv.version = v.current_version
        WHERE v.id = $1 AND v.organization_id = $2
        LIMIT 1`,
      [id, organizationId],
    );
    return result.rows[0]?.config ?? null;
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error("PostgreSQL is required to read vacancies outside development demo mode.");
  }
  const data = await readDevData();
  return Object.values(data.vacancies).find(
    (record) => record.organizationId === organizationId && record.vacancy.id === id,
  )?.vacancy ?? null;
}

export async function getTenantVacancyVersion(
  id: string,
  version: number,
  organizationId: string,
): Promise<VacancyV2 | null> {
  if (!Number.isSafeInteger(version) || version < 1) return null;
  if (databaseConfigured()) {
    const result = await query<{ config: VacancyV2 }>(
      `SELECT vv.config
         FROM vacancy_versions vv
         JOIN vacancies v
           ON v.id = vv.vacancy_id
          AND v.organization_id = vv.organization_id
        WHERE vv.vacancy_id = $1
          AND vv.version = $2
          AND vv.organization_id = $3
        LIMIT 1`,
      [id, version, organizationId],
    );
    const vacancy = result.rows[0]?.config;
    return vacancy?.configVersion === version ? vacancy : null;
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error("PostgreSQL is required to read vacancy versions outside development demo mode.");
  }
  const data = await readDevData();
  const versioned =
    data.vacancyVersions?.[
      vacancyVersionStorageKey(organizationId, id, version)
    ] ??
    // Compatibility with development snapshots created before keys became
    // tenant-aware. The record itself is still checked below.
    data.vacancyVersions?.[`${id}:${version}`];
  if (
    versioned?.organizationId === organizationId &&
    versioned.vacancy.id === id &&
    versioned.vacancy.configVersion === version
  ) {
    return versioned.vacancy;
  }
  return Object.values(data.vacancies).find(
    (record) =>
      record.organizationId === organizationId &&
      record.vacancy.id === id &&
      record.vacancy.configVersion === version,
  )?.vacancy ?? null;
}

export async function saveApplicationEvaluation(
  application: StoredCandidateApplication,
  evaluation: CandidateEvaluation,
  session: HrSession,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  if (application.organizationId !== session.organizationId) {
    throw new Error("Application belongs to another organization.");
  }
  const runtimePatch =
    application.assessmentPlan &&
    application.blockRuns &&
    application.blockResults &&
    application.currentBlockIndex !== undefined
      ? applyEvaluationReceiptToRuntime(
          application.assessmentPlan,
          {
            blockRuns: application.blockRuns,
            blockResults: application.blockResults,
            currentBlockIndex: application.currentBlockIndex,
            progress: application.progress,
            stage:
              application.stage === "in_progress" ||
              application.stage === "submitted" ||
              application.stage === "under_review" ||
              application.stage === "needs_adjudication"
                ? application.stage
                : "under_review",
          },
          evaluation,
        )
      : null;
  const next: StoredCandidateApplication = {
    ...application,
    ...(runtimePatch
      ? {
          blockRuns: runtimePatch.blockRuns,
          blockResults: runtimePatch.blockResults,
          currentBlockIndex: runtimePatch.currentBlockIndex,
          progress: runtimePatch.progress,
        }
      : {}),
    evaluation,
    stage: "needs_adjudication",
    lockVersion: application.lockVersion + 1,
    updatedAt: new Date().toISOString(),
  };

  if (application.storage === "database") {
    return transaction(async (client) => {
      const inputHash = sha256(JSON.stringify({
        applicationId: application.id,
        vacancyId: application.vacancyId,
        vacancyVersion: application.vacancyVersion,
        history: application.history,
        blockResults: application.blockResults ?? [],
        assessmentReviews: application.assessmentReviews ?? [],
      }));
      await client.query(
        `INSERT INTO evaluation_runs
           (application_id, status, model, prompt_version, input_hash, output, completed_at)
         VALUES ($1, 'completed', $2, $3, $4, $5::jsonb, now())`,
        [
          application.id,
          evaluation.engine.model,
          evaluation.engine.promptVersion,
          inputHash,
          JSON.stringify(evaluation),
        ],
      );
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                stage = $2,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $3 AND organization_id = $4 AND lock_version = $5
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [JSON.stringify(next), next.stage, next.id, next.organizationId, application.lockVersion],
      );
      if (!updated.rowCount) throw new Error("Application was updated by another request.");
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: "EVALUATION_COMPLETED",
        targetType: "application",
        targetId: application.id,
        requestId,
        payload: {
          model: evaluation.engine.model,
          promptVersion: evaluation.engine.promptVersion,
          overall: evaluation.overall,
          confidence: evaluation.confidence,
          inputHash,
        },
      });
      return next;
    });
  }

  return mutateDevData((data) => {
    const current = data.applications[application.id];
    if (
      !current ||
      current.organizationId !== session.organizationId ||
      current.lockVersion !== application.lockVersion
    ) {
      throw new Error("Application was updated by another request.");
    }
    data.applications[application.id] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const at = new Date().toISOString();
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at,
        actor: session.sub,
        action: "EVALUATION_COMPLETED",
        target: next.id,
      }),
    );
    data.audit.push({
      at,
      actor: session.sub,
      action: "EVALUATION_COMPLETED",
      target: next.id,
      previousHash,
      hash,
    });
    return next;
  });
}

async function databaseHasAssessmentEvidenceAccess(
  client: PoolClient,
  expected: AssessmentEvidenceAccessBinding,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM audit_events
      WHERE organization_id = $1
        AND actor_type = 'user'
        AND actor_id = $2
        AND action = 'ASSESSMENT_EVIDENCE_ACCESSED'
        AND target_type = 'assessment_review_evidence'
        AND target_id = $3
        AND payload->>'applicationId' = $4
        AND payload->>'blockId' = $5
        AND payload->>'receiptIndex' = $6
        AND payload->>'receiptLocatorHash' = $7
      LIMIT 1`,
    [
      expected.organizationId,
      expected.actorUserId,
      expected.targetId,
      expected.applicationId,
      expected.blockId,
      String(expected.receiptIndex),
      expected.receiptLocatorHash,
    ],
  );
  return Boolean(result.rowCount);
}

function requireAssessmentEvidenceAccess(
  accessed: boolean,
): void {
  if (!accessed) {
    throw new Error(
      "The current reviewer must open the exact server-owned evidence receipt before submitting a review.",
    );
  }
}

export async function recordAssessmentReview(
  application: StoredCandidateApplication,
  vacancy: VacancyV2,
  input: AssessmentReviewSubmission,
  session: HrSession,
  requestId?: string,
): Promise<RecordedAssessmentReview> {
  const binding = input.binding;
  if (
    application.organizationId !== session.organizationId ||
    !assessmentReviewBindingMatchesScope(binding, {
      organizationId: session.organizationId,
      applicationId: application.id,
      vacancyId: application.vacancyId,
      vacancyVersion: application.vacancyVersion,
    }) ||
    vacancy.id !== application.vacancyId ||
    vacancy.configVersion !== application.vacancyVersion
  ) {
    throw new Error(
      "Assessment review binding does not match the tenant-scoped frozen application.",
    );
  }
  if (
    !binding.blockId ||
    !binding.sourceItemId ||
    !/^[0-9a-f]{64}$/u.test(binding.rubricHash)
  ) {
    throw new Error("Assessment review binding is malformed.");
  }
  if (
    binding.kind === "manual_bars"
      ? input.level === null ||
        input.verificationOutcome !== null ||
        input.gateWaiverOutcome !== null ||
        binding.attributeId === null
      : binding.kind === "verification"
        ? input.level !== null ||
          input.verificationOutcome === null ||
          input.gateWaiverOutcome !== null ||
          binding.attributeId !== null
        : input.level !== null ||
          input.verificationOutcome !== null ||
          input.gateWaiverOutcome === null ||
          binding.attributeId !== null
  ) {
    throw new Error(
      "Assessment review outcome does not match the frozen target kind.",
    );
  }
  if (
    binding.kind === "gate_waiver" &&
    session.role !== "Owner" &&
    session.role !== "HiringManager"
  ) {
    throw new Error(
      "Only an owner or hiring manager may adjudicate a failed gate.",
    );
  }
  if (!application.blockResults) {
    throw new Error(
      "Trusted assessment reviews require frozen block results.",
    );
  }
  const reviews = application.assessmentReviews ?? [];
  const reviewContext = {
    organizationId: application.organizationId,
    applicationId: application.id,
    reviews,
  };
  const targetId = assessmentReviewBindingHash(binding);
  const currentTarget = (
    binding.kind === "gate_waiver"
      ? buildGateWaiverReviewTargets(
          vacancy,
          application.evaluation,
          reviewContext,
        )
      : buildAssessmentReviewTargets(
          vacancy,
          application.blockResults,
          reviewContext,
        )
  ).find(
    (target) => target.targetId === targetId,
  );
  if (!currentTarget) {
    throw new Error(
      binding.kind === "gate_waiver"
        ? "A gate waiver may target only an exact frozen failed gate."
        : "Assessment review target does not exist in the exact frozen evidence plan.",
    );
  }
  assertReviewerAuthorized({
    session,
    vacancy,
    application,
    capability: "assessment_review",
    evidenceMode: "raw",
    blindReviewRequired: currentTarget.blindReviewRequired,
    deidentifiedEvidenceAvailable: false,
  });
  if (!currentTarget.reviewable) {
    throw new Error(
      currentTarget.unavailableReason ??
        "This target has no server-owned trusted evidence receipt.",
    );
  }
  const rationale = input.rationale.trim();
  if (rationale.length < 20 || rationale.length > 2_000) {
    throw new Error(
      "Assessment review rationale must contain 20 to 2000 characters.",
    );
  }
  const evidenceReceipt = resolveAssessmentReviewEvidenceReceipt(
    currentTarget,
    input.evidence.locator,
  );
  if (!evidenceReceipt) {
    throw new Error(
      "The evidence locator is not a server-owned receipt for this exact frozen review target.",
    );
  }
  const evidence: AssessmentReviewEvidence = {
    summary: input.evidence.summary.trim(),
    locator: evidenceReceipt.locator,
    source: evidenceReceipt.source,
    observedBy: evidenceReceipt.observedBy,
  };
  if (
    evidence.summary.trim().length < 20 ||
    evidence.summary.trim().length > 2_000 ||
    evidence.locator.trim().length < 3 ||
    evidence.locator.trim().length > 300
  ) {
    throw new Error(
      "Trusted review evidence requires a 20–2000 character summary and a stable source locator.",
    );
  }
  const receiptIndex = currentTarget.evidenceReceipts.findIndex(
    (receipt) => receipt.locator === evidenceReceipt.locator,
  );
  const accessBinding = assessmentEvidenceAccessBinding({
    organizationId: session.organizationId,
    applicationId: application.id,
    targetId,
    blockId: binding.blockId,
    receiptIndex,
    receiptLocator: evidenceReceipt.locator,
    actorUserId: session.sub,
  });
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 200
  ) {
    throw new Error("Assessment review idempotency key is invalid.");
  }
  const idempotencyKeyHash = sha256(idempotencyKey);
  const inputHash = assessmentReviewInputHash({
    binding,
    level: input.level,
    verificationOutcome: input.verificationOutcome,
    gateWaiverOutcome: input.gateWaiverOutcome,
    evidence,
    rationale,
    reviewerUserId: session.sub,
    supersedesReviewId: input.supersedesReviewId,
  });
  const writeResolution = resolveAssessmentReviewWrite(reviews, {
    idempotencyKeyHash,
    inputHash,
    currentLockVersion: application.lockVersion,
    expectedLockVersion: input.expectedLockVersion,
  });
  if (writeResolution.action === "replay") {
    return {
      application,
      review: writeResolution.review,
      created: false,
    };
  }
  if (
    currentTarget.status === "resolved" &&
    !input.supersedesReviewId
  ) {
    throw new Error(
      "The trusted assessment review target is already resolved.",
    );
  }

  const active = activeAssessmentReviews(reviews, binding);
  const superseded = input.supersedesReviewId
    ? reviews.find(
        (review) => review.id === input.supersedesReviewId,
      )
    : undefined;
  if (input.supersedesReviewId) {
    if (
      !superseded ||
      !reviewMatchesBinding(superseded, binding) ||
      superseded.reviewerUserId !== session.sub ||
      !active.some((review) => review.id === superseded.id)
    ) {
      throw new Error(
        "Only the current reviewer's active record for the exact frozen target may be superseded.",
      );
    }
  } else if (
    active.some((review) => review.reviewerUserId === session.sub)
  ) {
    throw new Error(
      "This reviewer already has an active record for the target; submit an explicit superseding review.",
    );
  }

  const createdAt = new Date().toISOString();
  const review: AssessmentReviewRecord = {
    ...binding,
    schemaVersion: ASSESSMENT_REVIEW_SCHEMA_VERSION,
    id: randomUUID(),
    idempotencyKeyHash,
    inputHash,
    level: input.level,
    verificationOutcome: input.verificationOutcome,
    gateWaiverOutcome: input.gateWaiverOutcome,
    evidence,
    rationale,
    reviewerUserId: session.sub,
    reviewerEmail: session.email,
    reviewerRole: session.role,
    supersedesReviewId: input.supersedesReviewId,
    createdAt,
  };
  const reviewsAfterSubmission = [...reviews, review];
  let blockReviewComplete = false;
  let gateRuntimeResolution:
    | "pending"
    | "conflict"
    | "waived"
    | "upheld"
    | null = null;
  if (binding.kind !== "gate_waiver") {
    const targetsAfterSubmission = buildAssessmentReviewTargets(
      vacancy,
      application.blockResults,
      {
        organizationId: application.organizationId,
        applicationId: application.id,
        reviews: reviewsAfterSubmission,
      },
    );
    const blockTargets = targetsAfterSubmission.filter(
      (target) => target.binding.blockId === binding.blockId,
    );
    if (blockTargets.length === 0) {
      throw new Error(
        "The reviewed block has no trusted frozen review targets.",
      );
    }
    blockReviewComplete = blockTargets.every(
      (target) => target.status === "resolved",
    );
  } else {
    const resolution = resolveAssessmentReview(
      reviewsAfterSubmission,
      binding,
      currentTarget.requiredReviews,
    );
    if (resolution.status === "resolved") {
      if (!resolution.gateWaiverOutcome) {
        throw new Error(
          "Resolved gate adjudication has no governed outcome.",
        );
      }
      gateRuntimeResolution = resolution.gateWaiverOutcome;
    } else {
      gateRuntimeResolution = resolution.status;
    }
  }
  let runtimePatch: Pick<
    StoredCandidateApplication,
    "blockRuns" | "blockResults" | "currentBlockIndex" | "progress"
  > | null = null;
  let runtimeStage: ApplicationStage = "under_review";
  if (
    !application.assessmentPlan ||
    !application.blockRuns ||
    !application.blockResults ||
    application.currentBlockIndex === undefined
  ) {
    throw new Error(
      "Trusted assessment reviews require a frozen multi-block runtime.",
    );
  }
  if (binding.kind !== "gate_waiver") {
    let blockRuns = application.blockRuns.map((run) => ({ ...run }));
    const targetRun = blockRuns.find(
      (run) => run.blockId === binding.blockId,
    );
    if (
      targetRun?.status === "submitted" &&
      input.supersedesReviewId
    ) {
      blockRuns = blockRuns.map((run) => {
        if (run.blockId !== binding.blockId) return run;
        const reopened = {
          ...run,
          status:
            binding.kind === "verification"
              ? ("awaiting_verification" as const)
              : ("awaiting_human_review" as const),
        };
        delete reopened.completedAt;
        return reopened;
      });
    }
    const runtime = applyAssessmentReviewToRuntime(
      application.assessmentPlan,
      {
        blockRuns,
        blockResults: application.blockResults,
        currentBlockIndex: application.currentBlockIndex,
        progress: application.progress,
        stage:
          application.stage === "in_progress" ||
          application.stage === "submitted" ||
          application.stage === "under_review" ||
          application.stage === "needs_adjudication"
            ? application.stage
            : "under_review",
      },
      {
        blockId: binding.blockId,
        reviewId: review.id,
        actorUserId: session.sub,
        at: createdAt,
        reviewComplete: blockReviewComplete,
      },
    );
    runtimePatch = {
      blockRuns: runtime.blockRuns,
      blockResults: runtime.blockResults,
      currentBlockIndex: runtime.currentBlockIndex,
      progress: runtime.progress,
    };
    runtimeStage =
      runtime.stage === "in_progress"
        ? "in_progress"
        : "under_review";
  } else {
    if (!gateRuntimeResolution) {
      throw new Error("Gate adjudication resolution is unavailable.");
    }
    const runtime = applyGateAdjudicationToRuntime(
      application.assessmentPlan,
      {
        blockRuns: application.blockRuns,
        blockResults: application.blockResults,
        currentBlockIndex: application.currentBlockIndex,
        progress: application.progress,
        stage:
          application.stage === "in_progress" ||
          application.stage === "submitted" ||
          application.stage === "under_review" ||
          application.stage === "needs_adjudication"
            ? application.stage
            : "needs_adjudication",
      },
      {
        blockId: binding.blockId,
        reviewId: review.id,
        actorUserId: session.sub,
        at: createdAt,
        resolution: gateRuntimeResolution,
      },
    );
    runtimePatch = {
      blockRuns: runtime.blockRuns,
      blockResults: runtime.blockResults,
      currentBlockIndex: runtime.currentBlockIndex,
      progress: runtime.progress,
    };
    runtimeStage = runtime.stage;
  }
  const next: StoredCandidateApplication = {
    ...application,
    ...(runtimePatch ?? {}),
    assessmentReviews: reviewsAfterSubmission,
    // Any previous roll-up is stale as soon as trusted evidence changes.
    // The review API returns the new lock version and the UI requests a
    // fresh frozen-version evaluation.
    // A partial gate adjudication must retain the failed-gate snapshot so a
    // second independent reviewer can resolve the exact same frozen target.
    // Normal evidence reviews invalidate the roll-up because they can change
    // scores/completeness. Gate decisions are consumed on the next evaluation
    // and remain fail-closed in the meantime.
    evaluation:
      binding.kind === "gate_waiver"
        ? application.evaluation
        : undefined,
    stage: runtimeStage,
    lockVersion: application.lockVersion + 1,
    updatedAt: createdAt,
  };

  if (application.storage === "database") {
    const saved = await transaction(async (client) => {
      requireAssessmentEvidenceAccess(
        await databaseHasAssessmentEvidenceAccess(
          client,
          accessBinding,
        ),
      );
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                stage = $2,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $3
            AND organization_id = $4
            AND lock_version = $5
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [
          JSON.stringify(next),
          next.stage,
          application.id,
          session.organizationId,
          input.expectedLockVersion,
        ],
      );
      if (!updated.rowCount) {
        throw new Error("Application was updated by another request.");
      }
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: "ASSESSMENT_REVIEW_RECORDED",
        targetType: "application",
        targetId: application.id,
        requestId,
        payload: {
          reviewId: review.id,
          kind: review.kind,
          vacancyId: review.vacancyId,
          vacancyVersion: review.vacancyVersion,
          blockId: review.blockId,
          sourceItemId: review.sourceItemId,
          attributeId: review.attributeId,
          rubricHash: review.rubricHash,
          inputHash: review.inputHash,
          supersedesReviewId: review.supersedesReviewId,
          blockReviewComplete,
          gateResolution: gateRuntimeResolution,
        },
      });
      return next;
    });
    return { application: saved, review, created: true };
  }

  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "PostgreSQL is required to record assessment reviews outside demo mode.",
    );
  }
  return mutateDevData((data) => {
    requireAssessmentEvidenceAccess(
      hasAssessmentEvidenceAccess(
        data.audit.flatMap((event) =>
          event.evidenceAccess ? [event.evidenceAccess] : [],
        ),
        accessBinding,
      ),
    );
    const current = data.applications[application.id];
    if (
      !current ||
      current.organizationId !== session.organizationId ||
      current.lockVersion !== input.expectedLockVersion
    ) {
      throw new Error("Application was updated by another request.");
    }
    data.applications[application.id] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at: createdAt,
        actor: session.sub,
        action: "ASSESSMENT_REVIEW_RECORDED",
        target: next.id,
        reviewId: review.id,
        inputHash: review.inputHash,
      }),
    );
    data.audit.push({
      at: createdAt,
      actor: session.sub,
      action: "ASSESSMENT_REVIEW_RECORDED",
      target: next.id,
      previousHash,
      hash,
    });
    return { application: next, review, created: true };
  });
}

function storedAssessmentRuntime(
  application: StoredCandidateApplication,
): {
  plan: CandidateAssessmentPlan;
  runtime: AssessmentRuntimeState;
} {
  if (
    !application.assessmentPlan ||
    !application.blockRuns ||
    !application.blockResults ||
    application.currentBlockIndex === undefined
  ) {
    throw new Error("The application has no frozen assessment runtime.");
  }
  return {
    plan: application.assessmentPlan,
    runtime: {
      blockRuns: application.blockRuns,
      blockResults: application.blockResults,
      currentBlockIndex: application.currentBlockIndex,
      progress: application.progress,
      stage:
        application.stage === "in_progress" ||
        application.stage === "submitted" ||
        application.stage === "under_review" ||
        application.stage === "needs_adjudication"
          ? application.stage
          : "under_review",
    },
  };
}

async function persistHrAssessmentRuntime(
  application: StoredCandidateApplication,
  runtime: AssessmentRuntimeState,
  input: {
    expectedLockVersion: number;
    action: string;
    auditPayload: Record<string, unknown>;
    invalidateEvaluation?: boolean;
  },
  session: HrSession,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  if (
    application.organizationId !== session.organizationId ||
    application.lockVersion !== input.expectedLockVersion
  ) {
    throw new Error("Application was updated by another request.");
  }
  if (session.role === "Observer") {
    throw new Error("Observers cannot coordinate assessment evidence.");
  }
  const createdAt = new Date().toISOString();
  const next: StoredCandidateApplication = {
    ...application,
    blockRuns: runtime.blockRuns,
    blockResults: runtime.blockResults,
    currentBlockIndex: runtime.currentBlockIndex,
    progress: runtime.progress,
    stage: runtime.stage,
    ...(input.invalidateEvaluation ? { evaluation: undefined } : {}),
    lockVersion: application.lockVersion + 1,
    updatedAt: createdAt,
  };
  if (application.storage === "database") {
    return transaction(async (client) => {
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                stage = $2,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $3
            AND organization_id = $4
            AND lock_version = $5
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [
          JSON.stringify(next),
          next.stage,
          application.id,
          session.organizationId,
          input.expectedLockVersion,
        ],
      );
      if (!updated.rowCount) {
        throw new Error("Application was updated by another request.");
      }
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: input.action,
        targetType: "application",
        targetId: application.id,
        requestId,
        payload: input.auditPayload,
      });
      return next;
    });
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "PostgreSQL is required to coordinate assessments outside demo mode.",
    );
  }
  return mutateDevData((data) => {
    const current = data.applications[application.id];
    if (
      !current ||
      current.organizationId !== session.organizationId ||
      current.lockVersion !== input.expectedLockVersion
    ) {
      throw new Error("Application was updated by another request.");
    }
    data.applications[application.id] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at: createdAt,
        actor: session.sub,
        action: input.action,
        target: next.id,
        payload: input.auditPayload,
      }),
    );
    data.audit.push({
      at: createdAt,
      actor: session.sub,
      action: input.action,
      target: next.id,
      previousHash,
      hash,
    });
    return next;
  });
}

export async function unlockDeferredDocumentStage(
  application: StoredCandidateApplication,
  input: {
    blockId: string;
    expectedLockVersion: number;
  },
  session: HrSession,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  const { plan, runtime } = storedAssessmentRuntime(application);
  const nextRuntime = unlockDeferredAssessmentBlock(
    plan,
    runtime,
    input.blockId,
  );
  return persistHrAssessmentRuntime(
    application,
    nextRuntime,
    {
      expectedLockVersion: input.expectedLockVersion,
      action: "DEFERRED_DOCUMENT_STAGE_OPENED",
      auditPayload: {
        blockId: input.blockId,
        vacancyId: application.vacancyId,
        vacancyVersion: application.vacancyVersion,
      },
    },
    session,
    requestId,
  );
}

export async function recordHumanStageObservation(
  application: StoredCandidateApplication,
  input: {
    blockId: string;
    notes: string;
    expectedLockVersion: number;
  },
  session: HrSession,
  requestId?: string,
): Promise<{
  application: StoredCandidateApplication;
  observationId: string;
}> {
  const notes = input.notes.trim();
  if (notes.length < 20 || notes.length > 20_000) {
    throw new Error(
      "Human-stage notes must contain 20 to 20000 characters of job-related observation.",
    );
  }
  const { plan, runtime } = storedAssessmentRuntime(application);
  const observationId = randomUUID();
  const observedAt = new Date().toISOString();
  const nextRuntime = addHumanStageObservation(plan, runtime, {
    blockId: input.blockId,
    observationId,
    observerUserId: session.sub,
    observedAt,
    notes,
  });
  const saved = await persistHrAssessmentRuntime(
    application,
    nextRuntime,
    {
      expectedLockVersion: input.expectedLockVersion,
      action: "HUMAN_STAGE_OBSERVATION_RECORDED",
      auditPayload: {
        blockId: input.blockId,
        observationId,
        observationSha256: sha256(notes),
        vacancyId: application.vacancyId,
        vacancyVersion: application.vacancyVersion,
      },
      invalidateEvaluation: true,
    },
    session,
    requestId,
  );
  return { application: saved, observationId };
}

function applicationWithReferenceEvidence(
  application: StoredCandidateApplication,
  pointer: ReferenceEvidencePointer,
  now: string,
): StoredCandidateApplication {
  if (
    application.organizationId !== pointer.organizationId ||
    application.id !== pointer.applicationId ||
    application.vacancyId !== pointer.vacancyId ||
    application.vacancyVersion !== pointer.vacancyVersion
  ) {
    throw new Error(
      "Reference evidence does not match the tenant-scoped frozen application.",
    );
  }
  if (
    !/^[0-9a-f]{64}$/u.test(pointer.questionnaireHash) ||
    !/^[0-9a-f]{64}$/u.test(pointer.responseHash) ||
    !pointer.receiptId ||
    !pointer.invitationId ||
    !Number.isInteger(pointer.refereeOrdinal) ||
    pointer.refereeOrdinal < 1 ||
    pointer.refereeOrdinal > 4 ||
    !pointer.blockId ||
    pointer.sourceItemIds.length === 0 ||
    new Set(pointer.sourceItemIds).size !== pointer.sourceItemIds.length ||
    pointer.sourceItemIds.some(
      (sourceItemId) =>
        !sourceItemId ||
        sourceItemId.length > 200,
    )
  ) {
    throw new Error("Reference evidence pointer is malformed.");
  }
  if (!application.assessmentPlan || !application.blockResults) {
    throw new Error(
      "Reference evidence requires a frozen multi-block application.",
    );
  }
  const planBlock = application.assessmentPlan.blocks.find(
    (block) => block.id === pointer.blockId,
  );
  const resultIndex = application.blockResults.findIndex(
    (result) => result.blockId === pointer.blockId,
  );
  const result = application.blockResults[resultIndex];
  if (
    !planBlock ||
    planBlock.kind !== "reference_check" ||
    !result ||
    result.kind !== "reference_check"
  ) {
    throw new Error(
      "Reference evidence is not bound to a submitted frozen reference stage.",
    );
  }
  const existing = result.serverEvidence?.referenceResponses ?? [];
  const exactReplay = existing.find(
    (receipt) => receipt.receiptId === pointer.receiptId,
  );
  if (exactReplay) {
    if (
      exactReplay.invitationId !== pointer.invitationId ||
      exactReplay.refereeOrdinal !== pointer.refereeOrdinal ||
      exactReplay.questionnaireHash !== pointer.questionnaireHash ||
      exactReplay.responseHash !== pointer.responseHash
    ) {
      throw new Error(
        "A reference receipt identifier is already bound to different evidence.",
      );
    }
    return application;
  }
  if (
    existing.some(
      (receipt) =>
        receipt.invitationId === pointer.invitationId ||
        receipt.refereeOrdinal === pointer.refereeOrdinal,
    )
  ) {
    throw new Error(
      "A reference invitation already has a different response receipt.",
    );
  }
  const referenceReceipt = {
    receiptId: pointer.receiptId,
    invitationId: pointer.invitationId,
    refereeOrdinal: pointer.refereeOrdinal,
    questionnaireHash: pointer.questionnaireHash,
    responseHash: pointer.responseHash,
    respondedAt: pointer.respondedAt,
    sourceItemIds: [...pointer.sourceItemIds],
  };
  const blockResults = application.blockResults.map(
    (candidate, index) =>
      index === resultIndex
        ? {
            ...candidate,
            serverEvidence: {
              ...candidate.serverEvidence,
              referenceResponses: [
                ...(candidate.serverEvidence
                  ?.referenceResponses ?? []),
                referenceReceipt,
              ],
            },
          }
        : candidate,
  );
  const terminal = [
    "offer",
    "hired",
    "not_moving_forward",
    "knocked_out",
    "withdrawn",
  ].includes(application.stage);
  return {
    ...application,
    blockResults,
    ...(terminal ? {} : { evaluation: undefined }),
    lockVersion: application.lockVersion + 1,
    updatedAt: now,
  };
}

/**
 * Attaches only an opaque pointer to an immutable external response. The
 * external questionnaire owns the answers; this application mutation merely
 * makes the exact frozen review target discoverable without copying referee
 * PII or accepting browser-asserted provenance.
 */
export async function appendReferenceEvidenceReceipt(
  pointer: ReferenceEvidencePointer,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  const createdAt = new Date().toISOString();
  if (databaseConfigured()) {
    return transaction(async (client) => {
      const selected = await client.query<{
        state: StoredCandidateApplication;
        lock_version: number;
      }>(
        `SELECT state, lock_version
           FROM applications
          WHERE id = $1
            AND organization_id = $2
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          FOR UPDATE`,
        [pointer.applicationId, pointer.organizationId],
      );
      const stored = selected.rows[0];
      if (!stored) {
        throw new Error(
          "The application bound to this reference response no longer exists.",
        );
      }
      const current = {
        ...stored.state,
        lockVersion: stored.lock_version,
      };
      const next = applicationWithReferenceEvidence(
        current,
        pointer,
        createdAt,
      );
      if (next === current) return current;
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND lock_version = $4
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()`,
        [
          JSON.stringify(next),
          pointer.applicationId,
          pointer.organizationId,
          stored.lock_version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new Error(
          "Application was updated while reference evidence was recorded.",
        );
      }
      await appendAuditEvent(client, {
        organizationId: pointer.organizationId,
        actor: {
          type: "system",
          id: `reference-participant:${pointer.invitationId}`,
        },
        action: "REFERENCE_EVIDENCE_ATTACHED",
        targetType: "application",
        targetId: pointer.applicationId,
        requestId,
        payload: {
          vacancyId: pointer.vacancyId,
          vacancyVersion: pointer.vacancyVersion,
          blockId: pointer.blockId,
          receiptId: pointer.receiptId,
          questionnaireHash: pointer.questionnaireHash,
          responseHash: pointer.responseHash,
          sourceItemIds: pointer.sourceItemIds,
        },
      });
      return next;
    });
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "PostgreSQL is required to attach reference evidence outside demo mode.",
    );
  }
  return mutateDevData((data) => {
    const current = data.applications[pointer.applicationId];
    if (!current) {
      throw new Error(
        "The application bound to this reference response no longer exists.",
      );
    }
    const next = applicationWithReferenceEvidence(
      current,
      pointer,
      createdAt,
    );
    if (next === current) return current;
    data.applications[pointer.applicationId] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at: createdAt,
        actor: `reference-participant:${pointer.invitationId}`,
        action: "REFERENCE_EVIDENCE_ATTACHED",
        target: pointer.applicationId,
        receiptId: pointer.receiptId,
        responseHash: pointer.responseHash,
      }),
    );
    data.audit.push({
      at: createdAt,
      actor: `reference-participant:${pointer.invitationId}`,
      action: "REFERENCE_EVIDENCE_ATTACHED",
      target: pointer.applicationId,
      previousHash,
      hash,
    });
    return next;
  });
}

export async function recordHumanDecision(
  application: StoredCandidateApplication,
  input: {
    decision: HumanDecisionKind;
    reason: string;
    expectedLockVersion: number;
  },
  session: HrSession,
  requestId?: string,
): Promise<StoredCandidateApplication> {
  if (application.organizationId !== session.organizationId) {
    throw new Error("Application belongs to another organization.");
  }
  if (application.lockVersion !== input.expectedLockVersion) {
    throw new Error("Application was updated by another request.");
  }
  if (
    (input.decision === "advance" || input.decision === "reject") &&
    session.role !== "Owner" &&
    session.role !== "HiringManager"
  ) {
    throw new Error("This role cannot record a final hiring disposition.");
  }
  if (
    [
      "offer",
      "hired",
      "not_moving_forward",
      "knocked_out",
      "withdrawn",
    ].includes(application.stage)
  ) {
    throw new Error(
      "Terminal application outcomes cannot be overwritten without a governed override.",
    );
  }
  assertHumanDecisionEvaluationPolicy(
    input.decision,
    application.evaluation,
    { evaluationRequired: Boolean(application.assessmentPlan) },
  );

  const finalReview =
    input.decision === "advance" || input.decision === "reject";
  const decisions = application.humanDecisions ?? [];
  const lastRescoreIndex = decisions.findLastIndex(
    (item) => item.decision === "request_rescore",
  );
  const currentReviewRound = decisions.slice(lastRescoreIndex + 1);
  if (
    finalReview &&
    currentReviewRound.some(
      (item) =>
        (item.decision === "advance" || item.decision === "reject") &&
        item.actorUserId === session.sub,
    )
  ) {
    throw new Error(
      "Each required final review must be submitted by a different reviewer.",
    );
  }
  const requiredIndependentReviews =
    application.requiredIndependentReviews ?? 1;
  const priorFinalReviews = currentReviewRound.filter(
    (item) => item.decision === "advance" || item.decision === "reject",
  );
  const conflictingFinalReview =
    finalReview &&
    priorFinalReviews.some((item) => item.decision !== input.decision);
  const agreeingReviewerIds = new Set(
    priorFinalReviews
      .filter((item) => item.decision === input.decision)
      .map((item) => item.actorUserId),
  );
  if (finalReview) agreeingReviewerIds.add(session.sub);
  const finalReviewComplete =
    finalReview &&
    !conflictingFinalReview &&
    agreeingReviewerIds.size >= requiredIndependentReviews;

  const resultingStage: ApplicationStage =
    input.decision === "advance"
      ? finalReviewComplete
        ? "shortlisted"
        : "needs_adjudication"
      : input.decision === "reject"
        ? finalReviewComplete
          ? "not_moving_forward"
          : "needs_adjudication"
        : input.decision === "request_rescore"
          ? "under_review"
          : "needs_adjudication";
  const createdAt = new Date().toISOString();
  const decision: HumanDecisionRecord = {
    id: randomUUID(),
    decision: input.decision,
    reason: input.reason,
    actorUserId: session.sub,
    actorEmail: session.email,
    resultingStage,
    createdAt,
  };
  let assessmentRuntimePatch: Pick<
    StoredCandidateApplication,
    "blockRuns" | "blockResults" | "currentBlockIndex" | "progress"
  > | null = null;
  if (
    finalReview &&
    application.assessmentPlan &&
    application.blockRuns &&
    application.blockResults &&
    application.currentBlockIndex !== undefined
  ) {
    const runtime = applyHumanDecisionToAssessmentRuntime(
      application.assessmentPlan,
      {
        blockRuns: application.blockRuns,
        blockResults: application.blockResults,
        currentBlockIndex: application.currentBlockIndex,
        progress: application.progress,
        stage:
          application.stage === "in_progress" ||
          application.stage === "submitted" ||
          application.stage === "under_review" ||
          application.stage === "needs_adjudication"
            ? application.stage
            : "under_review",
      },
      {
        decisionId: decision.id,
        actorUserId: session.sub,
        decision: input.decision as "advance" | "reject",
        at: createdAt,
        reviewComplete: finalReviewComplete,
      },
    );
    assessmentRuntimePatch = {
      blockRuns: runtime.blockRuns,
      blockResults: runtime.blockResults,
      currentBlockIndex: runtime.currentBlockIndex,
      progress: runtime.progress,
    };
  }
  const next: StoredCandidateApplication = {
    ...application,
    ...(assessmentRuntimePatch ?? {}),
    stage: resultingStage,
    evaluation:
      input.decision === "request_rescore"
        ? undefined
        : application.evaluation,
    humanDecisions: [...(application.humanDecisions ?? []), decision],
    lockVersion: application.lockVersion + 1,
    updatedAt: createdAt,
  };

  if (application.storage === "database") {
    return transaction(async (client) => {
      const updated = await client.query(
        `UPDATE applications
            SET state = $1::jsonb,
                stage = $2,
                lock_version = lock_version + 1,
                updated_at = now()
          WHERE id = $3
            AND organization_id = $4
            AND lock_version = $5
            AND retention_status = 'active'
            AND retention_deadline > clock_timestamp()
          RETURNING id`,
        [
          JSON.stringify(next),
          resultingStage,
          application.id,
          session.organizationId,
          input.expectedLockVersion,
        ],
      );
      if (!updated.rowCount) {
        throw new Error("Application was updated by another request.");
      }
      await client.query(
        `INSERT INTO human_decisions
           (id, application_id, organization_id, actor_user_id, decision, reason, created_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        [
          decision.id,
          application.id,
          session.organizationId,
          session.sub,
          input.decision,
          input.reason,
          createdAt,
        ],
      );
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: "HUMAN_DECISION_RECORDED",
        targetType: "application",
        targetId: application.id,
        requestId,
        payload: {
          decision: input.decision,
          reasonSha256: sha256(input.reason),
          resultingStage,
          requiredIndependentReviews,
          collectedIndependentReviews: finalReview
            ? agreeingReviewerIds.size
            : 0,
          conflictingFinalReview,
          humanStageBlockId:
            next.blockRuns?.find((run) =>
              run.humanReviews?.some(
                (review) => review.decisionId === decision.id,
              ),
            )?.blockId ?? null,
        },
      });
      return next;
    });
  }

  if (!isDevelopmentDemoMode()) {
    throw new Error("PostgreSQL is required to record decisions outside demo mode.");
  }
  return mutateDevData((data) => {
    const current = data.applications[application.id];
    if (
      !current ||
      current.organizationId !== session.organizationId ||
      current.lockVersion !== input.expectedLockVersion
    ) {
      throw new Error("Application was updated by another request.");
    }
    data.applications[application.id] = next;
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at: createdAt,
        actor: session.sub,
        action: "HUMAN_DECISION_RECORDED",
        target: next.id,
        decision: input.decision,
        reasonSha256: sha256(input.reason),
      }),
    );
    data.audit.push({
      at: createdAt,
      actor: session.sub,
      action: "HUMAN_DECISION_RECORDED",
      target: next.id,
      previousHash,
      hash,
    });
    return next;
  });
}

export async function recordAssessmentEvidenceAccess(
  application: StoredCandidateApplication,
  binding: {
    targetId: string;
    blockId: string;
    receiptIndex: number;
    receiptLocator: string;
  },
  session: HrSession,
  requestId?: string,
): Promise<void> {
  if (application.organizationId !== session.organizationId) {
    throw new Error("Application belongs to another organization.");
  }
  const attestation = assessmentEvidenceAccessBinding({
    organizationId: session.organizationId,
    applicationId: application.id,
    targetId: binding.targetId,
    blockId: binding.blockId,
    receiptIndex: binding.receiptIndex,
    receiptLocator: binding.receiptLocator,
    actorUserId: session.sub,
  });
  const auditPayload = {
    applicationId: attestation.applicationId,
    blockId: attestation.blockId,
    receiptIndex: attestation.receiptIndex,
    receiptLocatorHash: attestation.receiptLocatorHash,
  };
  if (application.storage === "database") {
    await transaction(async (client) => {
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: "ASSESSMENT_EVIDENCE_ACCESSED",
        targetType: "assessment_review_evidence",
        targetId: binding.targetId,
        requestId,
        payload: auditPayload,
      });
    });
    return;
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error(
      "PostgreSQL is required to audit assessment evidence access.",
    );
  }
  await mutateDevData((data) => {
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const at = new Date().toISOString();
    const evidenceAccess: AssessmentEvidenceAccessAttestation = {
      ...attestation,
      accessedAt: at,
    };
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at,
        actor: session.sub,
        action: "ASSESSMENT_EVIDENCE_ACCESSED",
        target: binding.targetId,
        evidenceAccess,
      }),
    );
    data.audit.push({
      at,
      actor: session.sub,
      action: "ASSESSMENT_EVIDENCE_ACCESSED",
      target: binding.targetId,
      previousHash,
      hash,
      evidenceAccess,
    });
  });
}

export async function recordRecordingPlayback(
  application: StoredCandidateApplication,
  recording: StoredRecording,
  session: HrSession,
  requestId?: string,
): Promise<void> {
  if (application.organizationId !== session.organizationId) {
    throw new Error("Application belongs to another organization.");
  }
  const binding = recordingPlaybackBindingForTurn(
    application,
    recording.turnNumber,
    recording,
    session.sub,
  );
  const auditPayload = {
    applicationId: binding.applicationId,
    recordingApplicationVersion:
      binding.recordingApplicationVersion,
    turnNumber: binding.turnNumber,
    recordingContentSha256: binding.recordingContentSha256,
    transcriptReceiptSha256: binding.transcriptReceiptSha256,
  };
  if (application.storage === "database") {
    await transaction(async (client) => {
      await appendAuditEvent(client, {
        organizationId: session.organizationId,
        actor: { type: "user", id: session.sub },
        action: "RECORDING_ACCESSED",
        targetType: "application_recording",
        targetId: binding.recordingId,
        requestId,
        payload: auditPayload,
      });
    });
    return;
  }
  if (!isDevelopmentDemoMode()) {
    throw new Error("PostgreSQL is required to audit recording access.");
  }
  await mutateDevData((data) => {
    const previousHash = data.audit.at(-1)?.hash ?? "genesis";
    const at = new Date().toISOString();
    const recordingPlayback: RecordingPlaybackAttestation = {
      ...binding,
      accessedAt: at,
    };
    const hash = sha256(
      JSON.stringify({
        previousHash,
        at,
        actor: session.sub,
        action: "RECORDING_ACCESSED",
        target: binding.recordingId,
        recordingPlayback,
      }),
    );
    data.audit.push({
      at,
      actor: session.sub,
      action: "RECORDING_ACCESSED",
      target: binding.recordingId,
      previousHash,
      hash,
      recordingPlayback,
    });
  });
}
