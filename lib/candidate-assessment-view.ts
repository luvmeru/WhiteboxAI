import type { AssessmentBlockRun } from "./server/assessment-orchestrator";
import type {
  CandidateAssessmentBlock,
  CandidateAssessmentPlan,
} from "./server/assessment-runtime";

export const CANDIDATE_FINISHED_RUN_STATUSES = new Set<
  AssessmentBlockRun["status"]
>([
  "submitted",
  "awaiting_ai_review",
  "awaiting_human_review",
  "awaiting_verification",
  "awaiting_external_participants",
  "skipped",
]);

export type CandidateJourneyStepState =
  | "upcoming"
  | "current"
  | "submitted"
  | "awaiting_review"
  | "awaiting_verification"
  | "awaiting_external_participants"
  | "skipped"
  | "employer_action_required";

export interface CandidateJourneyStep {
  id: string;
  title: string;
  candidateIntro: string;
  required: boolean;
  estimatedMinutes: number;
  state: CandidateJourneyStepState;
  stateLabel: string;
  active: boolean;
  candidateComplete: boolean;
  deliveryLabel: string;
}

export type CandidateJourneyBlock = Omit<CandidateAssessmentBlock, "manifest">;
export type CandidateJourneyPlan = Omit<CandidateAssessmentPlan, "blocks"> & {
  blocks: CandidateJourneyBlock[];
};

export interface CandidateAssessmentSnapshot {
  plan: CandidateJourneyPlan;
  blockRuns: AssessmentBlockRun[];
  currentBlockIndex: number;
  currentBlock: CandidateAssessmentBlock | null;
  currentRun: AssessmentBlockRun | null;
  completed: number;
  total: number;
}

/**
 * The journey list intentionally excludes every block manifest. Manifests can
 * contain future questions, options and task material and must only be disclosed
 * through the exact current-block field.
 */
export function candidateJourneyPlan(
  plan: CandidateAssessmentPlan,
): CandidateJourneyPlan {
  return {
    ...plan,
    blocks: plan.blocks.map(({ manifest: _manifest, ...block }) => block),
  };
}

/**
 * Exact task material is released only after a server-owned start transition.
 * Consent and an `available` run are necessary but deliberately insufficient.
 */
export function candidateOpenedAssessmentBlock(input: {
  plan: CandidateAssessmentPlan;
  currentBlockIndex: number;
  currentRunStatus: AssessmentBlockRun["status"] | null | undefined;
  consentAt: string | null | undefined;
}): CandidateAssessmentBlock | null {
  if (!input.consentAt || input.currentRunStatus !== "in_progress") {
    return null;
  }
  const block = input.plan.blocks[input.currentBlockIndex] ?? null;
  if (
    block?.manifest.kind === "async_interview" ||
    block?.manifest.kind === "live_ai_interview" ||
    block?.manifest.kind === "chat_interview"
  ) {
    return {
      ...block,
      manifest: {
        ...block.manifest,
        // The immutable bank remains server-side. The turn endpoint releases
        // only the exact current question after the governed routing decision.
        questions: [],
      },
    } as CandidateAssessmentBlock;
  }
  return block;
}

export type CandidateContinuation =
  | {
      kind: "assessment" | "interview";
      href: string;
      label: string;
    }
  | null;

export function candidateInterviewMayStartAttempt(
  textMode: boolean | null,
  mediaReady: boolean,
): boolean {
  return textMode === true || (textMode === false && mediaReady);
}

function routeQuery(applicationId: string, code: string): string {
  return new URLSearchParams({ applicationId, code }).toString();
}

export function candidateDeliveryLabel(
  block: CandidateJourneyBlock,
): string {
  if (block.delivery.availability === "blocked") {
    return block.required || block.scoring.use !== "context"
      ? "Employer setup required"
      : "Unavailable and skipped";
  }
  switch (block.delivery.state) {
    case "interview_runtime":
      return "Structured interview";
    case "deferred_candidate_input":
      return "Opens at a later stage";
    case "candidate_then_external_participants":
      return "Candidate details, then external responses";
    case "human_coordination_required":
      return "Coordinated by the hiring team";
    case "external_provider_required":
      return "Validated provider required";
    case "employer_configuration_required":
      return "Employer setup required";
    case "candidate_input":
      return "Completed in this application";
  }
}

function stateForRun(run: AssessmentBlockRun): {
  state: CandidateJourneyStepState;
  label: string;
} {
  switch (run.status) {
    case "available":
    case "in_progress":
      return {
        state: "current",
        label: run.status === "in_progress" ? "In progress" : "Ready now",
      };
    case "submitted":
      return { state: "submitted", label: "Submitted" };
    case "awaiting_ai_review":
    case "awaiting_human_review":
      return {
        state: "awaiting_review",
        label:
          run.status === "awaiting_ai_review"
            ? "Saved · human review pending"
            : "Waiting for human review",
      };
    case "awaiting_verification":
      return {
        state: "awaiting_verification",
        label: "Waiting for verification",
      };
    case "awaiting_external_participants":
      return {
        state: "awaiting_external_participants",
        label: "Waiting for external responses",
      };
    case "skipped":
      return {
        state: "skipped",
        label:
          run.skipReason === "optional_unavailable"
            ? "Not offered · skipped automatically"
            : "Skipped by you",
      };
    case "blocked":
      return {
        state: "employer_action_required",
        label: "Hiring team action required",
      };
    case "locked":
      return { state: "upcoming", label: "Upcoming" };
  }
}

export function buildCandidateJourneySteps(
  assessment: CandidateAssessmentSnapshot,
): CandidateJourneyStep[] {
  return assessment.plan.blocks.map((block, index) => {
    const run = assessment.blockRuns[index];
    const runState = run
      ? stateForRun(run)
      : {
          state: "employer_action_required" as const,
          label: "Plan state unavailable",
        };
    return {
      id: block.id,
      title: block.title,
      candidateIntro: block.candidateIntro,
      required: block.required,
      estimatedMinutes: block.estimatedMinutes,
      state: runState.state,
      stateLabel: runState.label,
      active:
        index === assessment.currentBlockIndex &&
        Boolean(assessment.currentBlock),
      candidateComplete: Boolean(
        run && CANDIDATE_FINISHED_RUN_STATUSES.has(run.status),
      ),
      deliveryLabel: candidateDeliveryLabel(block),
    };
  });
}

export function candidateAssessmentPercent(
  assessment: CandidateAssessmentSnapshot,
): number {
  if (assessment.blockRuns.length === 0) return 100;
  const completed = assessment.blockRuns.filter((run) =>
    CANDIDATE_FINISHED_RUN_STATUSES.has(run.status),
  ).length;
  return Math.round((completed / assessment.blockRuns.length) * 100);
}

export function candidateContinuation(input: {
  applicationId: string;
  code: string;
  stage: string;
  consentAt: string | null | undefined;
  assessment?: CandidateAssessmentSnapshot;
}): CandidateContinuation {
  if (input.stage !== "in_progress") return null;
  const query = routeQuery(input.applicationId, input.code);
  if (!input.assessment) {
    return {
      kind: "interview",
      href: `/interview/check?${query}`,
      label: "Continue interview",
    };
  }
  if (!input.consentAt) {
    return {
      kind: "assessment",
      href: `/assessment?${query}`,
      label: "Review plan and consent",
    };
  }
  const { currentBlock, currentRun, currentBlockIndex, plan } =
    input.assessment;
  const currentJourneyBlock =
    currentBlock ?? plan.blocks[currentBlockIndex] ?? null;
  if (
    !currentJourneyBlock ||
    !currentRun ||
    !["available", "in_progress"].includes(currentRun.status)
  ) {
    return null;
  }
  if (
    currentJourneyBlock.kind === "async_interview" ||
    currentJourneyBlock.kind === "live_ai_interview"
  ) {
    return {
      kind: "interview",
      href: `/interview/check?${query}`,
      label:
        currentRun.status === "in_progress"
          ? "Resume interview"
          : "Check devices and start interview",
    };
  }
  return {
    kind: "assessment",
    href: `/assessment?${query}`,
    label:
      currentJourneyBlock.kind === "chat_interview"
        ? "Open structured text interview"
        : "Continue assessment",
  };
}

export function candidateControlledMinutes(
  plan: CandidateJourneyPlan,
): number {
  return plan.blocks
    .filter(
      (block) =>
        block.required &&
        block.delivery.availability === "ready" &&
        (block.delivery.state === "candidate_input" ||
          block.delivery.state === "interview_runtime" ||
          block.delivery.state === "candidate_then_external_participants"),
    )
    .reduce((sum, block) => sum + block.estimatedMinutes, 0);
}
