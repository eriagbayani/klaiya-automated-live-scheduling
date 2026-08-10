# Assumed Current-State Baseline — Klaiya Live Scheduling

> ## ⚠️ READ THIS BEFORE PRESENTING
> **Everything in this document is an ASSUMPTION, not confirmed fact.**
>
> Klaiya's actual scheduling automation has not been observed, demoed, or described to us.
> What follows is a *reasonable reconstruction* of what a mid-size TSP/MCN agency's partial
> scheduling automation typically looks like, built so we have a concrete comparison point.
>
> **When presenting, say so out loud.** Suggested phrasing for the slide and the verbal:
>
> > *"I didn't have visibility into your current setup, so I modelled a typical mid-size
> > agency baseline. If any of this is wrong, tell me — the gaps change, but the solution
> > design mostly doesn't, because it's built around the requirements, not around my guesses."*
>
> This framing is a strength, not a weakness: it invites the stakeholder to correct you,
> which turns the presentation into a working session instead of a pitch they judge.

---

## 1. The assumed baseline, in one paragraph

A shared spreadsheet (Google Sheets) holds the staff roster and a week-per-tab schedule grid.
Availability arrives as free-text chat messages or a Google Form, and a coordinator retypes it
into the sheet. Leave/absence is messaged to a supervisor. A bot (Telegram or Slack, or Google
Calendar notifications) posts the daily lineup to a group chat and sends "your shift starts soon"
reminders. **A human does 100% of the actual matching** — reading who's free, remembering who's
qualified for which client, and typing names into cells. Absences are handled by the coordinator
posting "who can cover 7pm Brand X?" into a group chat.

**Scale assumption (state this too):** ~20–50 Live Hosts and Live Admins, multiple concurrent
daily livestream sessions across several client brands. Roughly 25–35 sessions/week, ~2 staff per
session, so ~60–70 assignments to place per week.

---

## 2. Requirement-by-requirement assessment

Legend: 🟢 **Covered** · 🟡 **Half-covered** · 🔴 **Not covered**

| # | Requirement | Assumed status | What the baseline probably *does* | What it probably *doesn't* |
|---|---|---|---|---|
| 1 | **Data Input** | 🟡 | Roster tab with names, roles, contact. Availability collected via form/chat. | Data is unstructured and unvalidated. Free-text availability ("I can't do Tues, maybe Thurs pm") is retyped by hand — slow and lossy. Leave lives in a different place from availability. No single source of truth. |
| 2 | **Automated Assignment** | 🔴 | Nothing. | The core gap. A spreadsheet cannot match qualified staff to sessions. Every assignment is a human decision, and qualification rules (which host is approved for which client brand) live in someone's head. |
| 3 | **Conflict Prevention** | 🟡 | Possibly conditional formatting that highlights a duplicated name within one day/tab. | Cannot detect **time-overlap across client tabs** — the actual failure mode. Host booked Brand A 19:00–21:00 and Brand B 20:00–22:00 on two different tabs looks fine to the sheet. No pre-publish "is every session fully staffed?" check. |
| 4 | **Fair Allocation** | 🔴 | Maybe a `COUNTIF` shift tally per person. | A raw shift count isn't fairness. No weighting for **session desirability** — prime-time slots, high-GMV brands, and incentive-tied sessions are worth more than a Tuesday 2pm. No adjustment for how much someone was actually *available*. Real-world result: reliable staff get overloaded, and the good slots concentrate among favourites. |
| 5 | **Manual Overrides** | 🟢 | Fully covered, trivially — it's a spreadsheet, everything is an override. | No *controlled* review step (draft → approve → publish), and no record of what was overridden or why. Covered, but uncontrolled. |
| 6 | **Notifications** | 🟡 | Bot posts the daily lineup to a group chat; sends pre-shift reminders. | Broadcast, not personalised — everyone reads everyone's schedule and finds their own row. Crucially, **doesn't fire on change**. A reassignment gets announced by a human in a group chat, or not at all. |
| 7 | **Absence Management** | 🔴 | Purely human. Host messages coordinator → coordinator asks the group → first responder takes it. | No qualification check on the volunteer, no availability check, and **first-come-first-served actively works against fairness** (the same eager few absorb all the cover shifts). This is the slowest and highest-risk part of the whole process — and it happens under time pressure. |
| 8 | **Export & Publish** | 🟡 | The shared sheet *is* the publish mechanism, and it is genuinely accessible. | No clean per-person view, no PDF/immutable snapshot, no calendar sync. Staff work off a *live* document that can change under them with no signal — so "I checked the sheet" and "the sheet is correct" can both be true and still cause a no-show. |
| 9 | **Audit Trail** | 🟡 | Google Sheets version history technically exists. | Unusable for accountability. It records *cell edits*, not *decisions* — "B14 changed from Maria to Jen" with no who-authorised-it and no **why**. No reason capture, so recurring problems are invisible. |

**Tally: 1 covered · 5 half-covered · 3 not covered.**

The shape of the gap is consistent and worth naming explicitly in the pitch:

> The assumed baseline automates **communication** (reminders, broadcasts) and **storage**
> (a shared sheet). It does not automate **decisions** — matching, conflict-checking,
> fairness, or replacement-finding. Those are exactly the four things that consume the
> scheduler's time and cause the four stated problems.

That single sentence is the entire before/after thesis.

---

## 3. Estimated cost of the baseline

Label these as **estimates derived from the assumed baseline**, not measured figures.

| Activity | Assumed frequency | Est. time |
|---|---|---|
| Collecting + retyping availability | Weekly | 45–60 min |
| Building the draft schedule (~65 assignments) | Weekly | 3–4 hrs |
| Checking for conflicts / chasing gaps | Weekly | 45 min |
| Publishing + answering "what's my shift?" | Weekly | 30 min |
| **Absence firefighting** | 3–5×/week | 20–40 min *each* |
| | **Weekly total** | **~7–10 hrs of a coordinator's week** |

Plus the costs that don't show up as hours: sessions that start understaffed, hosts double-booked
and pulled off a client mid-week, and the slow attrition of staff who feel the good slots never
come their way.

---

## 4. How to present this honestly

**Do:**
- Put "ASSUMED BASELINE — not confirmed" on the slide itself, in visible type.
- Open the before/after section by inviting correction (see phrasing at the top).
- Note that the *solution* is designed against the 9 stated requirements, so it holds up even
  if the baseline turns out to be different.

**Don't:**
- Say "your current system can't do X." Say "a typical setup like this wouldn't cover X — does yours?"
- Put unverified numbers in a headline. The hour estimates belong in the appendix or the verbal,
  clearly labelled, not on a big "SAVES 8 HOURS/WEEK" slide you can't defend.

---

## 5. What would change this document

If any of these turn out to be true, revise before presenting:

- They already use Airtable/Notion/a real scheduling tool → requirements 1, 3, 8 move up.
- Their bot already does per-person DMs → requirement 6 becomes 🟢, drop that from the gap list.
- They have a qualification matrix (which host ↔ which client) written down → requirement 2's
  gap narrows to just the matching, and our build gets *easier* (we ingest their matrix).
- Fairness is already tracked deliberately → requirement 4 becomes a refinement, not a gap.
