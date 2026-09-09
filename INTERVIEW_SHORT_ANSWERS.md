# Interview short answers - WBX-WLEJ

Role: **Technical Support Specialist - B2B SaaS**  
Published async interview questions: **7**

## 1. Investigation sequence

**Exact question**

> A business customer reports that a webhook-driven integration stopped creating records after an authentication change. Their request history shows HTTP 401 responses, while a colleague says a different API endpoint still works. Describe the investigation sequence you would personally follow. Explain the evidence you would inspect or collect, the hypotheses you would test, and how each check would influence your next action.

**Short spoken answer**

First I'd confirm the timing, scope, and a reproducible 401. I'd compare the failing webhook request with the working endpoint - credential, scopes, authorization header, base URL, and logs - then test a refreshed credential in a controlled request. If that restores record creation, I'd document the fix; otherwise I'd escalate with request IDs and the checks already completed.

## 2. Technical evidence

**Exact question**

> Using the same webhook authentication scenario, explain how you would use relevant technical evidence to investigate the issue. Include the role of the HTTP 401 response, the API request and response data, logs or browser evidence where relevant, and any data checks you would consider.

**Short spoken answer**

I'd treat the 401 as authentication evidence, then compare a redacted failing request with a successful API-client call: endpoint, header scheme, token scope, response, and request ID. I'd correlate that ID in logs and inspect the browser request if the credential came from the UI. A simple SQL count around the change would confirm whether records reached persistence.

## 3. Customer update

**Exact question**

> Using the same scenario, write a short customer email or chat update in English. State the current status, what you are doing next, any action needed from the customer, and when or under what condition they can expect another update. Do not promise an outcome that has not been confirmed.

**Short spoken answer**

Hi, we've confirmed that webhook requests are reaching the API but returning 401 after the authentication change. I'm comparing the new credential and permissions with the last successful request; please send one recent request ID with secrets removed. I'll update you within thirty minutes, or sooner when the next test completes.

## 4. Priority and ownership

**Exact question**

> Using the same scenario, explain how you would set the case priority and maintain ownership while it is being investigated. Describe the customer impact information you would seek, your next action, and how you would keep the customer informed through resolution or escalation.

**Short spoken answer**

I'd set priority from business impact: number of users, production versus test, blocked revenue or operations, available workaround, and time sensitivity. I would own the next diagnostic test and give the customer a specific update time, even if the result is still pending. I'd raise priority or escalate if impact expands, no workaround exists, or evidence points beyond support access.

## 5. Engineering escalation

**Exact question**

> If your investigation indicates that engineering escalation is warranted, write an escalation note for engineering for this scenario. Include the customer impact, scope, reproduction information, expected and observed behaviour, relevant evidence or artifacts, troubleshooting already performed, and the specific help or decision you need. Also explain what would make escalation appropriate at this point.

**Short spoken answer**

Production customer: after credential rotation, every webhook returns 401 instead of creating a record, blocking order sync. Attached are redacted reproduction steps, request IDs, samples, and logs; support verified the endpoint, header scheme, scopes, and token refresh. Please confirm an authentication regression and advise rollback or fix. Escalation is appropriate because the issue is reproducible, high-impact, and support checks are exhausted.

## 6. Relevant support experience

**Exact question**

> Describe one example from technical support or SaaS operations where you personally investigated a customer-facing technical issue. What was happening, what actions did you take, what evidence did you use, how did you communicate or escalate if needed, and what was the outcome?

**Short spoken answer**

At a SaaS company, customer CSV imports began failing after a release. I reproduced it with a sanitized file, traced the request ID, and found the parser rejected a previously accepted date format; I shared a workaround and updates, then escalated with logs and a minimal sample. Engineering patched it that day, and I added the pattern to our support checklist.

## 7. Learning from feedback

**Exact question**

> Describe a time in technical support or SaaS operations when you received feedback on your work. What was the feedback, what did you personally change, how did you apply the change in later work, and what effect did you observe?

**Short spoken answer**

My lead told me my technically correct replies were too dense and left customers unsure of the next step. I started writing updates in three parts - confirmed status, owner and next action, then update time - and added that format to my ticket template. Follow-up questions fell, and the team reused the template in onboarding.
