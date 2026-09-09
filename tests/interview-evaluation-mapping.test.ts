import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupInterviewAnswersByFrozenQuestion,
  selectInterviewEvidenceForFrozenRun,
} from "../lib/server/interview-evaluation-mapping";

const questions = [{ id: "q1" }, { id: "q2" }];

test("main and follow-up answers are grouped by their frozen question IDs", () => {
  const groups = groupInterviewAnswersByFrozenQuestion(questions, [
    {
      kind: "main",
      questionId: "q2",
      answer: "Second question main answer",
    },
    {
      kind: "followup",
      questionId: "q2",
      answer: "Second question clarification",
    },
    {
      kind: "main",
      questionId: "q1",
      answer: "First question main answer",
    },
  ]);

  assert.deepEqual(groups, [
    {
      questionId: "q1",
      answers: [
        {
          turnNumber: 3,
          kind: "main",
          answer: "First question main answer",
        },
      ],
    },
    {
      questionId: "q2",
      answers: [
        {
          turnNumber: 1,
          kind: "main",
          answer: "Second question main answer",
        },
        {
          turnNumber: 2,
          kind: "followup",
          answer: "Second question clarification",
        },
      ],
    },
  ]);
});

test("legacy follow-ups inherit the active main without shifting the next main", () => {
  const groups = groupInterviewAnswersByFrozenQuestion(questions, [
    { kind: "main", answer: "Legacy Q1 main" },
    { kind: "followup", answer: "Legacy Q1 follow-up" },
    { kind: "main", answer: "Legacy Q2 main" },
    { kind: "followup", answer: "Legacy Q2 follow-up" },
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      questionId: group.questionId,
      answers: group.answers.map((answer) => answer.answer),
    })),
    [
      {
        questionId: "q1",
        answers: ["Legacy Q1 main", "Legacy Q1 follow-up"],
      },
      {
        questionId: "q2",
        answers: ["Legacy Q2 main", "Legacy Q2 follow-up"],
      },
    ],
  );
});

test("only turns without a question ID use positional legacy fallback", () => {
  const groups = groupInterviewAnswersByFrozenQuestion(questions, [
    { kind: "main", questionId: "unknown", answer: "Untrusted mapping" },
    { kind: "followup", answer: "Must not inherit a stale question" },
    { kind: "main", answer: "Second positional main" },
  ]);

  assert.deepEqual(groups, [
    { questionId: "q1", answers: [] },
    {
      questionId: "q2",
      answers: [
        {
          turnNumber: 3,
          kind: "main",
          answer: "Second positional main",
        },
      ],
    },
  ]);
});

test("two interview blocks with the same question ID cannot mix evidence across blocks or retakes", () => {
  const sharedQuestion = [{ id: "shared-question" }];
  const history = [
    {
      blockId: "interview-one",
      assessmentAttempt: 1,
      kind: "main" as const,
      questionId: "shared-question",
      answer: "Answer from the first interview block",
    },
    {
      blockId: "interview-two",
      assessmentAttempt: 1,
      kind: "main" as const,
      questionId: "shared-question",
      answer: "Superseded answer from the first attempt",
    },
    {
      blockId: "interview-two",
      kind: "main" as const,
      questionId: "shared-question",
      answer: "Missing attempt ownership must not be inferred",
    },
    {
      blockId: "interview-two",
      assessmentAttempt: 2,
      kind: "main" as const,
      questionId: "shared-question",
      answer: "Current answer from the final attempt",
    },
    {
      blockId: "interview-two",
      assessmentAttempt: 2,
      kind: "followup" as const,
      questionId: "shared-question",
      answer: "Current clarification from the final attempt",
    },
    {
      kind: "main" as const,
      questionId: "shared-question",
      answer: "Untagged legacy answer must not leak into a modern run",
    },
  ];

  const scoped = selectInterviewEvidenceForFrozenRun(history, {
    blockId: "interview-two",
    assessmentAttempt: 2,
  });
  const groups = groupInterviewAnswersByFrozenQuestion(
    sharedQuestion,
    scoped,
  );

  assert.deepEqual(
    groups[0]?.answers.map((answer) => answer.answer),
    [
      "Current answer from the final attempt",
      "Current clarification from the final attempt",
    ],
  );
});

test("untagged evidence is available only through the explicit single legacy block first-attempt path", () => {
  const legacyTurns = [
    {
      kind: "main" as const,
      questionId: "q1",
      answer: "Legacy answer",
    },
  ];

  assert.deepEqual(
    selectInterviewEvidenceForFrozenRun(legacyTurns, {
      blockId: "legacy-interview",
      assessmentAttempt: 1,
    }),
    [],
  );
  assert.deepEqual(
    selectInterviewEvidenceForFrozenRun(legacyTurns, {
      blockId: "legacy-interview",
      assessmentAttempt: 2,
      allowSingleLegacyBlockAttempt: true,
    }),
    [],
  );
  assert.equal(
    selectInterviewEvidenceForFrozenRun(legacyTurns, {
      blockId: "legacy-interview",
      assessmentAttempt: 1,
      allowSingleLegacyBlockAttempt: true,
    }).length,
    1,
  );
});
