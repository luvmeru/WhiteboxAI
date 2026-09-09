import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.WBX_BASE_URL ?? "http://127.0.0.1:3100";
const competitionCode = process.env.WBX_REAL_INTERVIEW_CODE;
const fullRound = process.env.WBX_REAL_INTERVIEW_FULL === "true";
const fullRoundVacancyId = process.env.WBX_REAL_INTERVIEW_VACANCY_ID;

if (!competitionCode) {
  throw new Error(
    "WBX_REAL_INTERVIEW_CODE is required so this smoke test cannot accidentally use a legacy vacancy.",
  );
}
if (fullRound && !fullRoundVacancyId) {
  throw new Error(
    "WBX_REAL_INTERVIEW_VACANCY_ID is required for the full HR evaluation round.",
  );
}

const browser = await chromium.launch({ headless: true });

const scenarioByQuestionId = new Map();

function scenarioForQuestion(question) {
  const normalized = normalizedText(question).toLowerCase();
  if (/python|sql|api|kubernetes|terraform|observability|инструмент/.test(normalized)) {
    return "I led a model-serving control-plane migration. I personally wrote the Python and FastAPI orchestration service, redesigned its PostgreSQL queries, packaged workloads on Kubernetes, and changed the Terraform modules for isolated environments. I added OpenTelemetry traces, Prometheus SLO alerts, canary analysis, and an automatic rollback gate. Before rollout, deployments took about 90 minutes and rollback averaged 22 minutes. After a four-week staged migration, median deploy time was 18 minutes, rollback was under 6 minutes, and change-failure rate fell from 14% to 5%. I verified the result from deployment events, error budgets, incident tickets, and a 30-day regression review.";
  }
  if (/инцидент|incident|восстанов|reliab|slo|mttr/.test(normalized)) {
    return "I was incident commander for a multi-region inference-gateway failure after a configuration rollout. Twelve percent of requests failed and p99 latency exceeded eight seconds. I froze changes, split owners across mitigation, diagnosis, and communication, then chose a regional rollback plus circuit breaker instead of a risky forward patch. Service recovered in 27 minutes. I preserved traces and the decision log, led the blameless review, added schema validation, canary traffic, and rollback automation. Over the next quarter MTTR fell from 46 to 24 minutes, no recurrence occurred, and the SLO stayed above 99.93%.";
  }
  if (/затрат|cost|эконом|finops|бюджет.*эффект/.test(normalized)) {
    return "I found that reserved GPU pools were only 41% utilized while batch traffic created avoidable peaks. I compared fixed reservations, aggressive spot use, and a mixed pool with latency guardrails. I chose the mixed design: right-sized reservations for the baseline, queued batch inference on spot capacity, request batching, and per-team cost attribution. I required automatic fallback when p95 latency or eviction rate crossed a threshold. Monthly compute cost fell 34%, GPU utilization rose to 68%, and p95 latency stayed within two percent of baseline. Finance and SRE validated the result for three billing cycles before we made the policy permanent.";
  }
  if (/регулятор|требован|compliance|residency|отраслев/.test(normalized)) {
    return "A regulated customer required regional data residency, traceable model changes, and deletion evidence before production use. I translated the requirement with legal, privacy, and security into technical controls: regional routing, encrypted tenant stores, immutable model-version logs, retention jobs with deletion receipts, and a release approval record. I rejected a faster global-cache option because it could move prompts across regions. We validated the design with a threat model, access tests, restore and deletion drills, and signed acceptance criteria. The customer passed its control review, launched on schedule, and the next two audits found no material exceptions.";
  }
  if (/развивал|инженер|coach|mento|people|команд.*развит/.test(normalized)) {
    return "I coached a senior engineer who was technically strong but avoided production ownership. We agreed on an observable goal: lead the reliability work for one service and independently run its review. I gave them a bounded project, weekly decision reviews, incident-shadowing, and specific feedback on delegation and risk communication, while leaving the technical choices to them. Within three months they shipped the SLO dashboard and rollback automation, reduced their service MTTR by 38%, and successfully led two incident reviews. They were later promoted after an independent calibration panel confirmed the same behavior. I learned to define growth in observable work outcomes rather than vague confidence.";
  }
  if (/согласован|stakeholder|product|privacy|legal|клиент|риски и варианты/.test(normalized)) {
    return "Product wanted an immediate generative-search launch, while security and privacy objected to prompt retention and unclear rollback ownership. I wrote a one-page decision record with three options, quantified customer value and failure exposure, and held separate pre-reads before a joint meeting. I recommended a staged launch with zero-retention logging, a red-team gate, named rollback authority, and a five-percent canary. I explicitly documented the product capability we would defer. All functions signed the acceptance criteria; the canary exposed one retrieval leak before broad release, we fixed it, and the service reached full launch two weeks later without a privacy incident.";
  }
  if (/гипотез|неоднознач|problem|data|metrics|исслед/.test(normalized)) {
    return "We saw an intermittent answer-quality regression that did not correlate with model version. I framed three competing hypotheses: prompt changes, retrieval freshness, and quantization. I built a replay set from 1,200 consented production cases, stratified by tenant and language, and compared grounded-answer rate, retrieval recall, latency, and failure traces while holding the model constant. The evidence rejected the prompt and quantization hypotheses and isolated stale vector indexes after partial ingestion failures. I added atomic index swaps and freshness alerts. Grounded-answer rate recovered from 86% to 96%, and the same failure signature did not recur during the next eight weeks.";
  }
  if (/зависимост|нескольк.*функц|cross.functional|поставк|delivery/.test(normalized)) {
    return "I coordinated a model-gateway release across platform, data, security, SRE, product, and customer support. I mapped twelve dependencies, owners, entry criteria, and rollback points, then separated the launch into compatibility, traffic, and customer-enablement milestones. When security testing slipped, I moved non-dependent work forward but kept the production gate closed. I ran twice-weekly risk reviews and published one decision log. We launched one week later than the aspirational date but met the committed customer date, completed all controls, migrated 94% of traffic in the first month, and had no severity-one incidents.";
  }
  return "I owned a platform portfolio decision with a fixed quarterly budget: expand model features, reduce reliability debt, or fund both partially. I compared customer revenue, incident cost, reversibility, staffing, and regulatory exposure. I personally chose to pause two low-adoption features and fund an inference-gateway reliability program plus one reversible feature experiment. I documented the trade-off, secured product and finance agreement, and set success thresholds before work began. In the quarter, availability rose from 99.72% to 99.94%, severity-one incidents fell from five to one, cloud cost per request dropped 18%, and the experiment still produced evidence for the next roadmap decision.";
}

function syntheticAnswer(turnNumber, question, questionId) {
  const key = questionId || `turn-${turnNumber}`;
  if (!scenarioByQuestionId.has(key)) {
    scenarioByQuestionId.set(key, scenarioForQuestion(question));
  }
  return (
    `For turn ${turnNumber}, I am answering this specific question: ${question.slice(0, 260)} ` +
    scenarioByQuestionId.get(key)
  );
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function assertDisplayedServerQuestion(page, question) {
  const expected = normalizedText(question);
  assert.ok(expected.length > 0, "the server question must not be empty");
  await page.waitForFunction(
    (expectedText) => {
      const normalize = (value) =>
        String(value ?? "").replace(/\s+/g, " ").trim();
      const visibleParagraphs = [...document.querySelectorAll("p")].filter(
        (element) =>
          element instanceof HTMLElement &&
          element.getClientRects().length > 0,
      );
      return visibleParagraphs.some(
        (element) => normalize(element.textContent) === expectedText,
      );
    },
    expected,
    { timeout: 30_000 },
  );
  const visibleParagraphs = await page.locator("p:visible").allInnerTexts();
  assert.ok(
    visibleParagraphs.some(
      (text) => normalizedText(text) === expected,
    ),
    `the visible question must equal the server question: ${question}`,
  );
}

async function startTextInterview() {
  const context = await browser.newContext({
    userAgent: `WhiteBox-Real-Interview-Smoke/${Date.now()}-${Math.random()}`,
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);
  const codeInput = page.getByLabel("competition code");
  await codeInput.click();
  await codeInput.press("Control+A");
  await codeInput.fill(competitionCode);
  const continueButton = page.getByRole("button", { name: "Continue" });
  await codeInput.press("Tab");
  await page.waitForTimeout(250);
  if (await continueButton.isDisabled()) {
    throw new Error(
      `Competition entry stayed disabled: ${JSON.stringify({
        configuredCode: competitionCode,
        inputValue: await codeInput.inputValue(),
        inputLength: (await codeInput.inputValue()).length,
        browserErrors,
      })}`,
    );
  }
  await page.waitForFunction(
    (button) => button instanceof HTMLButtonElement && !button.disabled,
    await continueButton.elementHandle(),
  );
  const [applicationResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/candidate/applications",
      { timeout: 60_000 },
    ),
    continueButton.click(),
  ]);
  assert.equal(applicationResponse.ok(), true);
  const created = await applicationResponse.json();
  const applicationId = created.application?.id;
  assert.equal(typeof applicationId, "string");

  const initialStateResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith(
        `/api/candidate/applications/${applicationId}`,
      ),
    { timeout: 30_000 },
  );
  await page.waitForURL("**/interview/check**");
  assert.equal((await initialStateResponsePromise).ok(), true);
  // React Strict Mode performs a second development fetch; wait until both
  // effects settle before selecting the accommodation.
  await page.waitForTimeout(750);
  await page
    .getByLabel(/I need the text-only accessibility mode/)
    .check();
  await page.getByRole("button", { name: "Run secure device checks" }).click();
  await page
    .getByRole("button", { name: "Run checks again" })
    .waitFor({ state: "visible" });
  await page
    .getByLabel(/I consent to the disclosed AI-conducted interview/)
    .check();

  const startButton = page.getByRole("button", { name: "Start interview" });
  try {
    await page.waitForFunction(
      (button) => button instanceof HTMLButtonElement && !button.disabled,
      await startButton.elementHandle(),
      { timeout: 20_000 },
    );
  } catch {
    throw new Error(
      `Device check did not enable start: ${JSON.stringify({
        browserErrors,
        textMode: await page
          .getByLabel(/I need the text-only accessibility mode/)
          .isChecked(),
        consent: await page
          .getByLabel(/I consent to the disclosed AI-conducted interview/)
          .isChecked(),
        pageText: (await page.locator("body").innerText()).slice(0, 2_000),
      })}`,
    );
  }
  const consentResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/consent"),
  );
  await startButton.click();
  assert.equal((await consentResponsePromise).ok(), true);
  await page.waitForURL("**/interview/live**");
  await page
    .getByText("PUBLISHED MAIN", { exact: false })
    .last()
    .waitFor({ state: "visible", timeout: 30_000 });
  return { context, page, applicationId };
}

try {
  const repairRun = await startTextInterview();
  const originalStateResponse = await repairRun.context.request.get(
    `${baseUrl}/api/candidate/applications/${encodeURIComponent(repairRun.applicationId)}`,
  );
  const originalState = await originalStateResponse.json();
  const originalQuestion =
    originalState.application?.currentQuestion?.question;
  assert.equal(typeof originalQuestion, "string");
  await assertDisplayedServerQuestion(repairRun.page, originalQuestion);

  const repairResponsePromise = repairRun.page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/turn"),
  );
  await repairRun.page
    .getByRole("button", { name: "Переформулировать вопрос" })
    .click();
  const repairResponse = await repairResponsePromise;
  assert.equal(repairResponse.ok(), true);
  const repair = await repairResponse.json();
  assert.equal(repair.step?.strategy, "clarification");
  assert.equal(repair.engine?.model, "candidate-controlled-structured-plan");
  assert.notEqual(repair.step?.question, originalQuestion);
  await assertDisplayedServerQuestion(repairRun.page, repair.step?.question);
  await repairRun.context.close();

  const providerRun = await startTextInterview();
  const providerInitialStateResponse = await providerRun.context.request.get(
    `${baseUrl}/api/candidate/applications/${encodeURIComponent(providerRun.applicationId)}`,
  );
  assert.equal(providerInitialStateResponse.ok(), true);
  const providerInitialState = await providerInitialStateResponse.json();
  const providerInitialQuestion =
    providerInitialState.application?.currentQuestion?.question;
  assert.equal(typeof providerInitialQuestion, "string");
  await assertDisplayedServerQuestion(
    providerRun.page,
    providerInitialQuestion,
  );
  const answer =
    "During a high-severity production incident, I owned service restoration and stakeholder communication. " +
    "I first separated reversible from irreversible decisions, compared rollback with a guarded forward fix, " +
    "and chose rollback because it reduced customer exposure while preserving evidence for diagnosis. " +
    "I assigned explicit owners, kept a timestamped decision log, and verified recovery with error rate, latency, and support-volume checks. " +
    "Service recovered in 23 minutes and repeat incidents fell by 31 percent after I led the follow-up controls. " +
    "The main lesson was to define rollback triggers before deployment; next time I would rehearse that decision path with the on-call team.";
  await providerRun.page.locator("#candidate-answer").fill(answer);
  const providerResponsePromise = providerRun.page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/turn"),
    { timeout: 120_000 },
  );
  await providerRun.page
    .getByRole("button", { name: "Submit answer" })
    .click();
  const providerResponse = await providerResponsePromise;
  const providerBody = await providerResponse.json();
  assert.equal(
    providerResponse.ok(),
    true,
    JSON.stringify(providerBody),
  );
  assert.equal(
    providerBody.engine?.promptVersion,
    "structured-adaptive-interview-v3",
  );
  assert.match(providerBody.engine?.model ?? "", /^gpt-/);
  assert.ok(
    ["published_main", "evidence_probe"].includes(
      providerBody.step?.strategy,
    ),
  );

  const savedStateResponse = await providerRun.context.request.get(
    `${baseUrl}/api/candidate/applications/${encodeURIComponent(providerRun.applicationId)}`,
  );
  const savedState = await savedStateResponse.json();
  assert.equal(
    savedState.application?.history?.[0]?.assessment?.schemaVersion,
    "interview-routing-v2",
  );
  assert.equal(
    savedState.application?.history?.[0]?.engine?.promptVersion,
    "structured-adaptive-interview-v3",
  );
  if (
    savedState.application?.stage === "in_progress" &&
    typeof savedState.application?.currentQuestion?.question === "string"
  ) {
    await assertDisplayedServerQuestion(
      providerRun.page,
      savedState.application.currentQuestion.question,
    );
  }
  let fullRoundResult = null;
  if (fullRound) {
    let state = savedState;
    let submittedTurns = 1;
    while (
      state.application?.stage === "in_progress" &&
      submittedTurns < 30
    ) {
      const question = state.application?.currentQuestion?.question;
      assert.equal(typeof question, "string");
      await assertDisplayedServerQuestion(providerRun.page, question);
      submittedTurns += 1;
      await providerRun.page
        .locator("#candidate-answer")
        .fill(
          syntheticAnswer(
            submittedTurns,
            question,
            state.application?.currentQuestion?.questionId,
          ),
        );
      const turnResponsePromise = providerRun.page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/turn"),
        { timeout: 120_000 },
      );
      await providerRun.page
        .getByRole("button", { name: "Submit answer" })
        .click();
      const turnResponse = await turnResponsePromise;
      const turnBody = await turnResponse.json();
      assert.equal(turnResponse.ok(), true, JSON.stringify(turnBody));

      const stateResponse = await providerRun.context.request.get(
        `${baseUrl}/api/candidate/applications/${encodeURIComponent(providerRun.applicationId)}`,
      );
      state = await stateResponse.json();
    }
    assert.notEqual(
      state.application?.stage,
      "in_progress",
      "the bounded structured plan must complete within 30 submitted turns",
    );

    await providerRun.page.goto(`${baseUrl}/login`, {
      waitUntil: "networkidle",
    });
    await providerRun.page.getByRole("button", { name: "Sign in" }).click();
    await providerRun.page.waitForURL("**/dashboard", {
      timeout: 30_000,
    });
    await providerRun.page.goto(
      `${baseUrl}/vacancies/${encodeURIComponent(fullRoundVacancyId)}/ranking`,
      { waitUntil: "networkidle" },
    );
    const pendingRow = providerRun.page.locator(
      `[data-application-id="${providerRun.applicationId}"]`,
    );
    await pendingRow.waitFor({ state: "visible", timeout: 30_000 });
    const evaluationResponsePromise = providerRun.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(
          `/applications/${providerRun.applicationId}/evaluate`,
        ),
      { timeout: 180_000 },
    );
    await pendingRow
      .getByRole("button", { name: "Run AI evaluation" })
      .click();
    const evaluationResponse = await evaluationResponsePromise;
    const evaluationBody = await evaluationResponse.json();
    assert.equal(
      evaluationResponse.ok(),
      true,
      JSON.stringify(evaluationBody),
    );
    assert.equal(
      evaluationBody.evaluation?.engine?.promptVersion,
      "evidence-bars-evaluation-v3",
    );
    const evaluation = evaluationBody.evaluation;
    assert.ok(evaluation, "the evaluation response must include an evaluation");
    assert.equal(typeof evaluation.complete, "boolean");
    assert.equal(Number.isFinite(evaluation.coverage), true);
    assert.ok(Array.isArray(evaluation.attributeScores));
    assert.ok(
      evaluation.attributeScores.every(
        (attribute) => typeof attribute.abstained === "boolean",
      ),
      "every evaluated attribute must explicitly distinguish scored from abstained",
    );
    const abstainedAttributes = evaluation.attributeScores.filter(
      (attribute) => attribute.abstained,
    );
    assert.equal(evaluation.complete, abstainedAttributes.length === 0);
    if (!evaluation.complete) {
      assert.ok(
        abstainedAttributes.length > 0,
        "an incomplete evaluation must identify the abstained attributes",
      );
      const risks = evaluation.synthesis?.risks ?? [];
      for (const attribute of abstainedAttributes) {
        const attributeRisks = risks.filter((risk) =>
          normalizedText(risk)
            .toLocaleLowerCase()
            .includes(normalizedText(attribute.name).toLocaleLowerCase()),
        );
        assert.ok(
          attributeRisks.every((risk) =>
            /insufficient evidence|not scored/i.test(risk),
          ),
          `an abstention for ${attribute.name} must not be presented as a low-score risk`,
        );
      }

      await providerRun.page.reload({ waitUntil: "networkidle" });
      const evaluatedRow = providerRun.page.locator(
        `table tbody tr[data-application-id="${providerRun.applicationId}"]`,
      );
      await evaluatedRow.waitFor({ state: "visible", timeout: 30_000 });
      const cells = evaluatedRow.locator("td");
      assert.equal(
        normalizedText(await cells.nth(1).innerText()),
        "—",
        "an incomplete evaluation must not receive a visible rank",
      );
      assert.equal(
        normalizedText(await cells.nth(5).innerText()),
        "NEEDS REVIEW",
        "an incomplete evaluation must hide its tier behind NEEDS REVIEW",
      );
    }
    fullRoundResult = {
      submittedTurns,
      evaluationComplete: evaluationBody.evaluation?.complete,
      evaluationCoverage: evaluationBody.evaluation?.coverage,
      evaluationPromptVersion:
        evaluationBody.evaluation?.engine?.promptVersion,
    };
  }
  await providerRun.context.close();

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        repairStrategy: repair.step.strategy,
        providerModel: providerBody.engine.model,
        providerPromptVersion: providerBody.engine.promptVersion,
        nextStrategy: providerBody.step.strategy,
        fullRound: fullRoundResult,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
