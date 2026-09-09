import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Keep generated images outside the source tree by default. Writing screenshots
// into a running Next.js workspace can wake the development file watcher and
// reload the interview while MediaRecorder is active.
const outputDirectory =
  process.argv[2] ??
  process.env.WBX_E2E_OUTPUT ??
  join(tmpdir(), "whitebox-ai-e2e-screenshots");
const baseUrl = process.env.WBX_BASE_URL ?? "http://127.0.0.1:3100";
const competitionCode = process.env.WBX_E2E_CODE ?? "WBX-3N8D";
const origin = new URL(baseUrl).origin;
const headless = process.env.WBX_E2E_HEADLESS !== "false";

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  // Development intentionally keys rate limits by browser identity when there
  // is no trusted ingress. Give each isolated E2E run its own identity so a
  // prior local run cannot consume the next run's recording-attempt budget.
  userAgent: `WhiteBox-E2E/${Date.now()}-${process.pid}`,
});
await context.grantPermissions(["camera", "microphone"], { origin });
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  if (request.failure()?.errorText === "net::ERR_ABORTED") return;
  pageErrors.push(
    `request failed: ${request.method()} ${request.url()} · ${request.failure()?.errorText ?? "unknown"}`,
  );
});
let applicationId = "";

const detailedAnswer =
  "When a release failed last quarter, my task was to restore service without hiding the trade-offs. " +
  "I decided to split the incident into reversible decisions, assigned explicit owners, and kept stakeholders updated in a written log. " +
  "We restored service in 23 minutes, reduced repeat incidents by 31 percent, and documented the change for the next on-call team.";

function isApiResponse(response, suffix) {
  const url = new URL(response.url());
  return (
    response.request().method() === "POST" &&
    url.origin === origin &&
    url.pathname.endsWith(suffix)
  );
}

async function responseJson(response, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status()}): ${text.slice(0, 500)}`);
  }
  assert.ok(
    response.ok(),
    `${label} failed (${response.status()}): ${JSON.stringify(body)}`,
  );
  return body;
}

async function waitForEnabled(locator, timeout = 20_000) {
  await locator.waitFor({ state: "visible", timeout });
  await locator.evaluate(
    (element, maximumWait) =>
      new Promise((resolve, reject) => {
        const deadline = Date.now() + maximumWait;
        const check = () => {
          if (!element.isConnected) {
            reject(new Error("Control was removed while waiting for it to become enabled."));
            return;
          }
          if (!element.disabled) {
            resolve(undefined);
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error("Control did not become enabled."));
            return;
          }
          setTimeout(check, 50);
        };
        check();
      }),
    timeout,
  );
}

async function recordAndSubmitAnswer(turnIndex) {
  const start = page.getByRole("button", { name: "Start recorded answer" });
  await waitForEnabled(start);

  const mediaState = await page.evaluate(async () => {
    const videoPermission = await navigator.permissions.query({
      name: "camera",
    });
    const microphonePermission = await navigator.permissions.query({
      name: "microphone",
    });
    const preview = document.querySelector("video");
    const stream = preview?.srcObject;
    return {
      videoPermission: videoPermission.state,
      microphonePermission: microphonePermission.state,
      videoTracks:
        stream instanceof MediaStream
          ? stream.getVideoTracks().filter((track) => track.readyState === "live").length
          : 0,
      audioTracks:
        stream instanceof MediaStream
          ? stream.getAudioTracks().filter((track) => track.readyState === "live").length
          : 0,
    };
  });
  assert.equal(mediaState.videoPermission, "granted");
  assert.equal(mediaState.microphonePermission, "granted");
  assert.ok(mediaState.videoTracks > 0, "video preview must have a live camera track");
  assert.ok(mediaState.audioTracks > 0, "video preview must have a live microphone track");

  const attemptRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/attempt"),
    { timeout: 20_000 },
  );
  await start.click();
  const attemptRequest = await attemptRequestPromise;
  assert.equal(
    attemptRequest.postDataJSON().turnNumber,
    turnIndex,
    `recording attempt ${turnIndex} must use the server-owned turn number`,
  );
  const stop = page.getByRole("button", { name: "Stop answer" });
  await stop.waitFor({ state: "visible" });
  await page.waitForTimeout(2_500);

  await stop.click();

  const useRecording = page.getByRole("button", { name: "Use recording" });
  await useRecording.waitFor({ state: "visible", timeout: 20_000 });
  if (turnIndex === 1) {
    await page.getByRole("button", { name: /Re-record/ }).click();
    const secondStop = page.getByRole("button", { name: "Stop answer" });
    await secondStop.waitFor({ state: "visible" });
    await page.waitForTimeout(1_800);
    await secondStop.click();
    await useRecording.waitFor({ state: "visible", timeout: 20_000 });
  }

  const uploadResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, "/recording"),
    { timeout: 45_000 },
  );
  await useRecording.click();
  const uploadResponse = await uploadResponsePromise;
  const upload = await responseJson(uploadResponse, `recording upload for turn ${turnIndex}`);

  assert.equal(typeof upload.receipt, "string");
  assert.ok(upload.receipt.length >= 32, "recording receipt must be opaque and non-empty");
  assert.match(upload.recording?.contentType ?? "", /^video\/(webm|mp4)$/);
  assert.ok(
    Number(upload.recording?.byteSize) >= 1_024,
    "uploaded recording must contain actual media bytes",
  );

  if (turnIndex === 2) {
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByText("SECURE UPLOAD RESTORED · RECEIPT READY")
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  const answer = page.locator("#candidate-answer");
  await answer.waitFor({ state: "visible", timeout: 45_000 });
  await answer.fill(detailedAnswer);
  const correctionReason = page.locator("#transcript-correction-reason");
  await correctionReason.waitFor({ state: "visible", timeout: 20_000 });
  await correctionReason.fill(
    "Automatic transcription is unavailable in the demo; this text reflects the synthetic recorded answer.",
  );

  const turnResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, "/turn"),
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Submit answer" }).click();
  const turnResponse = await turnResponsePromise;
  await responseJson(turnResponse, `answer submission for turn ${turnIndex}`);

  const submitted = turnResponse.request().postDataJSON();
  assert.equal(submitted.recordingReceipt, upload.receipt);
  assert.equal(submitted.answer, detailedAnswer);
  assert.match(submitted.correctionReason, /Automatic transcription is unavailable/);

  return {
    id: upload.recording?.id,
    contentType: upload.recording?.contentType,
    byteSize: Number(upload.recording?.byteSize),
  };
}

try {
  // Candidate entry creates an isolated, cookie-bound application session.
  await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
  await page.getByLabel("competition code").fill(competitionCode);
  const reviewButton = page.getByRole("button", { name: "Review application" });
  await waitForEnabled(reviewButton, 15_000).catch((error) => {
    throw new Error(
      `${error instanceof Error ? error.message : error}; browser errors: ${pageErrors.join(" | ")}`,
    );
  });
  await reviewButton.click();
  const startApplicationButton = page.getByRole("button", {
    name: "Start application",
  });
  await waitForEnabled(startApplicationButton, 15_000);
  const createApplication = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/candidate/applications",
  );
  await startApplicationButton.click();
  const created = await responseJson(
    await createApplication,
    "candidate application creation",
  );
  applicationId = created.application?.id ?? "";
  assert.ok(applicationId, "candidate application id must be returned");
  await page.waitForURL("**/interview/check**", { timeout: 15_000 });

  // The standard path must pass actual camera and microphone checks. The text
  // accommodation remains unchecked and is deliberately not used by this test.
  const runChecks = page.getByRole("button", { name: "Run secure device checks" });
  await runChecks.click();
  await page
    .getByRole("button", { name: "Run checks again" })
    .waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(
    await page.getByText("OK", { exact: true }).count(),
    4,
    "camera, microphone, browser, and connection checks must all pass",
  );

  const textAccommodation = page.getByLabel(
    /I need the text-only accessibility mode/,
  );
  const consent = page.getByLabel(/I consent to the disclosed AI-conducted interview/);
  assert.equal(
    await textAccommodation.isChecked(),
    false,
    "video mode must remain selected",
  );
  await consent.check();
  await page.screenshot({ path: `${outputDirectory}/20-video-device-check.png` });

  let rejectInitialTurn = true;
  const interviewTurnPattern = new RegExp(
    `/api/candidate/interviews/${applicationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/turn$`,
  );
  const failFirstTurn = async (route, request) => {
    if (rejectInitialTurn && request.method() === "POST") {
      rejectInitialTurn = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Temporary question-generation failure.",
        }),
      });
      return;
    }
    await route.continue();
  };
  await page.route(interviewTurnPattern, failFirstTurn);

  const consentResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/consent"),
  );
  await page.getByRole("button", { name: "Start interview" }).click();
  await responseJson(await consentResponse, "candidate recording consent");
  await page.waitForURL("**/interview/live**", { timeout: 15_000 });
  assert.doesNotMatch(
    page.url(),
    /[?&]mode=/,
    "the interview mode must come from server-owned application state",
  );
  await page.getByText("CAMERA READY").waitFor({ state: "visible", timeout: 20_000 });
  await page
    .getByText("Temporary question-generation failure.")
    .waitFor({ state: "visible", timeout: 20_000 });

  const startBeforeQuestion = page.getByRole("button", {
    name: "Start recorded answer",
  });
  await startBeforeQuestion.waitFor({ state: "visible" });
  assert.equal(
    await startBeforeQuestion.isDisabled(),
    true,
    "recording must stay disabled while no interview question exists",
  );
  const stateBeforeRetry = await page.evaluate(async (id) => {
    const response = await fetch(
      `/api/candidate/applications/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    return response.json();
  }, applicationId);
  assert.equal(stateBeforeRetry.application?.turnNumber, 0);
  assert.equal(stateBeforeRetry.application?.currentTurnNumber, null);
  assert.equal(stateBeforeRetry.application?.currentQuestion, null);

  const retryQuestion = page.getByRole("button", {
    name: "Retry loading question",
  });
  const retryResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, "/turn"),
    { timeout: 45_000 },
  );
  await retryQuestion.click();
  const retryBody = await responseJson(
    await retryResponsePromise,
    "initial question retry",
  );
  await page.unroute(interviewTurnPattern, failFirstTurn);
  assert.equal(retryBody.application?.currentTurnNumber, 1);
  await page
    .getByText(retryBody.step.question, { exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await waitForEnabled(startBeforeQuestion);

  const stateAfterRetry = await page.evaluate(async (id) => {
    const response = await fetch(
      `/api/candidate/applications/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    return response.json();
  }, applicationId);
  assert.equal(stateAfterRetry.application?.turnNumber, 1);
  assert.equal(stateAfterRetry.application?.currentTurnNumber, 1);
  assert.equal(
    stateAfterRetry.application?.currentQuestion?.question,
    retryBody.step.question,
  );
  const expectedInitialFailure = pageErrors.findIndex((message) =>
    message.includes("status of 503"),
  );
  if (expectedInitialFailure >= 0) pageErrors.splice(expectedInitialFailure, 1);
  await page.screenshot({ path: `${outputDirectory}/21-video-interview-ready.png` });

  const recordings = [];
  for (let turn = 1; turn <= 10; turn += 1) {
    if (await page.getByText("Interview complete").isVisible().catch(() => false)) break;
    recordings.push(await recordAndSubmitAnswer(turn));
    if (turn === 1) {
      await page.screenshot({ path: `${outputDirectory}/22-first-video-answer-submitted.png` });
      const persisted = await page.evaluate(async (id) => {
        const response = await fetch(
          `/api/candidate/applications/${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        return response.json();
      }, applicationId);
      assert.equal(
        persisted.application?.history?.[0]?.recordingAttempts,
        2,
        "the initial recording and one re-record must persist server-side",
      );

      // A page reload must resume the exact open turn and server-owned mode,
      // without resetting the turn number or recording-attempt policy.
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByText("CAMERA READY")
        .waitFor({ state: "visible", timeout: 20_000 });

      const stateResponse = await context.request.get(
        `${baseUrl}/api/candidate/applications/${encodeURIComponent(applicationId)}`,
      );
      const state = await stateResponse.json();
      const bypassResponse = await context.request.post(
        `${baseUrl}/api/candidate/interviews/${encodeURIComponent(applicationId)}/turn`,
        {
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "Sec-Fetch-Site": "same-origin",
          },
          data: {
            answer: "Attempted answer without a video receipt.",
            expectedVersion: state.application.lockVersion,
          },
        },
      );
      const bypass = await bypassResponse.json();
      assert.equal(bypassResponse.status(), 409);
      assert.equal(
        bypass.code,
        "RECORDING_REQUIRED",
        "video mode must reject direct answer submission without a recording receipt",
      );
    }
  }

  await page
    .getByText("Interview complete")
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: `${outputDirectory}/23-video-interview-complete.png` });

  assert.ok(recordings.length >= 1, "at least one recorded answer must be uploaded");

  // HR side: evaluate the submitted evidence, open the tenant-scoped video,
  // and persist a named human hold decision.
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.goto(`${baseUrl}/vacancies/vac-005/ranking`, {
    waitUntil: "networkidle",
  });

  const pendingRow = page.locator(
    `[data-application-id="${applicationId}"]`,
  );
  await pendingRow.waitFor({ state: "visible", timeout: 20_000 });

  // Unverified manual transcripts must fail closed in both production and
  // deterministic evaluation paths.
  const blockedEvaluationPromise = page.waitForResponse(
    (response) => isApiResponse(response, `/applications/${applicationId}/evaluate`),
    { timeout: 30_000 },
  );
  await pendingRow
    .getByRole("button", { name: "Evaluate submitted evidence" })
    .click();
  const blockedEvaluation = await blockedEvaluationPromise;
  const blockedBody = JSON.parse(await blockedEvaluation.text());
  assert.equal(blockedEvaluation.status(), 409);
  assert.equal(blockedBody.code, "TRANSCRIPT_REVIEW_REQUIRED");
  const expectedConflictError = pageErrors.findIndex((message) =>
    message.includes("status of 409"),
  );
  if (expectedConflictError >= 0) pageErrors.splice(expectedConflictError, 1);

  // An authorized reviewer compares every manual transcript with its private
  // video and records the server-selected text before evaluation.
  const transcriptReviewUrl =
    `${baseUrl}/vacancies/vac-005/applications/${applicationId}/transcripts`;
  const transcriptReviewLink = pendingRow.getByRole("link", {
    name: "Review transcripts",
  });
  assert.equal(
    await transcriptReviewLink.getAttribute("href"),
    new URL(transcriptReviewUrl).pathname,
  );
  await Promise.all([
    page.waitForURL(transcriptReviewUrl, { timeout: 15_000 }),
    transcriptReviewLink.click(),
  ]);
  const transcriptTurns = page.getByTestId("transcript-turn-list").locator("button");
  const transcriptTurnCount = await transcriptTurns.count();
  assert.equal(
    transcriptTurnCount,
    recordings.length,
    "every recorded turn must appear in transcript provenance review",
  );
  for (let index = 0; index < transcriptTurnCount; index += 1) {
    const turnButton = transcriptTurns.nth(index);
    const turnNumber = await turnButton.getAttribute("data-turn-number");
    assert.match(turnNumber ?? "", /^\d+$/, "review turn must expose its server turn number");
    await turnButton.click();
    const verifyButton = page.getByRole("button", {
      name: "Verify transcript and audit",
    });
    if (!(await verifyButton.isVisible().catch(() => false))) continue;
    await page.locator("#reviewed-transcript").fill(detailedAnswer);
    await page
      .locator("#verification-reason")
      .fill(
        "Compared the complete synthetic video and audio with the submitted manual transcript.",
      );
    const verificationPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(
          `/transcripts/${turnNumber}/verify`,
        ),
      { timeout: 30_000 },
    );
    await verifyButton.click();
    await responseJson(
      await verificationPromise,
      `human transcript verification for turn ${turnNumber}`,
    );
    await page.getByText("This turn is eligible for evidence evaluation.").waitFor({
      state: "visible",
      timeout: 20_000,
    });
  }
  await page.screenshot({
    path: `${outputDirectory}/24-transcript-provenance-verified.png`,
  });

  await page.goto(`${baseUrl}/vacancies/vac-005/ranking`, {
    waitUntil: "networkidle",
  });
  const verifiedPendingRow = page.locator(
    `[data-application-id="${applicationId}"]`,
  );
  await verifiedPendingRow.waitFor({ state: "visible", timeout: 20_000 });
  const evaluationResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, `/applications/${applicationId}/evaluate`),
    { timeout: 60_000 },
  );
  await verifiedPendingRow
    .getByRole("button", { name: "Evaluate submitted evidence" })
    .click();
  await responseJson(await evaluationResponsePromise, "HR evidence evaluation");

  const evaluatedRow = page.locator(
    `tr[data-application-id="${applicationId}"]`,
  );
  await evaluatedRow.waitFor({ state: "visible", timeout: 20_000 });
  await evaluatedRow.locator("a").first().click();
  await page.waitForURL("**/candidates/**", { timeout: 15_000 });

  const playbackResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.includes(
        `/api/hr/applications/${applicationId}/recordings/`,
      ),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Interview" }).click();
  const playbackResponse = await playbackResponsePromise;
  assert.ok(
    playbackResponse.status() === 200 || playbackResponse.status() === 206,
    `private playback failed with ${playbackResponse.status()}`,
  );
  await page.screenshot({
    path: `${outputDirectory}/24-hr-private-video.png`,
  });

  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await page
    .getByPlaceholder("Cite the job-related evidence that supports this action.")
    .fill("Manual review requested to verify the submitted evidence and context.");
  const decisionResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, `/applications/${applicationId}/decision`),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Confirm and audit" }).click();
  const decision = await responseJson(
    await decisionResponsePromise,
    "human decision",
  );
  assert.equal(decision.application?.stage, "needs_adjudication");
  await page
    .getByText("Manual review requested to verify the submitted evidence and context.")
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: `${outputDirectory}/25-human-decision-audited.png`,
  });

  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);
  console.log(
    `VIDEO E2E OK: ${recordings.length} answer(s), ${recordings.reduce(
      (sum, recording) => sum + recording.byteSize,
      0,
    )} uploaded bytes; screenshots: ${outputDirectory}`,
  );
} catch (error) {
  console.error(`E2E browser errors: ${pageErrors.join(" | ") || "none"}`);
  await page
    .screenshot({
      path: `${outputDirectory}/video-e2e-failure.png`,
      fullPage: true,
    })
    .catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}
