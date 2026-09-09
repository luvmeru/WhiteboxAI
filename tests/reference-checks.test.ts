import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type {
  PipelineBlock,
  ReferenceCheckSettings,
} from "../lib/types";
import type {
  CandidateAssessmentPlan,
} from "../lib/server/assessment-runtime";
import {
  createCandidateApplication,
  resolveCompetition,
  saveCandidateApplication,
} from "../lib/server/repository";
import {
  ReferenceCheckError,
  getHrReferenceResponseEvidence,
  getPublicReferenceQuestionnaire,
  issueReferenceInvitations,
  submitReferenceResponse,
} from "../lib/server/reference-checks";

Object.assign(process.env, {
  NODE_ENV: "test",
  WBX_DEMO_MODE: "true",
});

function referenceBlock(): PipelineBlock & {
  settings: ReferenceCheckSettings;
} {
  return {
    id: `reference-${randomUUID()}`,
    kind: "reference_check",
    settings: {
      kind: "reference_check",
      referees: {
        count: 1,
        relationships: ["manager"],
      },
      questionnaire: [
        {
          id: "delivery-example",
          text: "Describe a directly observed delivery example.",
          attributeId: "delivery",
          type: "open",
        },
        {
          id: "reliability-rating",
          text: "How consistently did the person follow through?",
          attributeId: "reliability",
          type: "rating",
        },
      ],
      collectionWindowDays: 7,
      fraudControls: true,
      anonymizedAggregation: false,
    },
  } as PipelineBlock & { settings: ReferenceCheckSettings };
}

async function seedSubmittedReferenceApplication(
  block: PipelineBlock & { settings: ReferenceCheckSettings },
  email: string,
) {
  const competition = await resolveCompetition("WBX-3N8D");
  assert.ok(competition);
  const { application } =
    await createCandidateApplication(competition);
  application.assessmentPlan = {
    blocks: [
      {
        id: block.id,
        kind: "reference_check",
      },
    ],
  } as unknown as CandidateAssessmentPlan;
  application.blockResults = [
    {
      blockId: block.id,
      kind: "reference_check",
      completedAt: "2026-07-31T07:59:00.000Z",
      elapsedSec: 30,
      payload: {
        referees: [
          {
            name: "Named manager",
            email,
            relationship: "manager",
            consentConfirmed: true,
          },
        ],
      },
      integrityEvents: [],
    },
  ];
  application.blockRuns = [];
  application.currentBlockIndex = 1;
  application.stage = "under_review";
  const saved = await saveCandidateApplication(
    application,
    application.lockVersion,
    "TEST_REFERENCE_STAGE_SUBMITTED",
  );
  return {
    organizationId: saved.organizationId,
    applicationId: saved.id,
    vacancyId: saved.vacancyId,
    vacancyVersion: saved.vacancyVersion,
    internalCandidateId: saved.internalCandidateId,
  };
}

test("reference invitations are opaque, frozen, expiring, and single-use", async () => {
  const block = referenceBlock();
  const scope = await seedSubmittedReferenceApplication(
    block,
    "named.manager@example.test",
  );
  const applicationId = scope.applicationId;
  const now = new Date("2026-07-31T08:00:00.000Z");
  const [delivery] = await issueReferenceInvitations({
    scope,
    roleTitle: "Principal Reliability Engineer",
    block,
    referees: [
      {
        email: "named.manager@example.test",
        relationship: "manager",
      },
    ],
    requestUrl: "http://127.0.0.1:3100/candidate",
    now,
  });
  assert.ok(delivery);
  assert.equal(
    delivery.deliveryUrl.includes("named.manager"),
    false,
  );
  assert.equal(delivery.deliveryUrl.includes(applicationId), false);
  const token = new URL(delivery.deliveryUrl).pathname
    .split("/")
    .at(-1);
  assert.ok(token);

  const questionnaire =
    await getPublicReferenceQuestionnaire(token!, now);
  assert.equal(
    questionnaire.roleTitle,
    "Principal Reliability Engineer",
  );
  assert.deepEqual(
    questionnaire.questions.map((question) => question.id),
    ["delivery-example", "reliability-rating"],
  );

  const [replacement] = await issueReferenceInvitations({
    scope,
    roleTitle: "Principal Reliability Engineer",
    block,
    referees: [
      {
        email: "named.manager@example.test",
        relationship: "manager",
      },
    ],
    requestUrl: "http://127.0.0.1:3100/candidate",
    now: new Date("2026-07-31T08:10:00.000Z"),
  });
  const replacementToken = new URL(
    replacement.deliveryUrl,
  ).pathname
    .split("/")
    .at(-1)!;
  assert.equal(replacement.invitationId, delivery.invitationId);
  assert.equal(replacement.deliveryUrl, delivery.deliveryUrl);
  assert.equal(
    (
      await getPublicReferenceQuestionnaire(
        replacementToken,
        new Date("2026-07-31T08:11:00.000Z"),
      )
    ).invitationId,
    replacement.invitationId,
  );

  const pointer = await submitReferenceResponse({
    token: replacementToken,
    consent: true,
    relationshipConfirmed: true,
    answers: [
      {
        questionId: "delivery-example",
        unableToObserve: false,
        text: "I observed the person recover a delayed launch and publish a clear prevention plan.",
      },
      {
        questionId: "reliability-rating",
        unableToObserve: false,
        rating: 4,
      },
    ],
    clientAddress: "local-test-client",
    userAgent: "reference-test",
    now: new Date("2026-07-31T09:00:00.000Z"),
  });
  assert.equal(pointer.applicationId, applicationId);
  assert.deepEqual(pointer.sourceItemIds, [
    "delivery-example",
    "reliability-rating",
  ]);
  assert.match(pointer.questionnaireHash, /^[0-9a-f]{64}$/u);
  assert.match(pointer.responseHash, /^[0-9a-f]{64}$/u);

  const evidence = await getHrReferenceResponseEvidence({
    receiptId: pointer.receiptId,
    sourceItemId: "delivery-example",
    organizationId: scope.organizationId,
  });
  assert.equal(evidence?.applicationId, applicationId);
  assert.equal(
    evidence?.answer.type === "open"
      ? evidence.answer.text
      : null,
    "I observed the person recover a delayed launch and publish a clear prevention plan.",
  );
  assert.equal(
    await getHrReferenceResponseEvidence({
      receiptId: pointer.receiptId,
      sourceItemId: "delivery-example",
      organizationId: "other-tenant",
    }),
    null,
  );
  assert.equal(
    await getHrReferenceResponseEvidence({
      receiptId: pointer.receiptId,
      sourceItemId: "unknown-question",
      organizationId: scope.organizationId,
    }),
    null,
  );
  assert.deepEqual(
    await issueReferenceInvitations({
      scope,
      roleTitle: "Principal Reliability Engineer",
      block,
      referees: [
        {
          email: "named.manager@example.test",
          relationship: "manager",
        },
      ],
      requestUrl: "http://127.0.0.1:3100/candidate",
      now: new Date("2026-07-31T09:02:00.000Z"),
    }),
    [],
  );

  await assert.rejects(
    submitReferenceResponse({
      token: replacementToken,
      consent: true,
      relationshipConfirmed: true,
      answers: [],
      now: new Date("2026-07-31T09:05:00.000Z"),
    }),
    (error: unknown) =>
      error instanceof ReferenceCheckError &&
      error.code === "TOKEN_USED",
  );
  const forged = `${replacementToken.slice(0, -1)}${
    replacementToken.endsWith("A") ? "B" : "A"
  }`;
  await assert.rejects(
    getPublicReferenceQuestionnaire(forged, now),
    (error: unknown) =>
      error instanceof ReferenceCheckError &&
      error.code === "INVALID_TOKEN",
  );
});

test("expired invitations and incomplete answers fail closed", async () => {
  const block = referenceBlock();
  const scope = await seedSubmittedReferenceApplication(
    block,
    "manager@example.test",
  );
  const issuedAt = new Date("2026-07-01T00:00:00.000Z");
  const [delivery] = await issueReferenceInvitations({
    scope,
    roleTitle: "Operations Lead",
    block,
    referees: [
      {
        email: "manager@example.test",
        relationship: "manager",
      },
    ],
    requestUrl: "http://127.0.0.1:3100/",
    now: issuedAt,
  });
  const token = new URL(delivery.deliveryUrl).pathname
    .split("/")
    .at(-1)!;
  await assert.rejects(
    getPublicReferenceQuestionnaire(
      token,
      new Date("2026-07-09T00:00:00.000Z"),
    ),
    (error: unknown) =>
      error instanceof ReferenceCheckError &&
      error.code === "TOKEN_EXPIRED",
  );

  const freshScope =
    await seedSubmittedReferenceApplication(
      block,
      "manager@example.test",
    );
  const fresh = (
    await issueReferenceInvitations({
      scope: freshScope,
      roleTitle: "Operations Lead",
      block,
      referees: [
        {
          email: "manager@example.test",
          relationship: "manager",
        },
      ],
      requestUrl: "http://127.0.0.1:3100/",
      now: new Date("2026-07-31T00:00:00.000Z"),
    })
  )[0];
  const freshToken = new URL(fresh.deliveryUrl).pathname
    .split("/")
    .at(-1)!;
  await assert.rejects(
    submitReferenceResponse({
      token: freshToken,
      consent: true,
      relationshipConfirmed: true,
      answers: [
        {
          questionId: "delivery-example",
          unableToObserve: false,
          text: "too short",
        },
        {
          questionId: "reliability-rating",
          unableToObserve: false,
          rating: 4,
        },
      ],
      now: new Date("2026-07-31T01:00:00.000Z"),
    }),
    (error: unknown) =>
      error instanceof ReferenceCheckError &&
      error.code === "INVALID_RESPONSE",
  );
});

test("an invitation without a committed submitted block is unusable", async () => {
  const block = referenceBlock();
  await assert.rejects(
    issueReferenceInvitations({
      scope: {
        organizationId: "org-orphan-test",
        applicationId: `app-${randomUUID()}`,
        vacancyId: `vacancy-${randomUUID()}`,
        vacancyVersion: 1,
        internalCandidateId: `candidate-${randomUUID()}`,
      },
      roleTitle: "Security Engineer",
      block,
      referees: [
        {
          email: "manager@example.test",
          relationship: "manager",
        },
      ],
      requestUrl: "http://127.0.0.1:3100/",
      now: new Date("2026-07-31T00:00:00.000Z"),
    }),
    (error: unknown) =>
      error instanceof ReferenceCheckError &&
      error.code === "INVALID_TOKEN",
  );
});
