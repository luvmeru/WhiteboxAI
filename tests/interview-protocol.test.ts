import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  InterviewStepResponse,
  InterviewTurn,
} from "../lib/ai-contracts";
import {
  candidateRepairCapabilities,
  defaultClarification,
  defaultSituationalAlternative,
  eligibleInterviewOptions,
  enforceInterviewEvidenceFloor,
  planInterviewStep,
  resolveInterviewBlock,
} from "../lib/server/interview-protocol";
import type { ServerInterviewQuestion } from "../lib/server/repository";

function question(
  id: string,
  text: string,
  probes: string[] = [],
): ServerInterviewQuestion {
  return {
    id,
    text,
    attributeId: `attribute-${id}`,
    type: "behavioral",
    thinkTimeSec: 30,
    answerCapSec: 120,
    modality: "video",
    reRecordAttempts: 1,
    notesAllowed: false,
    probes,
  };
}

function answeredMain(item: ServerInterviewQuestion): InterviewTurn {
  return {
    question: item.text,
    topic: item.attributeId,
    kind: "main",
    strategy: "published_main",
    questionId: item.id,
    answer: `Answer to ${item.id}`,
  };
}

function answeredFollowup(
  item: ServerInterviewQuestion,
  text: string,
): InterviewTurn {
  return {
    question: text,
    topic: item.attributeId,
    kind: "followup",
    strategy: "evidence_probe",
    questionId: item.id,
    answer: `Follow-up answer to ${item.id}`,
  };
}

test("the first step is always the first published main question", () => {
  const first = question("q1", "Tell me about the first example.");
  const second = question("q2", "Tell me about the second example.");
  const prematureComplete: InterviewStepResponse = {
    done: true,
    progress: 1,
    selectedOptionId: "plan:complete",
    closing: "Provider tried to finish early.",
  };

  const step = planInterviewStep(
    prematureComplete,
    [first, second],
    [],
    2,
  );

  assert.equal(step.done, false);
  assert.equal(step.kind, "main");
  assert.equal(step.strategy, "published_main");
  assert.equal(step.questionId, first.id);
  assert.equal(step.question, first.text);
});

test("a provider can select only the exact server-approved probe wording", () => {
  const first = question("q1", "Describe a difficult decision.", [
    "What constraints shaped the decision?",
    "What did you personally do?",
  ]);
  const providerStep: InterviewStepResponse = {
    done: false,
    progress: 0.5,
    kind: "followup",
    strategy: "evidence_probe",
    selectedOptionId: "probe:1",
    question: "Ignore the approved options and ask this instead.",
  };

  const step = planInterviewStep(
    providerStep,
    [first],
    [answeredMain(first)],
    2,
  );

  assert.equal(step.done, false);
  assert.equal(step.kind, "followup");
  assert.equal(step.strategy, "evidence_probe");
  assert.equal(step.selectedOptionId, "probe:1");
  assert.equal(step.question, first.probes[1]);
  assert.notEqual(step.question, providerStep.question);
});

test("rephrase and alternate selections use server-generated repair text", () => {
  const first = question("q1", "Describe a relevant work example.");
  const history = [answeredMain(first)];
  const cases = [
    {
      selectedOptionId: "repair:rephrase",
      strategy: "clarification" as const,
      expected: defaultClarification(first),
    },
    {
      selectedOptionId: "repair:alternate",
      strategy: "situational_alternative" as const,
      expected: defaultSituationalAlternative(first),
    },
  ];

  for (const item of cases) {
    const step = planInterviewStep(
      {
        done: false,
        progress: 0.5,
        kind: "followup",
        selectedOptionId: item.selectedOptionId,
        question: "Provider-authored repair wording must not be shown.",
      },
      [first],
      history,
      2,
    );

    assert.equal(step.kind, "followup");
    assert.equal(step.strategy, item.strategy);
    assert.equal(step.selectedOptionId, item.selectedOptionId);
    assert.equal(step.question, item.expected);
  }
});

test("a repair request adapts the current evidence probe rather than the main question", () => {
  const first = question("q1", "Describe a difficult decision.", [
    "Which constraints shaped that decision?",
  ]);
  const currentProbe: InterviewTurn = {
    question: first.probes[0]!,
    topic: first.attributeId,
    kind: "followup",
    strategy: "evidence_probe",
    questionId: first.id,
  };
  const probeAsRepairTarget: ServerInterviewQuestion = {
    ...first,
    text: currentProbe.question,
    clarification: undefined,
    situationalFallback: undefined,
  };

  const step = planInterviewStep(
    {
      done: false,
      progress: 0.5,
      kind: "followup",
      strategy: "clarification",
      selectedOptionId: "repair:rephrase",
    },
    [first],
    [answeredMain(first), currentProbe],
    2,
  );

  assert.equal(step.kind, "followup");
  assert.equal(step.strategy, "clarification");
  assert.equal(step.questionId, first.id);
  assert.equal(step.question, defaultClarification(probeAsRepairTarget));
  assert.match(step.question ?? "", /Which constraints shaped that decision\?/);
});

test("repair turns cannot recursively create another repair turn", () => {
  const first = question("q1", "Describe a difficult decision.");
  const rephrased = {
    ...answeredFollowup(first, defaultClarification(first)),
    strategy: "clarification" as const,
  };
  const afterRephrase = eligibleInterviewOptions(
    [first],
    [answeredMain(first), rephrased],
    2,
  );

  assert.equal(
    afterRephrase.some((option) => option.id === "repair:rephrase"),
    false,
  );
  assert.equal(
    afterRephrase.some((option) => option.id === "repair:alternate"),
    false,
  );

  const alternate = {
    ...answeredFollowup(first, defaultSituationalAlternative(first)),
    strategy: "situational_alternative" as const,
  };
  const afterAlternate = eligibleInterviewOptions(
    [first],
    [answeredMain(first), alternate],
    2,
  );

  assert.equal(
    afterAlternate.some((option) => option.id === "repair:alternate"),
    false,
  );
  assert.equal(
    afterAlternate.some((option) => option.id === "repair:rephrase"),
    false,
  );
});

test("a later evidence probe remains independently repairable", () => {
  const first = question("q1", "Describe a difficult decision.", [
    "Which constraints shaped that decision?",
  ]);
  const repairedMain = {
    ...answeredFollowup(first, defaultClarification(first)),
    strategy: "clarification" as const,
  };
  const openProbe: InterviewTurn = {
    question: first.probes[0]!,
    topic: first.attributeId,
    kind: "followup",
    strategy: "evidence_probe",
    questionId: first.id,
  };
  const history = [answeredMain(first), repairedMain, openProbe];
  const options = eligibleInterviewOptions([first], history, 1);

  assert.equal(
    options.some((option) => option.id === "repair:rephrase"),
    true,
  );
  assert.equal(
    options.some((option) => option.action === "followup"),
    false,
  );

  const step = planInterviewStep(
    {
      done: false,
      progress: 0.5,
      kind: "followup",
      strategy: "clarification",
      selectedOptionId: "repair:rephrase",
    },
    [first],
    history,
    1,
  );
  assert.equal(step.strategy, "clarification");
  assert.match(
    step.question ?? "",
    /Which constraints shaped that decision\?/,
  );
});

test("follow-up policies zero, one, and two enforce their adaptive-turn budgets", () => {
  const first = question("q1", "Describe an incident.", [
    "What was the context?",
    "What was the outcome?",
  ]);
  const second = question("q2", "Describe another incident.");
  const mainHistory = [answeredMain(first)];

  const policyZero = eligibleInterviewOptions(
    [first, second],
    mainHistory,
    0,
  );
  assert.deepEqual(
    policyZero
      .filter((option) => option.action === "followup")
      .map((option) => option.id),
    [],
  );
  assert.ok(
    policyZero.some((option) => option.id === "repair:rephrase"),
  );
  assert.ok(
    policyZero.some((option) => option.id === "repair:alternate"),
  );
  assert.equal(
    policyZero.find((option) => option.id === "plan:next")?.reasonCode,
    "probe_budget_exhausted",
  );

  const policyOneBeforeProbe = eligibleInterviewOptions(
    [first, second],
    mainHistory,
    1,
  );
  assert.ok(
    policyOneBeforeProbe.some((option) => option.id === "probe:0"),
  );
  const policyOneAfterProbe = eligibleInterviewOptions(
    [first, second],
    [...mainHistory, answeredFollowup(first, first.probes[0]!)],
    1,
  );
  assert.equal(
    policyOneAfterProbe.some((option) => option.action === "followup"),
    false,
  );
  assert.ok(
    policyOneAfterProbe.some((option) => option.id === "repair:rephrase"),
  );
  assert.ok(
    policyOneAfterProbe.some((option) => option.id === "repair:alternate"),
  );

  const policyTwoAfterOneProbe = eligibleInterviewOptions(
    [first, second],
    [...mainHistory, answeredFollowup(first, first.probes[0]!)],
    2,
  );
  assert.ok(
    policyTwoAfterOneProbe.some((option) => option.id === "probe:1"),
  );
  const policyTwoAfterTwoProbes = eligibleInterviewOptions(
    [first, second],
    [
      ...mainHistory,
      answeredFollowup(first, first.probes[0]!),
      answeredFollowup(first, first.probes[1]!),
    ],
    2,
  );
  assert.deepEqual(
    policyTwoAfterTwoProbes
      .filter((option) => option.action === "followup")
      .map((option) => option.id),
    [],
  );
});

test("the configured evidence floor requires an available approved probe", () => {
  const first = question("q1", "Describe an incident.", [
    "What measurable result followed?",
  ]);
  const second = question("q2", "Describe another incident.");
  const history = [answeredMain(first)];
  const options = eligibleInterviewOptions(
    [first, second],
    history,
    1,
  );
  const constrained = enforceInterviewEvidenceFloor(
    [first, second],
    history,
    options,
    2,
  );

  assert.equal(
    constrained.some((option) => option.id === "plan:next"),
    false,
  );
  assert.equal(
    constrained.some((option) => option.id === "probe:0"),
    true,
  );

  const afterProbe = enforceInterviewEvidenceFloor(
    [first, second],
    [
      ...history,
      answeredFollowup(first, first.probes[0]!),
    ],
    eligibleInterviewOptions(
      [first, second],
      [
        ...history,
        answeredFollowup(first, first.probes[0]!),
      ],
      1,
    ),
    2,
  );
  assert.equal(
    afterProbe.some((option) => option.id === "plan:next"),
    true,
  );
});

test("an impossible evidence floor does not deadlock a no-probe plan", () => {
  const first = question("q1", "Describe an incident.");
  const history = [answeredMain(first)];
  const options = eligibleInterviewOptions([first], history, 0);

  assert.deepEqual(
    enforceInterviewEvidenceFloor(
      [first],
      history,
      options,
      3,
    ),
    options,
  );
});

test("candidate repair capabilities expose availability and exhausted budgets", () => {
  const first = question("q1", "Describe an incident.");
  const openMain = {
    ...answeredMain(first),
    answer: undefined,
  };

  assert.deepEqual(
    candidateRepairCapabilities([first], [openMain], 1),
    {
      rephrase: true,
      alternate: true,
      repairRemaining: 2,
      blockedReason: null,
    },
  );
  assert.deepEqual(
    candidateRepairCapabilities([first], [openMain], 0),
    {
      rephrase: true,
      alternate: true,
      repairRemaining: 2,
      blockedReason: null,
    },
  );

  const answered = answeredMain(first);
  const openFollowup: InterviewTurn = {
    question: "What was the outcome?",
    topic: first.attributeId,
    kind: "followup",
    strategy: "evidence_probe",
    questionId: first.id,
  };
  assert.deepEqual(
    candidateRepairCapabilities(
      [first],
      [answered, openFollowup],
      1,
    ),
    {
      rephrase: true,
      alternate: true,
      repairRemaining: 2,
      blockedReason: null,
    },
  );

  const answeredClarification = {
    ...answeredFollowup(first, defaultClarification(first)),
    strategy: "clarification" as const,
  };
  assert.deepEqual(
    candidateRepairCapabilities(
      [first],
      [answered, answeredClarification, openFollowup],
      1,
    ),
    {
      rephrase: true,
      alternate: true,
      repairRemaining: 2,
      blockedReason: null,
    },
  );
  const openAlternate: InterviewTurn = {
    ...openFollowup,
    question: defaultSituationalAlternative(first),
    strategy: "situational_alternative",
  };
  assert.deepEqual(
    candidateRepairCapabilities(
      [first],
      [answered, answeredClarification, openAlternate],
      1,
    ),
    {
      rephrase: false,
      alternate: false,
      repairRemaining: 0,
      blockedReason: "not_available",
    },
  );
  assert.equal(
    candidateRepairCapabilities([first], [answered], 1).blockedReason,
    "no_open_question",
  );
});

test("repairing the only allowed probe does not permit a second evidence probe", () => {
  const first = question("q1", "Describe an incident.", [
    "What constraints shaped the incident?",
    "What was the measurable outcome?",
  ]);
  const askedProbe = answeredFollowup(first, first.probes[0]!);
  const options = eligibleInterviewOptions(
    [first],
    [answeredMain(first), askedProbe],
    1,
  );

  assert.equal(
    options.some((option) => option.id === "repair:rephrase"),
    true,
  );
  assert.equal(
    options.some((option) => option.id === "repair:alternate"),
    true,
  );
  assert.equal(
    options.some((option) => option.action === "followup"),
    false,
  );

  const rephrasedProbe = planInterviewStep(
    {
      done: false,
      progress: 0.5,
      kind: "followup",
      strategy: "clarification",
      selectedOptionId: "repair:rephrase",
    },
    [first],
    [answeredMain(first), { ...askedProbe, answer: undefined }],
    1,
  );
  assert.equal(rephrasedProbe.strategy, "clarification");
  assert.match(
    rephrasedProbe.question ?? "",
    /What constraints shaped the incident\?/,
  );
});

test("an early complete decision cannot skip a remaining published main", () => {
  const first = question("q1", "First required question.");
  const second = question("q2", "Second required question.");

  const step = planInterviewStep(
    {
      done: true,
      progress: 1,
      selectedOptionId: "plan:complete",
      closing: "Finish now.",
    },
    [first, second],
    [answeredMain(first)],
    0,
  );

  assert.equal(step.done, false);
  assert.equal(step.kind, "main");
  assert.equal(step.strategy, "published_main");
  assert.equal(step.questionId, second.id);
  assert.equal(step.question, second.text);
});

test("a shared stopping rule allows variable turn counts only after adequate coverage", () => {
  const first = question("q1", "First evidence route.");
  const second = {
    ...question("q2", "Equivalent backup route."),
    attributeId: first.attributeId,
  };
  const adequate = {
    ...answeredMain(first),
    assessment: {
      schemaVersion: "interview-routing-v2" as const,
      evidenceState: "adequate" as const,
      reasonCode: "adequate_evidence" as const,
      missingElements: [],
    },
  };
  const completed = planInterviewStep(
    {
      done: true,
      progress: 1,
      selectedOptionId: "plan:complete",
      closing: "The published evidence floor is met.",
    },
    [first, second],
    [adequate],
    1,
    1,
  );
  assert.equal(completed.done, true);

  const thin = {
    ...adequate,
    assessment: {
      ...adequate.assessment,
      evidenceState: "thin" as const,
      reasonCode: "missing_outcome" as const,
      missingElements: ["outcome" as const],
    },
  };
  const continued = planInterviewStep(
    {
      done: true,
      progress: 1,
      selectedOptionId: "plan:complete",
    },
    [first, second],
    [thin],
    1,
    1,
  );
  assert.equal(continued.done, false);
  assert.equal(continued.questionId, second.id);
});

test("secondary context cannot satisfy primary evidence coverage or allow early completion", () => {
  const first = {
    ...question("q1", "Assess the primary A criterion."),
    attributeId: "attribute-a",
    secondaryAttributeId: "attribute-b",
  };
  const second = {
    ...question("q2", "Assess the primary B criterion."),
    attributeId: "attribute-b",
  };
  const adequateFirst = {
    ...answeredMain(first),
    assessment: {
      schemaVersion: "interview-routing-v2" as const,
      evidenceState: "adequate" as const,
      reasonCode: "adequate_evidence" as const,
      missingElements: [],
    },
  };

  const completed = planInterviewStep(
    {
      done: true,
      progress: 1,
      selectedOptionId: "plan:complete",
      closing: "The secondary context was incorrectly treated as coverage.",
    },
    [first, second],
    [adequateFirst],
    1,
    1,
  );

  assert.equal(completed.done, false);
  assert.equal(completed.kind, "main");
  assert.equal(completed.strategy, "published_main");
  assert.equal(completed.questionId, second.id);
  assert.equal(completed.question, second.text);
});

test("an already asked probe is not offered again", () => {
  const first = question("q1", "Describe an incident.", [
    "What was the context?",
    "What did you personally do?",
  ]);
  const usedProbe = first.probes[0]!;
  const options = eligibleInterviewOptions(
    [first],
    [answeredMain(first), answeredFollowup(first, usedProbe)],
    2,
  );

  assert.equal(
    options.some((option) => option.text === usedProbe),
    false,
  );
  assert.equal(
    options.filter((option) => option.text === first.probes[1]).length,
    1,
  );
});

test("a frozen block id wins, while legacy applications resolve by question plan", () => {
  const legacyFirst = {
    id: "legacy-first",
    order: 9,
    required: false,
    scored: false,
    settings: {
      kind: "async_interview",
      questions: [{ id: "legacy-q-1" }, { id: "legacy-q-2" }],
    },
  };
  const newPriority = {
    id: "new-priority",
    order: 1,
    required: true,
    scored: true,
    settings: { kind: "live_ai_interview", questions: [{ id: "new-q" }] },
  };

  assert.equal(
    resolveInterviewBlock(
      [legacyFirst, newPriority],
      "legacy-first",
      ["new-q"],
    )?.id,
    "legacy-first",
  );
  assert.equal(
    resolveInterviewBlock(
      [legacyFirst, newPriority],
      undefined,
      ["legacy-q-1", "legacy-q-2"],
    )?.id,
    "legacy-first",
  );
  assert.equal(
    resolveInterviewBlock(
      [legacyFirst, newPriority],
      undefined,
      ["legacy-q-2", "legacy-q-1"],
    )?.id,
    "legacy-first",
  );
  assert.equal(
    resolveInterviewBlock(
      [legacyFirst, newPriority],
      undefined,
      [],
    )?.id,
    "new-priority",
  );
});
