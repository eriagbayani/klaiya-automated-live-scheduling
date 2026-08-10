# Setup & Deployment Guide

Windows 11 · Docker Desktop · target: working demo by 12 Aug 2026

Work through this in order. Steps 1–3 are account setup and can be done in any order, but
**everything after step 4 depends on the Airtable base existing**, so don't skip ahead.

Budget: ~3 hours for a first pass, most of it in step 4 (building the Airtable base by hand).

---

## Deployment options — pick one

| Option | Cost | Setup | Workflow B works? | Verdict |
|---|---|---|---|---|
| **Docker local + `--tunnel`** | Free | 5 min | ✅ | **Use this.** Tunnel is dev-grade but fine for a demo |
| Docker local, no tunnel | Free | 5 min | ❌ | Fine for building A and C; B can't receive Telegram |
| Docker local + Cloudflare Tunnel | Free | ~30 min | ✅ | More stable URL. Worth it only if the built-in tunnel misbehaves |
| n8n Cloud trial | Free 14 days | 2 min | ✅ | Zero infrastructure. Trial expires — bad if Klaiya wants to keep it running |
| Docker on a VPS | ~$6/mo | ~1 hr | ✅ | The real production answer. Not needed before the 12th |

**Recommended path:** Docker local with the built-in tunnel. It's the honest demo setup, costs nothing,
and you can tell stakeholders "this same container runs on any server you point it at" — which is true.

---

## Step 1 — Docker Desktop

You already have Docker Desktop installed (shortcut on your Desktop). Confirm it's running and healthy:

```bash
docker --version
```

If it errors, launch Docker Desktop from the Start menu and wait for the whale icon to go steady.
On Windows it needs WSL2 — Docker Desktop prompts you through that if it isn't set up.

---

## Step 2 — Get your API keys (do these first, they're the slow part)

### 2a. Groq API key

1. Go to https://console.groq.com and sign up (free, no card).
2. **API Keys** → **Create API Key** → name it `klaiya-n8n`.
3. Copy it now — it's shown once. Format: `gsk_...`

Free tier is generous and `llama-3.3-70b-versatile` is available on it. No billing setup needed.

### 2b. Telegram bot

1. In Telegram, message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, pick a display name and a username ending in `bot` (e.g. `klaiya_scheduler_bot`).
3. Copy the token it gives you. Format: `8123456789:AAF...`

### 2c. Your Telegram Chat ID

1. Message [@userinfobot](https://t.me/userinfobot).
2. It replies with your numeric ID. Copy it — this is `REPLACE_WITH_SCHEDULER_CHAT_ID`.

> **Important:** message your own new bot once (say "hi") before testing. Telegram bots cannot
> initiate conversations — if nobody has ever messaged the bot, every send will fail with
> "chat not found", and it looks exactly like a credential problem.

### 2d. Airtable Personal Access Token

Do this **after** step 4, once the base exists.

---

## Step 3 — Start n8n

Single command, PowerShell or Bash:

```bash
docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n -e GENERIC_TIMEZONE=Asia/Manila -e TZ=Asia/Manila -e N8N_ENCRYPTION_KEY=klaiya-poc-key-do-not-lose-this docker.n8n.io/n8nio/n8n
```

Open http://localhost:5678 and create the owner account (local only — use anything you'll remember).

**Three things in that command that matter:**

- `-v n8n_data:/home/node/.n8n` — a named volume. Without it, deleting the container deletes every
  workflow and credential you've built. Do not skip this.
- `GENERIC_TIMEZONE=Asia/Manila` — Workflow A's cron is `0 10 * * 4` (Thursday 10:00). Without the
  timezone set, the container runs UTC and your trigger fires at 18:00 Manila time.
- `N8N_ENCRYPTION_KEY` — credentials are encrypted with this. Recreate the container without the
  same key and every stored credential becomes unreadable. Keep the string identical if you ever
  rebuild.

**To stop / restart later:**

```bash
docker stop n8n
```

```bash
docker start n8n
```

Use `docker start`, never `docker run` again — a second `run` with the same name fails, and with a
different name you get a blank n8n.

---

## Step 4 — Build the Airtable base (scripted)

The base is **81 fields across 7 tables**. Building that by hand is ~90 minutes and one typo
(`Start time` instead of `Start Time`) gives you a workflow that runs cleanly and silently does
nothing. Scripts do it instead — see [`airtable-setup/README.md`](airtable-setup/README.md).

### 4a. Create an empty base and a token

1. In Airtable, create a new **empty** base named `Klaiya Live Scheduling`.
2. Base ID from the URL: `airtable.com/appXXXXXXXXXXXXXX/...` → the `app...` part.
3. https://airtable.com/create/tokens → **Create new token**, name it `klaiya-n8n`.
4. Scopes — **all four**:
   - `schema.bases:read`
   - `schema.bases:write` ← setup scripts need this; the workflows don't
   - `data.records:read`
   - `data.records:write`
5. Access: add the `Klaiya Live Scheduling` base. Copy the token — shown once.

### 4b. Run the scripts

Set the environment variables (PowerShell):

```powershell
$env:AIRTABLE_TOKEN = "patXXXXXXXXXXXXXX"; $env:AIRTABLE_BASE_ID = "appXXXXXXXXXXXXXX"; $env:TEST_CHAT_ID = "123456789"
```

`TEST_CHAT_ID` is your own Telegram chat ID from step 2c. It points every seeded staff member at
**you**, so the first notification test can't reach anyone else.

Then from the `airtable-setup` folder:

```bash
node create-base.js
```

```bash
node verify-schema.js
```

```bash
node seed-data.js
```

**Expect `create-base.js` to leave ~13 fields for you.** Airtable won't create Lookup and Formula
fields over the API. The script prints exactly what to add and where:

```
  Assignments
    - "Session Date"  ->  field type: Lookup
        linked record field: Session
        field to look up:    Date
```

Add those in the UI (about 10 minutes), then run `verify-schema.js` again until it says
`SCHEMA OK`. Don't move on before it does — it's checking the exact things that fail invisibly
later, including time fields typed as Time instead of text.

### 4c. Collect the table IDs

Click each table; the URL becomes `.../appXXXX/tblYYYYYYYYYYYYYY/...`. Write down all seven:

```
BASE            app...
Clients         tbl...
Staff           tbl...
Sessions        tbl...
Availability    tbl...
Absences        tbl...
Assignments     tbl...
Audit Log       tbl...
```

> Prefer to build it by hand? [`03-airtable-schema.md`](03-airtable-schema.md) has the full
> table-by-table spec. Run `verify-schema.js` afterwards either way.

---

## Step 5 — Replace the placeholders (do this BEFORE importing)

Much faster than clicking through 60+ nodes in the editor. Open the three JSON files in
`n8n-workflows/` in any text editor and find-and-replace:

| Find | Replace with |
|---|---|
| `REPLACE_WITH_BASE_ID` | your `app...` |
| `REPLACE_WITH_SESSIONS_TABLE_ID` | Sessions `tbl...` |
| `REPLACE_WITH_STAFF_TABLE_ID` | Staff `tbl...` |
| `REPLACE_WITH_AVAILABILITY_TABLE_ID` | Availability `tbl...` |
| `REPLACE_WITH_ABSENCES_TABLE_ID` | Absences `tbl...` |
| `REPLACE_WITH_ASSIGNMENTS_TABLE_ID` | Assignments `tbl...` |
| `REPLACE_WITH_AUDIT_LOG_TABLE_ID` | Audit Log `tbl...` |
| `REPLACE_WITH_SCHEDULER_CHAT_ID` | your Telegram chat ID |

Leave the `REPLACE_WITH_*_CRED_ID` placeholders alone — those get fixed by selecting the credential
in the node dropdown after import. `REPLACE_WITH_WORKFLOW_C_ID` gets filled in at step 8.

---

## Step 6 — Create credentials in n8n

**Credentials** → **Add credential**. Create all three before importing, so they appear in the
dropdowns.

| Name it exactly | Type | Value |
|---|---|---|
| `Klaiya Airtable PAT` | Airtable Personal Access Token | your `pat...` |
| `Groq API` | **Header Auth** | Name: `Authorization` · Value: `Bearer gsk_...` |
| `Klaiya Scheduler Bot` | Telegram | your BotFather token |

> **Use Header Auth, not Bearer Auth.** n8n's "Bearer Auth" type formats the header in a way Groq's
> OpenAI-compatible endpoint rejects. Pick Header Auth and type the word `Bearer` yourself, with a
> space before the key.

---

## Step 7 — Import the workflows

**Workflows** → **Import from File**. Import in this order:

1. `workflow-c-publish-notify-audit.json`
2. `workflow-a-core-scheduling-engine.json`
3. `workflow-b-absence-replacement-finder.json`
4. `workflow-d-availability-intake.json`
5. `workflow-e-publish-change-watcher.json`

C first, because B and E both reference its ID.

After each import, open any node showing a red credential warning and re-select the credential from
the dropdown. n8n then applies it across that workflow.

---

## Step 8 — Link B and E to C

1. Open Workflow C. Its URL is `localhost:5678/workflow/XXXXXXXX` — copy the ID.
2. Workflow B → node **Call Workflow C (Notify)** → paste the ID.
3. Workflow E → nodes **Call Workflow C - Publish** *and* **Call Workflow C - Re-notify** → paste
   the same ID into both.

Three nodes total. Missing one of E's two is easy to do and shows up later as "approval did nothing."

---

## Step 9 — Test, in this order

Do not skip ahead. Each stage proves the one after it can work.

### 9a. Workflow A — safe, no side effects

Open Workflow A → **Execute Workflow** (don't activate the cron).

Check these nodes in order:

| Node | Expect | If it's wrong |
|---|---|---|
| `Get Sessions` | Your draft sessions | Date range or `Status='Draft'` filter is off — check your seeded dates are actually next week |
| `Normalise Inputs` | Populated `sessions`, `staff`, `availability` arrays | **Empty arrays = a field-name typo.** This is where most setup errors surface |
| `Assignment Engine` | `stats.coveragePct`, `stats.slotsFilled` | If 0 slots, check `Hosts Required` / `Admins Required` are set on your sessions |
| `Create Draft Assignments` | New Airtable rows, `Status = Draft` | |

You should get a Telegram message with coverage stats. Nothing reaches staff — everything is Draft.

**Rerun freely**, but delete the created Assignment rows between runs so you don't accumulate
duplicates and skew the fairness history.

### 9b. Workflow C

1. **Point every test staff member's `Notify Channel` at Telegram and their `Telegram Chat ID` at
   YOUR id first.** Do not run this against a real roster on the first attempt — a wrong field
   mapping sends dozens of people a broken message and there's no unsend.
2. Copy 2–3 assignment record IDs from Airtable.
3. Workflow C → **Execute Workflow** → paste as input:

```json
{ "assignmentIds": ["recXXX", "recYYY"], "changeType": "PUBLISH" }
```

Expect: messages arrive, `Status → Published`, `Notified → true`, Audit Log rows appear.

### 9c. Workflow D — availability intake (no tunnel needed)

1. Open Workflow D → **Execute Workflow** to arm the form in test mode, or **Activate** it for the
   production URL.
2. Open the form URL: `http://localhost:5678/form/klaiya-availability`
3. Submit with a name that **exactly matches** a Staff row, and free text like:
   `Mon-Wed evenings from 6pm, Thursday all day, not available Friday`

Expect: several Availability rows appear, one per day, with `Source = Parsed`. Friday must **not**
appear — the prompt is explicitly instructed to record only days the person says they *are* free.
That's the single most useful thing to check, because getting it wrong books someone on the one day
they ruled out.

Then test the failure paths on purpose:
- Submit a name that isn't on the roster → nothing is written, you get a Telegram warning
- Submit gibberish → one row is written with `Source = Manual`, `Needs Review` ticked, and the
  original text preserved in `Raw Text`. Nothing is ever silently dropped

### 9d. Workflow E — approval and change watcher

1. **Activate** Workflow E (it's a schedule trigger, so it only runs when active).
2. **Run it once manually first.** The first execution seeds its change-detection snapshot and by
   design reports zero changes — this is correct, not a failure.
3. Now tick `Approved` on 2–3 Draft assignments in Airtable.
4. Wait for the next 15-minute poll, or hit **Execute Workflow** to skip the wait.

Expect: those assignments publish, notifications go out via Workflow C, `Notified` flips to true.

Then test the override path — this is your requirement-5 demo moment:
1. On a **Published** assignment, change the `Staff` link to a different person and fill in
   `Change Reason`.
2. Run Workflow E again.
3. Expect: a `MANUAL_OVERRIDE` audit row with the before and after names, and the new person gets a
   change notification.
4. Now make another edit and **leave `Change Reason` blank** — you should get a Telegram nudge, and
   the audit row still gets written with `Reason: NOT PROVIDED`. The audit trail never has a hole in
   it just because someone skipped a field.

### 9e. Workflow B — needs the tunnel

Stop the container and restart it with the tunnel flag:

```bash
docker rm -f n8n
```

```bash
docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n -e GENERIC_TIMEZONE=Asia/Manila -e TZ=Asia/Manila -e N8N_ENCRYPTION_KEY=klaiya-poc-key-do-not-lose-this docker.n8n.io/n8nio/n8n start --tunnel
```

Your workflows survive because they're in the `n8n_data` volume — that's what it's for.

Then:

1. **Activate** Workflow B (the Telegram trigger only listens when active).
2. Make sure your Staff row has your `Telegram Chat ID`, and that you have a **Published** assignment
   on a near-future date.
3. DM your bot: `Hi, I can't make my shift tomorrow night, I'm sick`

Trace: `Groq - Parse Absence` returns JSON → `Validate Parse` sets `needsHumanReview: false` →
replacement found, or escalation fires.

**Also test the failure path on purpose.** Send something vague like `might be late idk` and confirm
it routes to `Ask For Clarification` instead of guessing a date. That confidence gate is a feature
worth demoing deliberately — it shows the design doesn't blindly trust the LLM.

---

## Step 10 — Demo-day checklist

- [ ] `docker start n8n` run at least 30 minutes before, and http://localhost:5678 confirmed loading
- [ ] Full D → A → E → C → B run completed successfully **that morning**
- [ ] Draft Assignment rows deleted so Workflow A generates fresh on stage
- [ ] Workflow E run once after that cleanup, so its snapshot is current and it won't report the
      deletions as manual changes mid-demo
- [ ] Airtable **Scheduler Review** view open in a browser tab (your requirement-5 moment)
- [ ] Availability form open in a second tab (your requirement-1 moment)
- [ ] Telegram open on your phone, mirrored to screen if you can
- [ ] `node engine-test.js` and `node node-tests.js` verified passing — your fallback if n8n
      misbehaves live
- [ ] Screenshots of every successful step saved locally, as a second fallback

**Suggested demo order** — it follows the real lifecycle and each step sets up the next:

| Step | Show | Requirement |
|---|---|---|
| 1 | Submit the availability form in plain English, watch rows appear parsed | 1 |
| 2 | Run Workflow A, show coverage stats and the gap report | 2, 3, 4 |
| 3 | Open Scheduler Review, change one assignment, tick Approved | 5 |
| 4 | Workflow E publishes it; notification lands on your phone | 6 |
| 5 | Message the bot "can't make tomorrow, sick" → replacement found | 7 |
| 6 | Download the ICS, drag it into a calendar | 8 |
| 7 | Open the Audit Log — every step above is a row | 9 |

That sequence hits all nine requirements in about six minutes, in an order that tells a story rather
than reading a checklist.

**If the tunnel is flaky on the day, don't fight it.** Everything except step 5 runs on localhost.
Demo the rest live and show the absence flow from a screen recording — a confident run of six steps
beats a shaky run of seven.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Normalise Inputs` returns empty arrays | Airtable field name mismatch | Field names are case- and space-sensitive. `Start Time` ≠ `Start time` |
| Airtable node: "NOT_FOUND" | Wrong base or table ID | Re-copy from the URL; `app...` is the base, `tbl...` is the table |
| Groq: 401 | Bearer Auth used, or `Bearer ` prefix missing | Header Auth, value = `Bearer gsk_...` with the space |
| Telegram: "chat not found" | Nobody has messaged the bot | Message your bot once from that account first |
| Telegram trigger never fires | Workflow inactive, or no tunnel | Activate it; restart with `start --tunnel` |
| Airtable 429 | Rate limit, 5 req/sec | Confirm the Wait node is still in Workflow C's loop |
| Cron fires at the wrong hour | Container is on UTC | Confirm `GENERIC_TIMEZONE=Asia/Manila` |
| Credentials all broken after rebuild | `N8N_ENCRYPTION_KEY` changed | Use the identical key string |
| Workflows gone after restart | Ran `docker run` instead of `docker start` | Use `docker start n8n`; check the volume with `docker volume ls` |
| Ticking `Approved` does nothing | Workflow E inactive, or C's ID missing from one of its two Execute Workflow nodes | Activate E; check **both** nodes |
| Workflow E reports no changes ever | Its snapshot is being reseeded | The first run after import always reports zero — that's by design. Run it twice |
| Availability form 404s | Workflow D not active | Activate it, or use Execute Workflow for the test URL |
| Form submission writes nothing | Name doesn't match a Staff row | It's an exact string match — check spelling and spacing |
| Availability rows appear for days the person said they *can't* work | Groq ignored the exclusion rule | Check `Raw Text` on the row, fix manually, and lower the prompt temperature to 0 if it isn't already |

---

## Production notes (for the "what happens after the pilot" question)

You will be asked this. Short version:

| Concern | Pilot | Production |
|---|---|---|
| Hosting | Docker on your laptop | Docker on a small VPS (~$6/mo) or n8n Cloud |
| Webhooks | `--tunnel` (dev-grade) | Real domain + HTTPS reverse proxy |
| Airtable | Free tier: 1,000 records/base | Team plan, or quarterly archiving of Assignments |
| Backups | The named volume | Scheduled volume snapshot + Airtable base duplicate |
| Secrets | Env var on the container | Proper secret store; rotate the PAT and bot token |
| Failure alerts | You notice | n8n error workflow → Telegram to the scheduler |

The honest framing: this is a **pilot-grade deployment that proves the logic**, and the same three
workflow files run unchanged on production infrastructure. Nothing here needs rewriting to scale —
it needs hosting and a paid Airtable tier.
