# WhiteBox Pitch Demo — Recording Scenario

## Target

- Final duration: 75–90 seconds
- Format: 1920×1080, 30 fps, silent MP4
- Style: natural cursor movement, clean cuts, no added captions or voice-over
- Case: Technical Support Specialist — B2B SaaS, Almaty, Kazakhstan
- Story: HR creates a structured vacancy, a candidate completes an AI-assisted recorded interview, and HR receives an evidence-linked evaluation for human review.

## Recording plan

### 01 — HR login (0:00–0:05)

1. Open the WhiteBox login page.
2. Pause briefly on the professional sign-in screen.
3. Click **Sign in** with the prefilled demo account.
4. Cut as the dashboard finishes loading.

### 02 — HR workspace and vacancy creation (0:05–0:35)

1. Hold on the dashboard for two seconds so the workspace and funnel are readable.
2. Open **Vacancies**, then click **Create vacancy**.
3. In the vacancy studio, show the prepared brief for **Technical Support Specialist — B2B SaaS**.
4. Trigger real AI vacancy generation.
5. Cut out the generation wait; resume on the completed vacancy profile.
6. Move quickly through the completed sections:
   - role profile and business context;
   - evidence-based criteria;
   - structured interview plan;
   - match and ranking logic;
   - candidate experience;
   - governance and named human review;
   - final review.
7. Publish the vacancy.
8. Hold briefly on the generated vacancy code and candidate link.

### 03 — Candidate entry (0:35–0:48)

1. Open the candidate portal from the published vacancy.
2. Show the vacancy code already entered, then continue.
3. Hold on the role preview long enough to establish the same vacancy.
4. Continue through the short assessment and consent screen.
5. Open the system check and show the live camera and microphone as ready.

### 04 — Candidate interview (0:48–1:06)

1. Enter the interview room with the real webcam visible.
2. Show the first structured troubleshooting question.
3. Start the answer while the person sits naturally in front of the camera.
4. The demo answer is synthesized through OpenAI TTS and fed into the recording audio track; the normal upload and `gpt-4o-transcribe` pipeline processes it.
5. Stop the answer and show the transcript/result appearing.
6. Use clean cuts to imply completion of the remaining structured questions.
7. End on the interview-complete state.

### 05 — HR evidence results (1:06–1:28)

1. Return to the HR vacancy ranking.
2. Trigger or reveal the real `gpt-5.6-terra` evidence evaluation.
3. Hold on the ranked candidate and overall evidence-alignment score.
4. Open the candidate scorecard.
5. Move through:
   - overall match against the frozen vacancy rubric;
   - criterion coverage and confidence;
   - strengths supported by transcript evidence;
   - growth areas and recommended follow-up questions;
   - the linked transcript excerpts;
   - the named human-review decision step.
6. Finish on the polished scorecard overview for two seconds.

## Editing notes

- Record five short segments named `01-hr-login`, `02-hr-studio`, `03-candidate-entry`, `04-candidate-interview`, and `05-results`.
- Remove loading delays, typing pauses, accidental cursor movement, and permission-dialog dead time.
- Use straight cuts or very short dissolves only; avoid decorative transitions.
- Remove all audio in the final export, including the synthesized candidate response.
- Do not add captions, overlays, mock statistics, or unsupported ROI claims.
- Keep browser zoom and viewport consistent between segments.

## Commercial message communicated by the product

The demo should make the value visible without inventing financial claims: one reusable vacancy rubric, asynchronous first-screen interviews, automatic transcription, and evidence-linked summaries reduce repetitive scheduling, note-taking, replay, and manual comparison work. The product can handle greater applicant volume while keeping the hiring decision with a named human reviewer.

For a future customer pilot, quantify benefit only from the customer’s own baseline data:

`completed applicants × (baseline first-screen minutes − WhiteBox review minutes) × loaded HR hourly cost`

This formula is for pitch discussion, not an on-screen caption in the demo.
