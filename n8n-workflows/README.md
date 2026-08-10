# n8n Workflows — Import & Setup

Three importable workflow JSON files. Every value that must change before running is a
`REPLACE_WITH_*` placeholder — search for that string to find them all.

| File | Nodes | Trigger | What it does | Requirements |
|---|---|---|---|---|
| `workflow-a-core-scheduling-engine.json` | 18 | Cron, Thu 10:00 | Generates next week's draft: role match → conflict check → fairness ranking → gap report | 2, 3, 4 |
| `workflow-b-absence-replacement-finder.json` | 26 | Telegram message | Parses an absence, finds a qualified replacement, escalates if none exists | 1, 7 |
| `workflow-c-publish-notify-audit.json` | 20 | Called by A, B or E | Per-person notifications, publish, audit log, HTML + ICS export | 6, 8, 9 |
| `workflow-d-availability-intake.json` | 10 | Hosted form | Parses free-text weekly availability into structured rows | 1 |
| `workflow-e-publish-change-watcher.json` | 13 | Cron, every 15 min | Publishes approved drafts; detects, audits and re-notifies manual edits | 5, 6, 9 |

All nine functional requirements are covered. `engine-test.js` and `node-tests.js` verify the
logic offline — run both before importing anything.

---

## 1. Run n8n

```bash
docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Open http://localhost:5678 and create the owner account.

> **Workflow B needs a public URL** for the Telegram webhook. Either run n8n with a tunnel
> (`docker run ... -e WEBHOOK_URL=https://<your-tunnel>.ngrok-free.app ...`) or use n8n Cloud's
> free trial for the demo. Workflows A and C run fine entirely on localhost — if the tunnel gives
> you trouble on demo day, cut B to a screen recording rather than debugging it live.

## 2. Create the three credentials

**Credentials → Add credential**, in this order:

| Credential | Type | Config |
|---|---|---|
| `Klaiya Airtable PAT` | Airtable Personal Access Token | Paste the token from the schema guide §8 |
| `Groq API` | Header Auth | Name: `Authorization` · Value: `Bearer gsk_...` |
| `Klaiya Scheduler Bot` | Telegram | Bot token from [@BotFather](https://t.me/BotFather) |

> **Header Auth, not Bearer Auth.** n8n's "Bearer Auth" type sends the header in a format Groq's
> OpenAI-compatible endpoint rejects. Use Header Auth and include the literal word `Bearer` in the
> value.

## 3. Import the workflows

**Workflows → Import from File**, one at a time. Import **C first** — both B and E need C's
workflow ID. Then A, then B, D, E in any order.

## 4. Replace the placeholders

| Placeholder | Where to find the value | Appears in |
|---|---|---|
| `REPLACE_WITH_BASE_ID` | Airtable URL: `airtable.com/appXXXX/...` | all Airtable nodes |
| `REPLACE_WITH_SESSIONS_TABLE_ID` | Open the Sessions table, URL segment `tblXXXX` | A |
| `REPLACE_WITH_STAFF_TABLE_ID` | ditto | A, B |
| `REPLACE_WITH_AVAILABILITY_TABLE_ID` | ditto | A, B |
| `REPLACE_WITH_ABSENCES_TABLE_ID` | ditto | A, B |
| `REPLACE_WITH_ASSIGNMENTS_TABLE_ID` | ditto | A, B, C |
| `REPLACE_WITH_AUDIT_LOG_TABLE_ID` | ditto | A, B, C |
| `REPLACE_WITH_SCHEDULER_CHAT_ID` | DM [@userinfobot](https://t.me/userinfobot) | A, B, D, E |
| `REPLACE_WITH_WORKFLOW_C_ID` | Workflow C's URL after import | B, E |
| `REPLACE_WITH_*_CRED_ID` | Re-select the credential in the node dropdown | all |

**Faster:** edit the JSON with find-and-replace *before* importing. The IDs are all in plain text.

Credential IDs can't be find-and-replaced usefully — after import, open each node with a credential
and pick it from the dropdown once. n8n then remembers it for that workflow.

## 5. Testing order

Test **A → C → B**. Each stage depends on the previous one working.

### Stage 1 — Workflow A (no side effects, safe to rerun)

1. Seed Airtable per the schema guide §9.
2. Open Workflow A → **Execute Workflow** (don't activate the cron yet).
3. Check node by node:
   - `Get Sessions` returns your draft sessions → if empty, the date range or `Status='Draft'` filter is wrong
   - `Normalise Inputs` → open the output, confirm `sessions`, `staff`, `availability` arrays are populated. **Most import failures show up here as empty arrays from a field-name typo.**
   - `Assignment Engine` → check `stats.coveragePct` and `stats.slotsFilled`
   - `Create Draft Assignments` → new rows in Airtable with `Status = Draft`, `Approved` unticked
4. Confirm the Telegram summary arrives.

Nothing reaches staff at this stage — everything is `Draft`. Rerun freely. Delete the created rows
between runs so you don't accumulate duplicates.

### Stage 2 — Workflow C

1. Copy 2–3 assignment record IDs from Airtable.
2. Workflow C → **Execute Workflow** → paste as input:
   ```json
   { "assignmentIds": ["recXXX", "recYYY"], "changeType": "PUBLISH" }
   ```
3. Point `Notify Channel` at **your own** Telegram Chat ID for all test staff first. Do not test
   this against the real roster — the first run is exactly when a wrong field mapping sends 50
   people a broken message.
4. Confirm: messages arrive, `Status → Published`, `Notified → true`, Audit Log rows appear.

### Stage 3 — Workflow B

1. Activate the workflow (the Telegram trigger needs it active).
2. Ensure your Staff row has your `Telegram Chat ID` and a **Published** assignment for a test date.
3. DM the bot: `Hi, I can't make my shift tomorrow night, I'm sick`
4. Trace: `Groq - Parse Absence` returns JSON → `Validate Parse` sets `needsHumanReview: false` →
   replacement found or escalation fires.

**Test the failure path too.** Send something deliberately vague (`might be late idk`) and confirm
it routes to `Ask For Clarification` rather than guessing. That confidence gate is a design feature
worth demoing on purpose, not an error to hide.

## 6. Known constraints

| Constraint | Impact | Handling |
|---|---|---|
| Airtable 5 req/sec per base | Workflow C at 50 staff makes ~150 calls | Batch size 1 + 250 ms Wait — already wired. **Do not remove the Wait node** |
| Airtable free tier: 1,000 records/base | Assignments accumulate ~65/week | Fine for the pilot. Archive quarterly in production |
| Groq free tier rate limits | Bursty on large gap summaries | Every Groq node is `onError: continueRegularOutput` with a static-template fallback |
| Telegram needs a public webhook | Workflow B only | Tunnel or n8n Cloud |
| Airtable field names are case-sensitive | Silent empty results | `Start Time` ≠ `Start time`. Check `Normalise Inputs` output first when debugging |
| **"Workflow execution cannot start — node has issues"** on a node nothing routes to | n8n validates required parameters on **every** node before starting, not just the ones that will execute. An unused branch with an empty required field blocks the whole run | Fill the field with any valid placeholder. The Slack and Email branches in Workflow C never fire while all staff are on Telegram, but they still have to validate |
| Lookup fields can't be compared in `filterByFormula` | B and E return zero rows, silently | Query the `Session Date Flat` / `Staff Name Flat` formula fields instead — already wired, but the fields must exist in Airtable |
| **A zero-result Airtable search emits zero items** | n8n skips that node **and everything downstream** — no error, no execution, just a chain that quietly stops | `alwaysOutputData` is on every chained search; the Code nodes filter the placeholder back out with `.filter(r => r && r.id)`. Hit live: `Get Absences` returned 0 (no absences seeded) and killed Workflow A silently |
| **Airtable node output shape varies** | Records come back as `{id, fields:{...}}` on some versions and flattened as `{id, ...fields}` on others. Code reading `r.fields['X']` gets `undefined` for everything and the engine assigns nobody, with no error | Every field-reading Code node starts with a `REC()` normaliser that accepts both shapes |

## 7. What is deliberately not built

Being explicit so these read as scoping decisions rather than oversights:

- **Accept/Decline reply buttons.** Workflow C notifies but doesn't collect confirmations. Adding
  Telegram inline keyboards means a second webhook workflow and a `Confirmed` field. Roughly a day's
  work — v2.
- **PDF as a native file.** Workflow C emits styled HTML and a valid ICS calendar. True PDF
  generation needs an extra service (Gotenberg/Browserless); the HTML prints to PDF from any
  browser, which covers the requirement.
- **Subscribable calendar feed.** The ICS export is a one-way file, not a live subscription URL.
  Staff import it and get that week. Changes after import reach them via notification, not via
  their calendar auto-updating.
- **Two Telegram triggers on one bot.** Telegram permits one webhook per bot token, and Workflow B
  holds it. That's why availability intake (Workflow D) uses a hosted form instead. To put both on
  one bot, merge D into B behind a Groq intent classifier.

## 8. Offline tests

Both run with plain `node`, no n8n and no Airtable needed. They read the Code node source directly
out of the workflow JSON, so they test the real artifact rather than a copy.

```bash
node engine-test.js
```

15 staff, 4 clients, 26 slots, a deliberate cross-client collision, three weeks of lopsided history.
Asserts no double-bookings, certification and role enforced, availability covers the full window,
absences respected, weekly cap respected, deterministic reruns, and that fairness corrects prior
overload. Prints coverage stats and a load-distribution chart.

```bash
node node-tests.js
```

Covers the newer logic: ICS validity (RFC 5545 structure, CRLF, escaping, timezone), availability
parsing (malformed slot rejection, low-confidence flagging, Groq-failure preservation), and change
detection (first-run behaviour, before/after capture, re-notification rules, missing-reason handling).

Useful beyond CI — if n8n misbehaves during the demo, `node engine-test.js` still proves the
algorithm works in front of the room.
