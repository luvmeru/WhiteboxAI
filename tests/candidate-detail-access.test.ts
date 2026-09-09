import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { canAccessCandidateSensitiveDetail } from "../lib/server/candidate-detail-access";
import type { HrRole } from "../lib/server/auth";
import type { GovernanceConfig } from "../lib/types";

const governance: GovernanceConfig = {
  roles: [
    {
      userId: "reviewer-assigned",
      name: "Assigned reviewer",
      role: "TechnicalReviewer",
      piiReveal: true,
    },
    {
      userId: "observer-assigned",
      name: "Assigned observer",
      role: "Observer",
      piiReveal: true,
    },
    {
      userId: "reviewer-without-pii",
      name: "Reviewer without PII",
      role: "HiringManager",
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

function principal(
  sub: string,
  role: HrRole,
  piiReveal: boolean,
) {
  return { sub, role, piiReveal, organizationId: "org-1" };
}

test("candidate sensitive detail is limited to PII-enabled named reviewers", () => {
  const vacancy = {
    id: "vacancy-1",
    configVersion: 7,
    governance: { ...governance, calibrationRequired: false },
    scoring: {
      anonymization: {
        maskPII: true,
        revealAtStage: "decision" as const,
      },
    },
  };
  const application = {
    id: "application-1",
    organizationId: "org-1",
    vacancyId: "vacancy-1",
    vacancyVersion: 7,
    stage: "under_review" as const,
  };
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("owner", "Owner", true),
      vacancy,
      application,
    ),
    true,
  );
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("reviewer-assigned", "TechnicalReviewer", true),
      vacancy,
      application,
    ),
    true,
  );
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("observer-assigned", "Observer", true),
      vacancy,
      application,
    ),
    false,
  );
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("reviewer-without-pii", "HiringManager", false),
      vacancy,
      application,
    ),
    false,
  );
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("reviewer-unassigned", "TechnicalReviewer", true),
      vacancy,
      application,
    ),
    false,
  );
  assert.equal(
    canAccessCandidateSensitiveDetail(
      principal("owner", "Owner", true),
      vacancy,
      { ...application, stage: "in_progress" },
    ),
    false,
    "the Owner administrative override must not bypass the configured reveal stage",
  );
});

test("candidate page gates access before serializing raw scorecard props", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "app/(hr)/vacancies/[id]/candidates/[cid]/page.tsx",
    ),
    "utf8",
  );
  assert.match(
    source,
    /session\.role === "Observer" \|\| !session\.piiReveal/,
  );
  const assignmentGate = source.indexOf(
    "!canAccessCandidateSensitiveDetail(session, vacancy, application)",
  );
  const scorecardPayload = source.indexOf("<Scorecard");
  assert.notEqual(assignmentGate, -1);
  assert.notEqual(scorecardPayload, -1);
  assert.ok(
    assignmentGate < scorecardPayload,
    "the server-side access gate must run before raw props enter the RSC payload",
  );
});
