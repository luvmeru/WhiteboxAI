import assert from "node:assert/strict";
import { test } from "node:test";

import { createBlock } from "../lib/blocks";
import { BUILT_IN_PRESETS } from "../lib/presets";
import { preflight } from "../lib/studio";
import type { VacancyV2 } from "../lib/types";

function presetVacancy(): VacancyV2 {
  const preset = BUILT_IN_PRESETS.find(
    (candidate) => candidate.id === "preset-senior-backend",
  );
  assert.ok(preset);
  return structuredClone(preset.payload) as VacancyV2;
}

test("publish preflight blocks configured controls without an execution contract", () => {
  const vacancy = presetVacancy();
  const cv = vacancy.pipeline.find((block) => block.kind === "cv_intake");
  const coding = vacancy.pipeline.find((block) => block.kind === "coding");
  assert.ok(cv);
  assert.ok(coding);
  assert.equal(cv.settings.kind, "cv_intake");
  assert.equal(coding.settings.kind, "coding");
  if (
    cv.settings.kind !== "cv_intake" ||
    coding.settings.kind !== "coding"
  ) {
    throw new Error("Expected CV and coding blocks.");
  }
  cv.settings.parseTargets = ["employment"];
  cv.settings.extractClaims = true;
  coding.settings.similarityCheck = true;

  const issues = preflight(vacancy);
  assert.ok(
    issues.some(
      (issue) =>
        issue.severity === "blocker" &&
        issue.id === `pf-runtime-cv-parse-${cv.id}`,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.severity === "blocker" &&
        issue.id === `pf-runtime-similarity-${coding.id}`,
    ),
  );
});

test("anonymous reference aggregation fails closed until a governed aggregate exists", () => {
  const vacancy = presetVacancy();
  const references = createBlock(
    "reference_check",
    vacancy.pipeline.length + 1,
  );
  references.required = false;
  references.scored = false;
  if (references.settings.kind !== "reference_check") {
    throw new Error("Expected a reference-check block.");
  }
  references.settings.anonymizedAggregation = true;
  vacancy.pipeline.push(references);

  const ids = new Set(preflight(vacancy).map((issue) => issue.id));
  assert.ok(ids.has(`pf-runtime-reference-aggregation-${references.id}`));
});

test("coding split must be executable and automatic human interview kits fail closed", () => {
  const vacancy = presetVacancy();
  const coding = vacancy.pipeline.find(
    (block) => block.settings.kind === "coding",
  );
  const human = vacancy.pipeline.find(
    (block) => block.settings.kind === "human_stage",
  );
  assert.ok(coding);
  assert.ok(human);
  if (
    coding.settings.kind !== "coding" ||
    human.settings.kind !== "human_stage"
  ) {
    throw new Error("Expected coding and human-stage blocks.");
  }
  coding.settings.scoringSplit = {
    correctness: 80,
    quality: 30,
    approach: 20,
  };
  delete coding.settings.rubricDimensions[0]!.codingScoringArea;
  human.settings.interviewKitAuto = true;

  const ids = new Set(preflight(vacancy).map((issue) => issue.id));
  assert.ok(ids.has(`pf-runtime-coding-split-${coding.id}`));
  assert.ok(
    ids.has(
      `pf-runtime-coding-dimension-area-${coding.id}-${coding.settings.rubricDimensions[0]!.id}`,
    ),
  );
  assert.ok(ids.has(`pf-human-interview-kit-${human.id}`));
});

test("publish preflight rejects untouched editor sentinels across criteria and blocks", () => {
  const vacancy = presetVacancy();
  const category = vacancy.categories[0]!;
  const attribute = category.attributes[0]!;
  category.name = " New category. ";
  attribute.name = "New attribute";
  attribute.definition = "Describe observable behavior.";
  attribute.scale.anchors = [
    "No evidence",
    "Limited evidence",
    "Adequate evidence",
    "Strong evidence",
    "Exceptional evidence",
  ];

  const form = createBlock(
    "application_form",
    vacancy.pipeline.length + 1,
  );
  form.required = false;
  form.scored = false;
  if (form.settings.kind !== "application_form") {
    throw new Error("Expected an application form.");
  }
  form.settings.fields = [
    {
      id: "sentinel-field",
      label: "New field",
      type: "single_choice",
      required: false,
      pii: false,
      scored: false,
      options: [
        { id: "sentinel-a", text: "Response option 1" },
        { id: "sentinel-b", text: "Option B" },
      ],
    },
  ];
  vacancy.pipeline.push(form);

  const sjt = createBlock("sjt", vacancy.pipeline.length + 1);
  sjt.required = false;
  sjt.scored = false;
  if (sjt.settings.kind !== "sjt") {
    throw new Error("Expected an SJT block.");
  }
  sjt.settings.items = [
    {
      id: "sentinel-sjt",
      scenario: "Untitled scenario",
      mediaKind: "text",
      attributeId: attribute.id,
      smeReviewed: false,
      options: [
        { id: "sjt-a", text: "Response option 1", keyScore: 0 },
        { id: "sjt-b", text: "Response option 2", keyScore: 1 },
        { id: "sjt-c", text: "Response option 3", keyScore: 2 },
        { id: "sjt-d", text: "Response option 4", keyScore: 3 },
      ],
    },
  ];
  vacancy.pipeline.push(sjt);

  const coding = vacancy.pipeline.find(
    (block) => block.settings.kind === "coding",
  );
  assert.ok(coding);
  if (coding.settings.kind !== "coding") {
    throw new Error("Expected a coding block.");
  }
  coding.settings.rubricDimensions[0]!.name = "New evidence dimension";
  coding.settings.rubricDimensions[0]!.anchors = [
    "No usable evidence",
    "Limited evidence",
    "Meets the minimum",
    "Strong evidence",
    "Exceptional evidence",
  ];

  const ids = new Set(preflight(vacancy).map((issue) => issue.id));
  for (const id of [
    `pf-placeholder-category-${category.id}`,
    `pf-placeholder-attribute-name-${attribute.id}`,
    `pf-placeholder-attribute-definition-${attribute.id}`,
    `pf-placeholder-attribute-anchors-${attribute.id}`,
    `pf-placeholder-form-field-${form.id}-sentinel-field`,
    `pf-placeholder-form-options-${form.id}-sentinel-field`,
    `pf-placeholder-sjt-${sjt.id}-sentinel-sjt`,
    `pf-placeholder-rubric-${coding.id}-${coding.settings.rubricDimensions[0]!.id}`,
  ]) {
    assert.ok(ids.has(id), `Missing sentinel blocker ${id}`);
  }
});

test("publish preflight rejects interview controls that the candidate runtime does not execute", () => {
  const vacancy = presetVacancy();
  const asyncBlock = vacancy.pipeline.find(
    (block) => block.settings.kind === "async_interview",
  );
  assert.ok(asyncBlock);
  if (asyncBlock.settings.kind !== "async_interview") {
    throw new Error("Expected an async interview block.");
  }
  asyncBlock.settings.order = "randomized";
  asyncBlock.settings.introVideo = "recruiter";
  asyncBlock.settings.practiceQuestion = true;
  asyncBlock.settings.pauseAllowance = 1;
  asyncBlock.settings.reviewBeforeSubmit = true;

  const liveBlock = createBlock(
    "live_ai_interview",
    vacancy.pipeline.length + 1,
  );
  liveBlock.required = false;
  liveBlock.scored = false;
  if (liveBlock.settings.kind !== "live_ai_interview") {
    throw new Error("Expected a live interview block.");
  }
  liveBlock.settings.adaptivity = "probe_reorder";
  liveBlock.settings.latencyFallback = "chat";
  liveBlock.settings.bargeInAllowed = true;
  vacancy.pipeline.push(liveBlock);

  const ids = new Set(preflight(vacancy).map((issue) => issue.id));
  for (const id of [
    `pf-runtime-async-order-${asyncBlock.id}`,
    `pf-runtime-async-intro-${asyncBlock.id}`,
    `pf-runtime-async-practice-${asyncBlock.id}`,
    `pf-runtime-async-pauses-${asyncBlock.id}`,
    `pf-runtime-async-review-${asyncBlock.id}`,
    `pf-runtime-live-reorder-${liveBlock.id}`,
    `pf-runtime-live-fallback-${liveBlock.id}`,
    `pf-runtime-live-barge-in-${liveBlock.id}`,
  ]) {
    assert.ok(ids.has(id), `Missing preflight blocker ${id}`);
  }
});

test("publish preflight rejects incomplete repository and case subtype evidence contracts", () => {
  const vacancy = presetVacancy();
  const coding = vacancy.pipeline.find(
    (block) => block.settings.kind === "coding",
  );
  assert.ok(coding);
  if (coding.settings.kind !== "coding") {
    throw new Error("Expected a coding block.");
  }
  coding.settings.similarityCheck = false;
  coding.settings.environment = "take_home_repo";
  coding.settings.taskSource = "bank";

  const caseBlock = createBlock(
    "case_exercise",
    vacancy.pipeline.length + 1,
  );
  caseBlock.required = false;
  caseBlock.scored = false;
  if (caseBlock.settings.kind !== "case_exercise") {
    throw new Error("Expected a case exercise block.");
  }
  vacancy.pipeline.push(caseBlock);
  const documentBlock = createBlock(
    "doc_verification",
    vacancy.pipeline.length + 1,
  );
  documentBlock.required = false;
  documentBlock.scored = false;
  if (documentBlock.settings.kind !== "doc_verification") {
    throw new Error("Expected a document block.");
  }
  documentBlock.settings.acceptedFormats = ["pdf", "jpg"];
  documentBlock.settings.mode = "auto_extract_match";
  documentBlock.settings.idCheck = true;
  vacancy.pipeline.push(documentBlock);
  const sjtBlock = createBlock("sjt", vacancy.pipeline.length + 1);
  sjtBlock.required = false;
  sjtBlock.scored = false;
  if (sjtBlock.settings.kind !== "sjt") {
    throw new Error("Expected an SJT block.");
  }
  sjtBlock.settings.timing = "soft_per_item";
  vacancy.pipeline.push(sjtBlock);

  for (const [format, expectedId] of [
    ["in_basket", `pf-runtime-in-basket-${caseBlock.id}`],
    ["role_play", `pf-runtime-role-play-${caseBlock.id}`],
    ["presentation", `pf-runtime-presentation-${caseBlock.id}`],
  ] as const) {
    caseBlock.settings.format = format;
    const ids = new Set(preflight(vacancy).map((issue) => issue.id));
    assert.ok(ids.has(`pf-runtime-take-home-repo-${coding.id}`));
    assert.ok(ids.has(`pf-runtime-coding-provenance-${coding.id}`));
    assert.ok(
      ids.has(`pf-runtime-document-format-${documentBlock.id}`),
    );
    assert.ok(ids.has(`pf-runtime-document-provider-${documentBlock.id}`));
    assert.ok(ids.has(`pf-runtime-document-id-${documentBlock.id}`));
    assert.ok(ids.has(`pf-runtime-sjt-soft-timing-${sjtBlock.id}`));
    assert.ok(ids.has(expectedId), `Missing preflight blocker ${expectedId}`);
  }
});

test("knockout placement must agree with the executable pipeline order", () => {
  const vacancy = presetVacancy();
  const knockout = vacancy.pipeline.find(
    (block) => block.settings.kind === "knockout",
  );
  assert.ok(knockout);
  if (knockout.settings.kind !== "knockout") {
    throw new Error("Expected a knockout block.");
  }
  knockout.settings.placement = "after_form";

  const form = createBlock("application_form", vacancy.pipeline.length + 1);
  form.required = false;
  form.scored = false;
  vacancy.pipeline.push(form);

  const ids = new Set(preflight(vacancy).map((issue) => issue.id));
  assert.ok(ids.has(`pf-knockout-placement-${knockout.id}`));
});
