# Automated Live Scheduling Workflow

**Solution design and working prototype — Klaiya Digital Solution**

Rainerio Agbayani Jr. · August 2026

| | |
|---|---|
| **Scope** | Design plus a functioning prototype, not a concept study |
| **Built** | 5 n8n workflows, 95 nodes, 7 Airtable tables, 82 fields |
| **Status** | All 9 functional requirements executed end to end against live services |
| **Testing** | 41 automated assertions over the core logic, all passing |
| **Stack** | n8n (self-hosted) · Airtable · Groq (Llama 3.3) · Telegram |

---

## 1. Executive summary

Manual scheduling of Live Hosts and Live Admins produces four recurring failures: overlapping bookings, sessions that reach air time understaffed, workload that concentrates on the same reliable people, and a scramble whenever someone becomes unavailable at short notice.

These are usually treated as four separate problems. They are better understood as four symptoms of one gap. A shared spreadsheet and a reminder bot automate storage and messaging. They do not automate decisions — who is qualified, what clashes, who deserves the next shift, and who covers an absence. All four remain human judgements, and all four are where the failures originate.

This solution automates those decisions. A deterministic engine matches qualified staff to sessions, prevents overlaps structurally, and distributes work by a weighted fairness measure rather than a raw shift count. A language model is used only for language: reading free-text availability and absence messages, and writing notifications. It never decides who works.

**The prototype is running.** On a live run it filled 23 of 26 slots in under sixty seconds, explained each of the three gaps by naming the blocking constraint, and produced an audit trail attributing every action to either a workflow or a named person. Section 8 sets out that evidence.

---

## 2. Starting point — an assumed baseline

> ⚠️ **This section is an assumption, not a confirmed fact.**
>
> I had no visibility into Klaiya's existing scheduling automation. I understand something is already in place, but I was not able to confirm what it does.
>
> What follows models a typical mid-size agency setup: a shared spreadsheet, a reminder bot, and a coordinator performing the actual matching by hand. If the real setup differs, the gap analysis changes — the solution largely does not, because it is designed against the nine stated requirements rather than against this reconstruction.
>
> Please read every "before" comparison in this document with that caveat attached.

Assessed against the nine requirements, a setup of that kind would land roughly as follows.

| Coverage | Requirements | Assessment |
|---|---|---|
| **Covered** | Manual overrides | Trivially — a spreadsheet allows any edit because it has no controls at all |
| **Half covered** | Data input, conflict prevention, notifications, publishing, audit trail | Data exists but is unstructured; conflicts are caught only within a single tab; notifications broadcast but do not fire on change; the sheet is shareable but mutable; cell history records that something changed, never why |
| **Not covered** | Automated assignment, fair allocation, absence management | No mechanism exists for any of the three |

The pattern is consistent: communication and storage are automated, decisions are not.

---

## 3. System architecture

Four layers. n8n orchestrates, Airtable stores, Groq handles language, and delivery goes out over the channel each person prefers.

| Layer | Components | Responsibility |
|---|---|---|
| **Sources and triggers** | Weekly cron · hosted web form · Telegram messages · scheduler approval | Everything that starts work |
| **Orchestration** | n8n, self-hosted in Docker — 5 workflows, 95 nodes | Sequencing, branching, retries, error paths |
| **Decision engine** | JavaScript inside n8n Code nodes | Qualification, conflict detection, fairness ranking, assignment. No AI involved |
| **Services** | Airtable (7 tables, 82 fields) · Groq, Llama 3.3 70B | Persistence and language processing |
| **Delivery** | Telegram · Slack · email · shared view · HTML snapshot · ICS calendar | Getting the schedule to the people who need it |

The decision engine is listed as its own layer despite living inside n8n, because it is the part that must never be probabilistic. It is called by Workflow A for the weekly draft and reused by Workflow B when finding replacements, so both paths apply identical rules.

> 📸 **SCREENSHOT 1 — n8n workflow canvas**
> Open Workflow A in n8n, zoom to fit, capture the full node graph

---

## 4. Tool selection

Each choice below was made for a stated reason, with the tradeoff noted. The brief fixed n8n and Groq; the remaining choices were open.

### 4.1 Orchestration — n8n, self-hosted

Visual workflow editor with real JavaScript available in Code nodes, so the deterministic logic sits in the same tool as the orchestration rather than in a separate service. Self-hosting in Docker keeps the pilot free, and the workflows export as JSON files that can be handed over and re-imported.

**Tradeoff.** Several n8n features depend on live editor state and do not survive a JSON import — typed sub-workflow inputs and field mappers in particular. Section 8.4 lists the defects this caused. The design now avoids that machinery, but it is a real cost of the export-and-import model.

### 4.2 Data store — Airtable

Chosen over Google Sheets for one decisive reason: linked records. The engine matches staff to sessions by record identity, and Airtable gives stable record IDs plus lookup fields that carry session and staff context onto each assignment row. In Sheets the same joins would be hand-rolled in JavaScript on every run, and row indexes shift under concurrent edits.

Airtable also provides filtered views at no cost, which is how the scheduler reviews and approves drafts — no interface had to be built.

**Tradeoff.** The free tier caps at 1,000 records per base. At the assumed volume that is roughly four months before archiving or a paid plan is required. Sheets would not have that limit.

### 4.3 Language model — Groq, Llama 3.3 70B

Free tier, very fast inference, and an OpenAI-compatible endpoint that n8n's HTTP node calls with no custom code. Used for four narrow language tasks only. Every call has a static-template fallback, so an outage degrades message wording rather than blocking a schedule.

**Tradeoff.** Free-tier rate limits are real, and output quality is below the largest frontier models. Neither matters here, because no scheduling decision depends on the model.

### 4.4 Notifications — Telegram, with Slack and email wired

Telegram is free, has no per-message cost, supports both outbound notifications and inbound absence reporting through one bot, and is already in daily use across agencies in this market. Each staff record carries a preferred channel, and Workflow C routes per person.

**Tradeoff.** Inbound messages require a publicly reachable webhook, which is the only part of the system needing internet exposure. The pilot uses a tunnel; production needs a domain.

---

## 5. Logic design

### 5.1 Where the model is used, and where it is not

The governing rule: language tasks go to the model, decisions do not.

| Task | Nature | Handled by |
|---|---|---|
| Parse free-text availability into dated rows | Language | Groq |
| Parse an absence message | Language | Groq |
| Draft a personalised notification | Language | Groq |
| Summarise coverage gaps | Language | Groq |
| Match role and client certification | Logic | **Code node** |
| Detect time overlap | Logic | **Code node** |
| Compute fairness and rank candidates | Logic | **Code node** |
| Choose who gets the shift | Logic | **Code node** |

An assignment must be exact, reproducible, instant, free, and defensible when a host asks why they received three shifts and a colleague received six. A language model satisfies none of those five. The last matters most: an assignment that cannot be explained is one that cannot be defended.

### 5.2 Hard constraints

A candidate failing any of these is excluded outright. They are applied per slot, not per session, so a session needing two hosts and one admin is treated as three independent placements.

- Active on the roster
- Role matches the slot — a member marked "Both" satisfies either
- Certified for that client brand, where the client requires certification
- An availability record covers the **full** session window, not merely overlaps it
- No absence recorded against that window
- No existing assignment overlapping the window, plus a 30-minute buffer for setup and teardown
- Below their weekly session cap
- Not already assigned to the same session in the other role

### 5.3 Fairness

Counting shifts is not a fair measure. A Tuesday afternoon session for a small brand and a Friday evening session for the largest brand carry different visibility, different GMV, and usually different incentive upside. A scheduler measuring by shift count can distribute work evenly while consistently allocating the desirable slots to the same few people.

Each session therefore carries a weight:

```
weight = 1.0  ×  (1.5 if start is 18:00–22:00)  ×  (Tier A 1.4 | B 1.2 | C 1.0)
```

Range 1.0 to 2.1. Accumulated weight over a rolling 28-day window then produces a fairness score:

```
score = (weighted load + 1) ÷ (slots the person was available for + 1)
```

Lowest score is selected first. Dividing by offered availability rewards people who make themselves available without penalising part-timers for lower capacity. The +1 on both terms prevents a new joiner producing a division by zero.

**Measured behaviour.** On a dataset where six staff carried three weeks of heavy prior load, the engine allocated them 2.1 weighted points in the following week against 36.3 for everyone else. That is a deliberately hard correction which self-balances over two to three weeks. A gentler exponential-decay variant is documented in the design notes for production use.

### 5.4 Ranking and ordering

Surviving candidates are ordered by fairness score ascending, then by longest interval since their last shift, then by a stable hash of their record ID. The hash tie-break means an identical input always produces an identical schedule, which matters for auditability.

**Sessions are filled hardest-first, not chronologically.** Slots are sorted by eligible-candidate count ascending. Filling a session with twelve eligible hosts before one with two can strand the scarce session with nobody remaining. This single ordering decision is the difference between roughly 94% and 100% coverage on realistic data, and costs nothing to implement.

---

## 6. The five workflows

| Workflow | Trigger | What it does | Reqs |
|---|---|---|---|
| **A — Core scheduling engine** (18 nodes) | Weekly cron | Pulls sessions, roster, availability, absences and 28 days of history; runs the engine; writes draft assignments; reports gaps | 2, 3, 4 |
| **B — Absence replacement** (29 nodes) | Telegram message | Parses the absence, finds the affected shift, runs the engine in single-slot mode, assigns and notifies a replacement, or escalates with nearest-miss candidates | 1, 7 |
| **C — Publish, notify, audit** (20 nodes) | Called by A, B or E | Per-person notifications on their own channel, status updates, audit entries, HTML and calendar exports | 6, 8, 9 |
| **D — Availability intake** (10 nodes) | Hosted web form | Parses free-text availability into one dated row per day; flags low-confidence parses for review | 1 |
| **E — Publish and change watcher** (18 nodes) | Cron, every 15 min | Publishes newly approved drafts; detects manual edits to published rows, audits them, and re-notifies affected staff | 5, 6, 9 |

Nothing Workflow A produces is visible to staff. Assignments are written with status Draft and an unticked Approved box. The scheduler works in a filtered Airtable view, edits freely, and ticks Approved when satisfied. Workflow E picks that up and hands the records to Workflow C.

After publication the scheduler can still edit. Workflow E detects the change within its polling interval, writes an audit entry recording who made it and the before and after values, and re-notifies the affected person if the change actually affects them. A change made without a stated reason is still logged, marked as not provided, and the scheduler receives a prompt.

---

## 7. Data model

Seven Airtable tables, 82 fields. Every cross-table reference is a linked record rather than a text field, so matching is by record identity.

| Table | Purpose | Notable fields |
|---|---|---|
| **Clients** | Brand configuration and desirability weighting | Brand Tier, Platform, Requires Certification |
| **Staff** | Roster, capability, contact routing | Role, Certified Clients, Max Sessions Per Week, Notify Channel |
| **Sessions** | Demand — what needs staffing | Date, Start/End Time, Client, Hosts Required, Admins Required |
| **Availability** | When each person can work | Staff, Date, Available From/To, Source, Needs Review |
| **Absences** | Last-minute unavailability | Staff, Date, Status, Raw Message, Parse Confidence |
| **Assignments** | Output — one row per person per session | Session, Staff, Role, Status, Approved, Logged State |
| **Audit Log** | Record of every change | Action, Actor, Before/After Value, Reason |

Three schema decisions carry more weight than they appear to. Times are stored as zero-padded `"HH:MM"` text rather than Airtable time fields, because the engine compares them as strings and the native type serialises differently — a mismatch there causes every conflict check to pass silently. The Assignments table carries nine lookup fields so that downstream workflows read session and contact context off a single row. And two formula fields flatten lookups to plain strings, because Airtable filter formulas cannot reliably compare a lookup array to a literal.

---

## 8. Functional prototype — evidence it runs

The system was executed end to end against a live Airtable base, the Groq API and a live Telegram bot. This section records what that produced.

### 8.1 Assignment run

```
slotsTotal: 26    slotsFilled: 23    slotsUnfilled: 3    coverage: 88.5%    runtime: <60s
```

All three unfilled slots were the same role on the same client, and the engine reported the blocking constraint rather than an empty cell: ten staff not certified for that brand, five in the wrong role. A scheduler can act on that immediately — certify someone, or reassign the session.

*A run that explains its own gaps is more useful than one that hides them, which is why the gaps were left in rather than tuned away.*

> 📸 **SCREENSHOT 2 — Engine output**
> n8n → Workflow A → Assignment Engine node → JSON view, showing stats and gaps

### 8.2 Human review and override

The scheduler approval gate and the post-publication override path were both exercised. Editing a published assignment produced an audit entry attributed to a named person, with before and after values, and triggered a change notification to the newly assigned staff member. A second edit made without a reason was still logged, marked "NOT PROVIDED", and generated a prompt to the scheduler.

> 📸 **SCREENSHOT 3 — Scheduler Review view**
> Airtable → Assignments → Scheduler Review view, showing Draft rows and the Approved column

### 8.3 Notifications, absence handling and exports

Publication delivered per-person Telegram messages generated by the model. An absence reported in plain language — *"I can't make my shift on the 12th, I'm sick"* — was parsed at 0.9 confidence, matched to the correct shift, and a qualified replacement was assigned and notified automatically, with the original assignment marked Replaced.

Availability submitted as *"Mon-Wed evenings from 6pm, Thursday all day, not available Friday"* produced four correctly dated rows and, correctly, no Friday row — the model treated the exclusion as an exclusion.

Exports produced a styled HTML snapshot and a valid RFC 5545 calendar file with per-event alarms, which imports into Google Calendar, Outlook and Apple Calendar.

> 📸 **SCREENSHOT 4 — Telegram notifications**
> Telegram → the bot chat, showing the scheduler gap alert, the per-person publication messages, and the change notification produced by the override

> 📸 **SCREENSHOT 5 — Audit log**
> Airtable → Audit Log, showing the Action and Actor columns with both workflow and human actors

### 8.4 What testing found

Building and running the system surfaced eleven defects. Every one of them failed silently — the workflow reported success and did nothing. They are recorded here because they are the clearest evidence that this was executed rather than only designed.

| Defect | Consequence |
|---|---|
| A query returning zero rows halts the whole chain | n8n skips the node and everything downstream, with no error raised |
| Lookup fields cannot be compared in Airtable filter formulas | Two workflows returned nothing, indefinitely, without complaint |
| Airtable node output shape varies by version | Every field read as undefined; the engine assigned nobody and reported success |
| Typed sub-workflow inputs arrive null from an imported JSON | One workflow called another and passed nothing |
| A node reading its own input after a send step | Item shape had already changed; the record ID was undefined |
| The file converter base64-decodes rather than encodes | Exports were binary noise that still downloaded as plausible files |
| In-memory state does not persist on manual runs | Change detection could never fire, and was also lost on restart |
| A misconfigured API credential | Every model call quietly used its fallback template for days; the system appeared to work perfectly |

**The common thread:** n8n features that depend on live editor state do not survive a JSON import. The design now either avoids that machinery or handles both cases. All eleven fixes are covered by an automated test suite of 41 assertions which reads the code directly out of the workflow files, so it tests the shipped artifacts rather than a copy.

---

## 9. Before and after, against the nine requirements

The "before" column describes the assumed baseline set out in section 2. It is a reconstruction, not a confirmed account of Klaiya's current system.

| # | Requirement | Before *(assumed)* | After |
|---|---|---|---|
| 1 | Data input | Chat messages retyped by hand | Form and Telegram, parsed into dated structured rows |
| 2 | Automated assignment | 100% manual, hours per week | A full week drafted in under 60 seconds |
| 3 | Conflict prevention | Misses cross-client overlaps | Zero double-bookings, structurally prevented |
| 4 | Fair allocation | A shift count at best | Weighted by prime time and brand tier, normalised by availability |
| 5 | Manual overrides | Uncontrolled — any cell editable | Draft, review, approve, publish; post-publication edits audited and re-notified |
| 6 | Notifications | Group broadcast, silent on change | Per person, per channel, fires on publication and on change |
| 7 | Absence management | Group chat, first responder wins | Qualified, available, fairest replacement assigned and contacted |
| 8 | Export and publish | A live, mutable sheet | Shared view, HTML snapshot, and calendar feed |
| 9 | Audit trail | Cell history, no reason recorded | Who changed what, when and why, including human edits |

---

## 10. Risks and edge cases

| Risk | Likelihood | Handling |
|---|---|---|
| Language model unavailable or rate-limited | Medium | Every call has a static-template fallback; schedules still generate |
| An absence message is misread | Medium | Below 0.7 confidence the system asks for clarification rather than acting |
| No qualified replacement exists | High | Escalates to the scheduler with nearest-miss candidates and the single constraint each failed |
| Staff never submit availability | High | They become ineligible and appear in the gap report by name, not silently |
| Airtable free-tier record cap | Certain, ~4 months | Quarterly archiving, or a paid tier |
| A schedule that is legal but unpopular | Medium | The approval gate exists for this. Fairness is a heuristic, not a verdict |
| Concurrent approvals by two schedulers | Low | Record IDs make writes idempotent; the audit log shows both actors |

---

## 11. Pilot versus production

What has been built is a pilot-grade deployment of production-grade logic. The same five workflow files run unchanged on production infrastructure; nothing requires rewriting to scale.

| Concern | Pilot, as built | Production |
|---|---|---|
| Hosting | Docker on a workstation | Small VPS (~$6/month) or n8n Cloud |
| Inbound webhooks | Temporary tunnel | Real domain with HTTPS |
| Data | Airtable free tier | Paid tier, or quarterly archiving |
| Secrets | Environment variables | Secret store, rotated tokens |
| Failure handling | Manual observation | n8n error workflow alerting the scheduler |
| Not yet built | — | Accept/decline confirmations, two-way calendar sync, per-person portal |

---

## 12. How to run it

The accompanying files reproduce the system from scratch. Scripts create and verify the Airtable schema — 82 fields across 7 tables — rather than requiring it to be built by hand, since a single mistyped field name causes silent failure.

| Path | Contents |
|---|---|
| `airtable-setup/` | Base creation, schema verification, seeding, workflow configuration, health check |
| `n8n-workflows/configured/` | The five workflow JSON files, ready to import |
| `n8n-workflows/*-test.js` | The 41-assertion offline test suite; runs with node, no services required |
| `02-solution-design.md` | Full technical design including engine source and model prompts |
| `03-airtable-schema.md` | Table-by-table schema reference |
| `04-setup-and-deployment.md` | Step-by-step setup, testing order, troubleshooting |

Setup is roughly three hours from an empty Airtable base to a working system, most of it unattended.

---

### Two things I would suggest next

**First, replace the assumed baseline in section 2 with a real one.** Everything comparative in this document rests on a reconstruction, and I would rather measure against fact.

**Second, a two-week pilot on a single client brand** — enough to prove the approach against real sessions and real people without exposing the whole roster to a system that has not yet run in anger.
