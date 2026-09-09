import { createHash } from "node:crypto";

import type { AssessmentBlockRun } from "./assessment-orchestrator";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "./assessment-runtime";

export type CandidateBlockExpiryReason =
  | "deadline_expired"
  | "hard_timer_expired";

export interface CandidateBlockControlSnapshot {
  serverNow: string;
  deadlineAt?: string;
  hardTimeLimitSec?: number;
  timerStartedAt?: string;
  timerExpiresAt?: string;
  remainingSec?: number;
  expiredReason?: CandidateBlockExpiryReason;
  maxAttempts: number;
  attemptsUsed: number;
  retakesRemaining: number;
  canStart: boolean;
  canRetake: boolean;
}

function finiteTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function accessibilityMultiplier(
  block: CandidateAssessmentBlock,
): number | null {
  return block.accessibility.extraTimeMultiplier === "untimed"
    ? null
    : block.accessibility.extraTimeMultiplier;
}

/**
 * Returns a whole-block hard limit. Per-answer interview caps remain bound to
 * the recording receipt and question contract; soft SJT timing is intentionally
 * not converted into a hidden hard cutoff.
 */
export function candidateBlockHardTimeLimitSec(
  block: CandidateAssessmentBlock,
): number | null {
  const multiplier = accessibilityMultiplier(block);
  if (multiplier === null) return null;

  let baseSeconds: number | null = null;
  switch (block.manifest.kind) {
    case "live_ai_interview":
      baseSeconds = block.manifest.durationCapMin * 60;
      break;
    case "job_knowledge":
      if (
        block.manifest.timing === "total" &&
        block.manifest.totalTimeMin !== undefined
      ) {
        baseSeconds = block.manifest.totalTimeMin * 60;
      }
      break;
    case "work_sample":
      if (block.manifest.timeModel === "hard_timer") {
        baseSeconds = block.manifest.timeBudgetHours * 60 * 60;
      }
      break;
    case "coding":
      baseSeconds = block.manifest.timeCapMin * 60;
      break;
    case "case_exercise":
      baseSeconds = block.manifest.timeBoxMin * 60;
      break;
    default:
      break;
  }

  return baseSeconds === null
    ? null
    : Math.max(1, Math.ceil(baseSeconds * multiplier));
}

export function candidateBlockDeadlineAt(
  block: CandidateAssessmentBlock,
  applicationCreatedAt: string,
): string | undefined {
  if (block.deadlineOffsetHours === undefined) return undefined;
  const createdAt = finiteTimestamp(applicationCreatedAt);
  if (createdAt === null) {
    throw new Error("Application creation time is invalid.");
  }
  return new Date(
    createdAt + block.deadlineOffsetHours * 60 * 60 * 1_000,
  ).toISOString();
}

export function candidateBlockControls(
  block: CandidateAssessmentBlock,
  run: AssessmentBlockRun,
  applicationCreatedAt: string,
  now = new Date().toISOString(),
): CandidateBlockControlSnapshot {
  const nowMs = finiteTimestamp(now);
  if (nowMs === null) throw new Error("Assessment control time is invalid.");

  const deadlineAt = candidateBlockDeadlineAt(block, applicationCreatedAt);
  const deadlineMs = finiteTimestamp(deadlineAt);
  const hardTimeLimitSec = candidateBlockHardTimeLimitSec(block);
  const startedMs = finiteTimestamp(run.startedAt);
  const timerExpiresMs =
    hardTimeLimitSec !== null && startedMs !== null
      ? startedMs + hardTimeLimitSec * 1_000
      : null;
  const maxAttempts = 1 + block.retakePolicy;
  const deadlineExpired = deadlineMs !== null && nowMs > deadlineMs;
  const timerExpired = timerExpiresMs !== null && nowMs > timerExpiresMs;

  return {
    serverNow: new Date(nowMs).toISOString(),
    ...(deadlineAt ? { deadlineAt } : {}),
    ...(hardTimeLimitSec !== null ? { hardTimeLimitSec } : {}),
    ...(run.startedAt && startedMs !== null
      ? { timerStartedAt: new Date(startedMs).toISOString() }
      : {}),
    ...(timerExpiresMs !== null
      ? {
          timerExpiresAt: new Date(timerExpiresMs).toISOString(),
          remainingSec: Math.max(
            0,
            Math.ceil((timerExpiresMs - nowMs) / 1_000),
          ),
        }
      : {}),
    ...(deadlineExpired
      ? { expiredReason: "deadline_expired" as const }
      : timerExpired
        ? { expiredReason: "hard_timer_expired" as const }
        : {}),
    maxAttempts,
    attemptsUsed: run.attempts,
    retakesRemaining: Math.max(0, maxAttempts - Math.max(1, run.attempts)),
    canStart:
      run.status === "available" &&
      !deadlineExpired &&
      run.attempts < maxAttempts,
    canRetake:
      run.status === "in_progress" &&
      !deadlineExpired &&
      !timerExpired &&
      run.attempts > 0 &&
      run.attempts < maxAttempts,
  };
}

export function startCandidateBlockRun(
  block: CandidateAssessmentBlock,
  run: AssessmentBlockRun,
  input: { restart: boolean; at?: string },
): AssessmentBlockRun {
  const at = input.at ?? new Date().toISOString();
  if (finiteTimestamp(at) === null) {
    throw new Error("Assessment start time is invalid.");
  }
  const maxAttempts = 1 + block.retakePolicy;

  if (!input.restart && run.status === "in_progress") {
    return { ...run };
  }
  if (!input.restart && run.status !== "available") {
    throw new Error("This assessment stage is not available to start.");
  }
  if (input.restart && run.status !== "in_progress") {
    throw new Error("Only an in-progress assessment stage can be restarted.");
  }
  if (run.attempts >= maxAttempts) {
    throw new Error("The published whole-stage attempt limit has been reached.");
  }

  return {
    ...run,
    status: "in_progress",
    attempts: run.attempts + 1,
    startedAt: at,
    candidateCompletedAt: undefined,
    completedAt: undefined,
    blockingReasonCode: undefined,
  };
}

function deterministicOrderKey(
  applicationId: string,
  blockId: string,
  itemId: string,
): string {
  return createHash("sha256")
    .update(`${applicationId}\u0000${blockId}\u0000${itemId}`)
    .digest("hex");
}

/**
 * Creates the application-specific delivery order without changing item IDs,
 * response option IDs, the vacancy fingerprint, or the employer-only answer
 * keys held by the frozen vacancy version.
 */
export function specializeCandidatePlanForApplication(
  plan: CandidateAssessmentPlan,
  applicationId: string,
): CandidateAssessmentPlan {
  const specialized = structuredClone(plan);
  specialized.blocks = specialized.blocks.map((block) => {
    if (
      block.manifest.kind !== "sjt" ||
      !block.manifest.randomizeOrder ||
      block.manifest.items.length < 2
    ) {
      return block;
    }
    return {
      ...block,
      manifest: {
        ...block.manifest,
        items: [...block.manifest.items].sort((left, right) => {
          const leftKey = deterministicOrderKey(
            applicationId,
            block.id,
            left.id,
          );
          const rightKey = deterministicOrderKey(
            applicationId,
            block.id,
            right.id,
          );
          return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
        }),
      },
    };
  });
  return specialized;
}

