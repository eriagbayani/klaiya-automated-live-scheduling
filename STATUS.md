# Project Status — 9 Aug 2026

**Deadline: 12 Aug 2026 (3 days).** All nine requirements are built and **verified running against
live Airtable, Groq and Telegram**. What remains is a clean rebuild, a re-seed, and the deck.

---

## Requirement checklist

| # | Requirement | Built | Verified live | Evidence |
|---|---|:---:|:---:|---|
| 1 | Data Input | ✅ | ✅ | Form → Groq → 4 dated rows, Friday correctly excluded; absence parsed at 0.9 confidence |
| 2 | Automated Assignment | ✅ | ✅ | 26 slots, 23 filled, 3 explained gaps |
| 3 | Conflict Prevention | ✅ | ✅ | Engine ran clean; no double-bookings |
| 4 | Fair Allocation | ✅ | ✅ | Weighted fairness applied |
| 5 | Manual Overrides | ✅ | ✅ | Approve→publish gate **and** post-publish override detected |
| 6 | Notifications | ✅ | ✅ | Telegram on publish and on change |
| 7 | Absence Management | ✅ | ✅ | Absence logged, Jenelyn Cruz auto-assigned and notified, original marked `Replaced` |
| 8 | Export & Publish | ✅ | ✅ | HTML 1.14 kB + valid RFC 5545 ICS |
| 9 | Audit Trail | ✅ | ✅ | `MANUAL_OVERRIDE` ×2 with a **human** actor — with a reason, and without one (logged as `NOT PROVIDED` + scheduler nudge) |

**Live numbers from the real run** — use these in the deck, they're measured not projected:

```
slotsTotal: 26   slotsFilled: 23   slotsUnfilled: 3   coverage: 88.5%
```

The 3 gaps are all the AuraTech Live Admin slot, correctly explained by the engine as
`{"not-certified": 10, "role": 5}`. Keep them — a run that explains its own gaps demos better
than a perfect one.

---

## What's left

Build work is done. What remains is hardening, the deck, and rehearsal.

### 1. Clean re-import of all five (~40 min) — do this on the 10th

Your n8n has accumulated hand-patches across many rounds of debugging. Rebuild from source so what
you demo matches what you hand over.

```powershell
node airtable-setup\configure-workflows.js
```

Then in n8n: delete all five, import from `n8n-workflows\configured\` — **C first**, since B and E
reference it. Attach credentials. Disable C's `Send via Slack` and `Send via Email` nodes (no
credentials for those; n8n refuses to publish with unconfigured nodes). Link C's ID into B's one
call node and E's two.

**Publish order matters in n8n 2.x:** a sub-workflow must be published before its caller. So
publish C, then B, then D. Leave A and E unpublished during prep and run them with Execute
Workflow — publishing arms their schedules.

Then re-test A → E → C end to end, plus D and B.

### 2. Re-seed on the 11th (~5 min)

```powershell
node airtable-setup\seed-data.js
```

`seed-data.js` sets the demo week relative to *the day you run it*. Seeded on the 8th, Monday and
Tuesday sessions will already have slipped into the past and dropped out of Workflow E's window.

Afterwards: run **E once** so `Logged State` baselines match the fresh data, then
`check-state.js` to confirm a clean slate.

### 3. Build the pitch deck (not started) — the main remaining task

Roughly 12 slides. Content is ready in [`02-solution-design.md`](02-solution-design.md) §11
(before/after) and [`01-assumed-baseline.md`](01-assumed-baseline.md).

**Carry the baseline caveat onto every slide** — the "before" column is an *assumed* typical
mid-size agency setup, not Klaiya's confirmed current system. Label it visibly and say it out loud.

Strongest material available:

- **Measured numbers, not projections** — 26 slots, 23 filled, 3 self-explained gaps
- **A live audit log with five actors** — Workflows A, B, C plus two named humans. One screenshot
  makes the requirement-9 case
- **Eleven bugs found by running it** (below). Evidence it works, not just that it compiles

### 4. Rehearse (~1 hr) — the 11th

Demo sequence from [`04-setup-and-deployment.md`](04-setup-and-deployment.md) §10 — all nine
requirements in about six minutes:

| Step | Show | Req |
|---|---|---|
| 1 | Submit availability form in plain English | 1 |
| 2 | Run Workflow A — coverage stats + gap report | 2, 3, 4 |
| 3 | Scheduler Review view, edit one, tick Approved | 5 |
| 4 | Run E; notification lands on your phone | 6 |
| 5 | Message the bot "can't make my shift", replacement assigned | 7 |
| 6 | Download the ICS, drag into a calendar | 8 |
| 7 | Open the Audit Log — every step above is a row | 9 |

Run it start to finish three times. Screenshot every step as a fallback.

**Demo-day startup order** (Workflow B depends on all three):

1. `cloudflared tunnel --url http://localhost:5678` in its own window — leave it open
2. `docker run ... -e WEBHOOK_URL=<that day's cloudflare URL> ...`
3. Unpublish and republish B so it registers the new webhook

The trycloudflare URL changes on every restart, so this has to happen in this order, on the day.
If it fights you, demo B from a recording — the other four run entirely on localhost.

---

## Suggested schedule

| Day | Work |
|---|---|
| **Sun 10 Aug** | Clean re-import of all five · full end-to-end retest |
| **Mon 11 Aug** | Re-seed · build the deck · rehearse ×3 · capture screenshots |
| **Tue 12 Aug** | Present |

Two clear days for the deck and rehearsal, with the build already proven.

---

## Things that will bite you if forgotten

| | |
|---|---|
| **Workflow E's window** | E only looks at sessions from yesterday onward. Historical rows are invisible to it — that's correct, but it made change-detection testing confusing for an hour |
| **Re-importing C changes its ID** | Every re-import breaks B's and E's call nodes. Select C from the **dropdown by name**, not by pasting an ID |
| **`docker start`, never `docker run` again** | A second `run` with the same name fails; a different name gives you a blank n8n. Workflows live in the `n8n_data` volume |
| **`N8N_ENCRYPTION_KEY` must stay identical** | Change it and every stored credential becomes unreadable |
| **Message your bot once from any new account** | Telegram bots can't initiate conversations — "chat not found" looks exactly like a credential error |
| **Run E once after any data reset** | Otherwise it reports the reset as manual changes |
| **n8n 2.x removed `--tunnel`** | Use `cloudflared tunnel --url http://localhost:5678` plus `WEBHOOK_URL` on the container. The flag is silently ignored, not rejected |
| **Cloudflare quick-tunnel URLs are ephemeral** | New URL on every `cloudflared` restart; n8n's `WEBHOOK_URL` must match, which means restarting the container too |
| **Publish order in n8n 2.x** | A sub-workflow must be published before its caller. C before B and E |
| **Unconfigured nodes block publishing** | Even on branches nothing routes to. Disable C's Slack and Email nodes rather than deleting — they keep the multi-channel story visible |
| **Header Auth "Name" is the HTTP header name** | Not the credential label. `Authorization`, value `Bearer gsk_...`. Putting anything with a space there gives `ERR_INVALID_HTTP_TOKEN` |

---

## Bugs found and fixed while testing

Worth a slide of its own — it's evidence the thing actually runs, not just compiles.

| # | Bug | Why it mattered |
|---|---|---|
| 1 | Airtable lookup fields can't be compared in `filterByFormula` | B and E returned zero rows, silently, forever |
| 2 | `$items().length` in IF nodes | The "nothing found" branch was unreachable |
| 3 | Zero-result search halts the whole chain | `Get Absences` legitimately returned 0 and killed Workflow A with no error |
| 4 | Airtable node output shape varies by version | Every field read `undefined`; engine assigned nobody, no error |
| 5 | n8n validates required params on *every* node | An unused Email branch blocked the entire workflow from starting |
| 6 | Typed workflow inputs arrive null from an imported JSON | E called C and C got nothing |
| 7 | `Shape Publish Update` read `$input` after a Send node | Item shape had already changed; `assignmentId` was `undefined` |
| 8 | `convertToFile` base64-*decodes* its input | Exports were binary garbage |
| 9 | `$getWorkflowStaticData` doesn't persist on manual runs | Change detection could never fire; also lost on container restart |
| 10 | Groq credential silently fell back for days | Header name was wrong, so every LLM call quietly used its static template. The system "worked" the whole time — which is exactly why the fallbacks are worth having, and exactly why you must verify the happy path separately |
| 11 | B identified the absent person by the name Groq read | A typo'd name meant "no shift found". Now prefers the name match but should key off the Telegram chat ID in production |

Common thread: **n8n features that depend on live UI state don't survive a JSON import.** The
design now either avoids that machinery or handles both cases. Every fix is covered by the offline
test suite.

---

## Offline test suite

Both run with plain `node` — no n8n, no Airtable. They read Code node source directly out of the
workflow JSON, so they test the real artifacts.

```bash
node n8n-workflows/engine-test.js
```

```bash
node n8n-workflows/node-tests.js
```

**51 assertions, all passing.** Also your demo-day fallback: if n8n misbehaves live,
`engine-test.js` still proves the algorithm works in front of the room.

---

## Files

| Path | What |
|---|---|
| `01-assumed-baseline.md` | Assumed current-state baseline + how to present it honestly |
| `02-solution-design.md` | Full technical design, engine source, Groq prompts, before/after |
| `03-airtable-schema.md` | Table-by-table schema with the gotchas |
| `04-setup-and-deployment.md` | Setup guide, testing order, demo-day checklist |
| `STATUS.md` | This file |
| `airtable-setup/` | Base creation, verification, seeding, config, health check |
| `n8n-workflows/` | Five workflow JSONs + offline tests |
| `n8n-workflows/configured/` | **Import these** — placeholders already filled |
