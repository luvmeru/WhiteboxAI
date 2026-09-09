import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applicationAiExecutionMode,
  applyPublicationAiPolicy,
  vacancyAiExecutionMode,
} from "../lib/server/ai-rollout";
import type { VacancyV2 } from "../lib/types";

function vacancy(id: string): VacancyV2 {
  return {
    id,
    code: "",
    status: "DRAFT",
    configVersion: 1,
    profile: {
      title: "Test role",
      openings: 1,
      seniority: "Senior",
      employmentType: "full_time",
      workMode: "hybrid",
      locations: [],
      mission: "Build and operate a test system.",
      responsibilities: ["Deliver observable outcomes."],
      industryPack: "tech",
      languages: { primary: "en", alternates: [] },
    },
    categories: [],
    pipeline: [],
    scoring: {
      topology: "hybrid",
      weighting: "rational",
      threshold: 65,
      tieBreakers: [],
      anonymization: { maskPII: true, revealAtStage: "decision" },
      abstainPolicy: {
        minEvidencePerAttribute: 1,
        onAbstain: "flag_human",
      },
      normalization: "absolute_rubric",
    },
    experience: {
      landing: { showCompensation: false, companyBlurb: "" },
      notices: {
        jurisdictionProfile: "EU",
        aiDisclosure: "AI-assisted structured assessment.",
        retentionDays: 30,
        consentCheckpoints: ["entry"],
        version: 1,
      },
      comms: {
        confirmationEnabled: true,
        reminderCadence: 1,
        dispositionSlaDays: 5,
        feedbackOffer: true,
        senderIdentity: "org",
      },
      tone: "neutral",
    },
    governance: {
      roles: [],
      reviewPolicy: {
        independentReviews: 1,
        assignment: "round_robin",
      },
      calibrationRequired: true,
      dualControlThreshold: 25,
      slaTargets: { reviewQueueHours: 48, dispositionDays: 5 },
      changeControl: { editLive: ["Owner"], pauseClose: ["Owner"] },
    },
    distribution: [],
    window: {
      opensAt: "2026-07-31T00:00:00.000Z",
      closesAt: "2026-08-31T00:00:00.000Z",
      timezone: "UTC",
    },
    rollingReview: true,
    audit: [],
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

test("an existing vacancy without a marker remains deterministic", () => {
  const existing = vacancy("vac-legacy");
  const clientPayload = {
    ...existing,
    configVersion: 2,
    aiExecution: {
      mode: "openai_required",
      policyVersion: "openai-required-v1",
      assignedAt: "2026-07-31T10:00:00.000Z",
    },
  } satisfies VacancyV2;

  const published = applyPublicationAiPolicy(clientPayload, existing);

  assert.equal(published.aiExecution, undefined);
  assert.equal(vacancyAiExecutionMode(published), "legacy_deterministic");
});

test("a new vacancy is stamped as real-provider-only", () => {
  const published = applyPublicationAiPolicy(
    vacancy("vac-new"),
    null,
    "2026-07-31T10:00:00.000Z",
  );

  assert.deepEqual(published.aiExecution, {
    mode: "openai_required",
    policyVersion: "openai-required-v1",
    assignedAt: "2026-07-31T10:00:00.000Z",
  });
  assert.equal(vacancyAiExecutionMode(published), "openai_required");
});

test("a real-provider vacancy cannot be downgraded by a later payload", () => {
  const existing = applyPublicationAiPolicy(vacancy("vac-real"), null);
  const payload = vacancy("vac-real");
  payload.configVersion = 2;

  const published = applyPublicationAiPolicy(payload, existing);

  assert.deepEqual(published.aiExecution, existing.aiExecution);
});

test("applications created before the rollout default to legacy mode", () => {
  assert.equal(applicationAiExecutionMode(undefined), "legacy_deterministic");
  assert.equal(
    applicationAiExecutionMode("openai_required"),
    "openai_required",
  );
});
