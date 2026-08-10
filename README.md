# Klaiya — Automated Live Scheduling Workflow

Solution design and working prototype for automating the scheduling of Live Hosts and Live Admins
at a livestream commerce agency.

**n8n · Airtable · Groq (Llama 3.3) · Telegram**

| | |
|---|---|
| 5 n8n workflows | 95 nodes |
| 7 Airtable tables | 82 fields |
| 9 functional requirements | all executed end to end against live services |
| 41 automated assertions | all passing |

---

## What this does

Manual scheduling produces four recurring failures: overlapping bookings, sessions that reach air
time understaffed, workload concentrating on the same reliable people, and a scramble when someone
becomes unavailable at short notice.

Those are four symptoms of one gap. A shared spreadsheet and a reminder bot automate *storage* and
*messaging*. They do not automate *decisions* — who is qualified, what clashes, who deserves the
next shift, who covers an absence.

This system automates those decisions:

- A **deterministic engine** matches qualified staff to sessions, prevents overlaps structurally,
  and distributes work by a weighted fairness measure rather than a raw shift count
- A **language model** is used only for language — reading free-text availability and absence
  messages, and writing notifications. It never decides who works
- A **human approval gate** sits between the draft and anything reaching staff, and every override
  after publication is detected, audited and re-notified

---

## The design decision worth reading

The assignment engine is plain JavaScript, not an LLM call. An assignment has to be exact,
reproducible, instant, free, and defensible when a host asks why they got three shifts and a
colleague got six. A language model is none of those five things — and the last matters most,
because an assignment that cannot be explained cannot be defended.

Every model call has a static-template fallback, so an outage degrades message wording rather than
blocking a schedule.

---

## Repository layout

| Path | Contents |
|---|---|
| `01-assumed-baseline.md` | Assumed current-state baseline and how to present it honestly |
| `02-solution-design.md` | Full technical design — engine source, prompts, node-by-node breakdown |
| `03-airtable-schema.md` | Table-by-table schema reference |
| `04-setup-and-deployment.md` | Setup, testing order, troubleshooting |
| `airtable-setup/` | Scripts to create, verify, seed and health-check the Airtable base |
| `n8n-workflows/` | The five workflow JSON files plus the offline test suite |

> The workflow JSON files use `REPLACE_WITH_*` placeholders for base, table and credential IDs.
> `airtable-setup/configure-workflows.js` fills them from your own live base.

---

## Running it

Requires Docker and Node 18+.

**1. Create an empty Airtable base**, then a personal access token with `schema.bases:read`,
`schema.bases:write`, `data.records:read`, `data.records:write`.

```bash
export AIRTABLE_TOKEN=pat...
export AIRTABLE_BASE_ID=app...
```

**2. Build and seed the base:**

```bash
node airtable-setup/create-base.js
node airtable-setup/verify-schema.js
node airtable-setup/seed-data.js
```

`create-base.js` creates everything the Airtable API permits and prints exact instructions for the
handful of computed fields it cannot. `verify-schema.js` catches the mismatches that otherwise fail
silently at runtime.

**3. Start n8n:**

```bash
docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n \
  -e GENERIC_TIMEZONE=Asia/Manila -e TZ=Asia/Manila \
  docker.n8n.io/n8nio/n8n
```

**4. Configure and import the workflows:**

```bash
node airtable-setup/configure-workflows.js
```

Import the generated files from `n8n-workflows/configured/`, attach credentials, and publish
Workflow C before B and E.

Full detail in [`04-setup-and-deployment.md`](04-setup-and-deployment.md).

---

## Tests

No n8n, no Airtable, no network. Both read the Code node source directly out of the workflow JSON,
so they test the shipped artifacts rather than a copy.

```bash
node n8n-workflows/engine-test.js
node n8n-workflows/node-tests.js
```

Covers no double-bookings, certification and role enforcement, availability windows, weekly caps,
deterministic reruns, fairness correction, RFC 5545 calendar validity, availability parsing
including malformed input, and change detection.

---

## A note on the baseline

Everything in this repository that compares against a "current" or "existing" system refers to an
**assumed** baseline — a reconstruction of what a typical mid-size agency setup looks like. The
actual current-state automation was not available to observe. That caveat is carried through every
comparison deliberately, and should be read as an assumption rather than a finding.
