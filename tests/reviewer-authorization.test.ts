import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { HrRole } from "../lib/server/auth";
import {
  authorizeReviewer,
  type ReviewerAuthorizationInput,
} from "../lib/server/reviewer-authorization";
import type {
  ApplicationStage,
  GovernanceConfig,
} from "../lib/types";

const governance: GovernanceConfig = {
  roles: [
    {
      userId: "reviewer-1",
      name: "Named reviewer",
      role: "TechnicalReviewer",
      piiReveal: true,
    },
    {
      userId: "blind-reviewer",
      name: "Blind reviewer",
      role: "HiringManager",
      piiReveal: false,
    },
    {
      userId: "observer-1",
      name: "Named observer",
      role: "Observer",
      piiReveal: false,
    },
  ],
  reviewPolicy: { independentReviews: 2, assignment: "by_expertise" },
  calibrationRequired: true,
  dualControlThreshold: 20,
  slaTargets: { reviewQueueHours: 24, dispositionDays: 5 },
  changeControl: {
    editLive: ["Owner"],
    pauseClose: ["Owner", "HiringManager"],
  },
};

function session(
  sub: string,
  role: HrRole,
  piiReveal: boolean,
): ReviewerAuthorizationInput["session"] {
  return {
    sub,
    role,
    piiReveal,
    organizationId: "org-1",
  };
}

function authorization(
  patch: Partial<ReviewerAuthorizationInput> = {},
  stage: ApplicationStage = "under_review",
): ReviewerAuthorizationInput {
  return {
    session: session("reviewer-1", "TechnicalReviewer", true),
    vacancy: {
      id: "vacancy-1",
      configVersion: 7,
      governance,
      scoring: {
        anonymization: {
          maskPII: true,
          revealAtStage: "decision",
        },
      },
    },
    application: {
      id: "application-1",
      organizationId: "org-1",
      vacancyId: "vacancy-1",
      vacancyVersion: 7,
      stage,
    },
    capability: "aggregate_read",
    ...patch,
  };
}

test("Owner administration can read aggregates without a roster duplicate", () => {
  const decision = authorizeReviewer(
    authorization({
      session: session("tenant-owner", "Owner", true),
      application: undefined,
      capability: "aggregate_read",
    }),
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.ownerAdministrativeOverride, true);
});

test("non-owners require an exact named assignment and matching frozen role", () => {
  assert.equal(
    authorizeReviewer(
      authorization({
        session: session("not-assigned", "TechnicalReviewer", true),
      }),
    ).code,
    "REVIEWER_NOT_ASSIGNED",
  );
  assert.equal(
    authorizeReviewer(
      authorization({
        session: session("reviewer-1", "HiringManager", true),
      }),
    ).code,
    "REVIEWER_ROLE_MISMATCH",
  );
  assert.equal(
    authorizeReviewer(
      authorization({
        session: session("observer-1", "Observer", false),
        capability: "aggregate_read",
      }),
    ).allowed,
    true,
  );
  assert.equal(
    authorizeReviewer(
      authorization({
        session: session("observer-1", "Observer", false),
        capability: "assessment_review",
      }),
    ).code,
    "REVIEWER_ROLE_FORBIDDEN",
  );
});

test("calibration-required actions fail closed without a server receipt", () => {
  const missing = authorizeReviewer(
    authorization({
      capability: "evaluation_run",
    }),
  );
  assert.equal(missing.allowed, false);
  assert.equal(missing.code, "REVIEWER_CALIBRATION_REQUIRED");

  const verified = authorizeReviewer(
    authorization({
      capability: "evaluation_run",
      calibrationVerified: true,
    }),
  );
  assert.equal(verified.allowed, true);
});

test("raw evidence requires both PII grants and the configured reveal stage", () => {
  const noSessionGrant = authorizeReviewer(
    authorization({
      session: session("reviewer-1", "TechnicalReviewer", false),
      capability: "evidence_read",
      evidenceMode: "raw",
      calibrationVerified: true,
    }),
  );
  assert.equal(noSessionGrant.code, "PII_REVEAL_REQUIRED");

  const stageLocked = authorizeReviewer(
    authorization(
      {
        capability: "evidence_read",
        evidenceMode: "raw",
        calibrationVerified: true,
      },
      "in_progress",
    ),
  );
  assert.equal(stageLocked.code, "PII_REVEAL_STAGE_LOCKED");

  const decisionStage = authorizeReviewer(
    authorization({
      capability: "evidence_read",
      evidenceMode: "raw",
      calibrationVerified: true,
    }),
  );
  assert.equal(decisionStage.allowed, true);
});

test("invited reveal policy remains locked during review", () => {
  const vacancy = authorization().vacancy;
  const duringReview = authorizeReviewer(
    authorization({
      vacancy: {
        ...vacancy,
        scoring: {
          anonymization: {
            maskPII: true,
            revealAtStage: "invited",
          },
        },
      },
      capability: "evidence_read",
      evidenceMode: "raw",
      calibrationVerified: true,
    }),
  );
  assert.equal(duringReview.code, "PII_REVEAL_STAGE_LOCKED");

  const afterInvite = authorizeReviewer(
    authorization(
      {
        vacancy: {
          ...vacancy,
          scoring: {
            anonymization: {
              maskPII: true,
              revealAtStage: "invited",
            },
          },
        },
        capability: "evidence_read",
        evidenceMode: "raw",
        calibrationVerified: true,
      },
      "invited",
    ),
  );
  assert.equal(afterInvite.allowed, true);
});

test("blind review never falls back to a raw artifact", () => {
  const ownerRaw = authorizeReviewer(
    authorization({
      session: session("tenant-owner", "Owner", true),
      capability: "evidence_read",
      evidenceMode: "raw",
      blindReviewRequired: true,
      deidentifiedEvidenceAvailable: true,
    }),
  );
  assert.equal(ownerRaw.allowed, false);
  assert.equal(ownerRaw.code, "BLIND_REVIEW_DERIVATIVE_REQUIRED");

  const blindDerivative = authorizeReviewer(
    authorization({
      session: session("blind-reviewer", "HiringManager", false),
      capability: "evidence_read",
      evidenceMode: "deidentified",
      blindReviewRequired: true,
      deidentifiedEvidenceAvailable: true,
      calibrationVerified: true,
    }),
  );
  assert.equal(blindDerivative.allowed, true);

  const missingDerivative = authorizeReviewer(
    authorization({
      session: session("blind-reviewer", "HiringManager", false),
      capability: "evidence_read",
      evidenceMode: "deidentified",
      blindReviewRequired: true,
      deidentifiedEvidenceAvailable: false,
      calibrationVerified: true,
    }),
  );
  assert.equal(
    missingDerivative.code,
    "BLIND_REVIEW_DERIVATIVE_REQUIRED",
  );
});

test("tenant and frozen vacancy scope mismatches fail closed", () => {
  const wrongTenant = authorizeReviewer(
    authorization({
      session: {
        ...session("reviewer-1", "TechnicalReviewer", true),
        organizationId: "org-2",
      },
    }),
  );
  assert.equal(wrongTenant.code, "REVIEWER_NOT_ASSIGNED");

  const wrongVersion = authorizeReviewer(
    authorization({
      application: {
        ...authorization().application!,
        vacancyVersion: 6,
      },
    }),
  );
  assert.equal(wrongVersion.code, "REVIEWER_NOT_ASSIGNED");
});

test("every HR surface that reads or mutates candidate evidence invokes the central policy", async () => {
  const guardedRoutes = [
    "app/api/hr/applications/[id]/evaluate/route.ts",
    "app/api/hr/applications/[id]/assessment-reviews/route.ts",
    "app/api/hr/applications/[id]/assessment-evidence/[targetId]/[receiptIndex]/route.ts",
    "app/api/hr/applications/[id]/recordings/[recordingId]/route.ts",
    "app/api/hr/applications/[id]/transcripts/[turnNumber]/verify/route.ts",
    "app/api/hr/applications/[id]/decision/route.ts",
    "app/api/hr/applications/[id]/blocks/[blockId]/observations/route.ts",
    "app/api/hr/applications/[id]/blocks/[blockId]/unlock/route.ts",
    "app/api/hr/vacancies/[id]/applications/route.ts",
  ];
  for (const relative of guardedRoutes) {
    const source = await readFile(path.join(process.cwd(), relative), "utf8");
    assert.match(
      source,
      /(?:assert|authorize)Reviewer(?:Authorized)?\(\{/,
      `${relative} bypasses centralized reviewer authorization`,
    );
  }
  const evaluationRoute = await readFile(
    path.join(
      process.cwd(),
      "app/api/hr/applications/[id]/evaluate/route.ts",
    ),
    "utf8",
  );
  assert.match(
    evaluationRoute,
    /capability: "sensitive_detail"[\s\S]*evidenceMode: "raw"/,
  );
  assert.match(
    evaluationRoute,
    /mayReturnSensitiveEvaluation \? \{ evaluation \} : \{\}/,
  );

  const rankingPage = await readFile(
    path.join(
      process.cwd(),
      "app/(hr)/vacancies/[id]/ranking/page.tsx",
    ),
    "utf8",
  );
  assert.match(rankingPage, /authorizeReviewer\(\{/);

  const candidatePage = await readFile(
    path.join(
      process.cwd(),
      "app/(hr)/vacancies/[id]/candidates/[cid]/page.tsx",
    ),
    "utf8",
  );
  assert.match(
    candidatePage,
    /canAccessCandidateSensitiveDetail\(session, vacancy, application\)/,
  );
});
