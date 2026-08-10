# Presenter Script — Klaiya Automated Live Scheduling

For a recorded walkthrough. Written to be **read aloud** while screen sharing.

**Total runtime: ~13 minutes** — about 7 on the deck, 6 on the demo.
Cues in `[BRACKETS]` are actions, not words to say.

> Record in segments and stitch. You do not need one clean take. Natural cut points are marked
> `— CUT —`. If a segment goes wrong, redo only that segment.

---

## Before you hit record

- [ ] `cloudflared tunnel --url http://localhost:5678` running in its own window
- [ ] n8n started with that day's `WEBHOOK_URL`, workflows C, B, D published
- [ ] Workflow B unpublished and republished so the webhook points at today's tunnel
- [ ] `node airtable-setup\check-state.js` → "NO PROBLEMS FOUND"
- [ ] Draft assignments present and unapproved, so there's something to publish on camera
- [ ] **Telegram Desktop** open and logged in — do not film your phone
- [ ] Browser tabs in order: Airtable Assignments · Airtable Audit Log · n8n · the availability form
- [ ] Do one silent dry run of the whole sequence first
- [ ] Close Slack, email, and anything that shows notifications

---

# PART ONE — THE DECK  (~7 min)

## Slide 1 — Title

> Hi, I'm Rainerio. This is my solution design for the Automated Live Scheduling Workflow.
>
> I want to be upfront about what this is. It isn't a concept deck. It's a working system —
> five n8n workflows, ninety-five nodes, running against a live Airtable base, a live AI model,
> and a live Telegram bot. Every one of the nine requirements in the brief has been executed
> end to end, not just designed. The numbers I'll show you later are measured from actual runs.
>
> Let me start with the problem.

`— CUT —`

## Slide 2 — What manual scheduling costs

> The brief names four failures. Double-bookings. Sessions that reach air time understaffed.
> Workload that piles onto the same reliable people. And the scramble when someone calls in sick.
>
> The one I'd single out is the first. When each client brand lives on its own tab, a host booked
> for Glow at seven and AuraTech at eight looks completely fine on both. Nothing in a spreadsheet
> is watching across brands.
>
> These look like four separate problems. I don't think they are. I think they're four symptoms
> of one missing thing, and I'll come back to that.

## Slide 3 — The starting point

> First, an important caveat, and I'd like to say it clearly rather than bury it.
>
> **I had no visibility into Klaiya's current scheduling automation.** I know something is in place,
> but I couldn't confirm what. So everything in this "before" column is an assumption — I've
> modelled what a typical mid-size agency setup looks like: a shared spreadsheet, a reminder bot,
> and a human doing the actual matching.
>
> If any of that is wrong, please tell me. The gaps would change. The solution mostly wouldn't,
> because it's built against the nine requirements rather than against my guesses.
>
> On that assumed baseline: one requirement is already covered — manual overrides, and only
> trivially, because a spreadsheet has no controls at all. Five are half covered. Three aren't
> touched: automated assignment, fair allocation, and absence management.

**Do not rush this slide.** Read the caveat properly. It's what stops someone contradicting you later.

`— CUT —`

## Slide 4 — The insight

> Here's the pattern in those gaps.
>
> A reminder bot and a shared sheet automate two things: messaging and storage. What they don't
> automate is *deciding*. Who's qualified. What clashes. Who deserves the next shift. Who covers
> the absence.
>
> All four of those are still a person, and they're exactly the four that produce the problems on
> the previous slide. So that's what I built — not another way to send reminders, but a way to make
> those four decisions automatically and defensibly.

## Slide 5 — How it works

> Four layers.
>
> Triggers at the top — a weekly schedule, a form, Telegram messages, and the scheduler's approval.
>
> n8n orchestrates: five workflows, ninety-five nodes.
>
> The highlighted band is the assignment engine. I've pulled it out separately because it's the
> part that must never be probabilistic. It's plain JavaScript — role matching, certification,
> conflict checks, fairness ranking.
>
> Underneath, Airtable for data, and Groq running Llama 3.3 for language tasks only. Then delivery:
> personal notifications, a shared view, and a calendar file.

## Slide 6 — Where the AI is, and isn't

> This is the design decision I'd most want to defend.
>
> The AI does four things, all of them language problems: it reads free-text availability, reads
> absence messages, writes notifications, and summarises gaps. Turning messy words into clean words.
> That's what these models are good at.
>
> It does not decide who works. That's deterministic code.
>
> The reason is on the bottom bar. An assignment has to be exact, reproducible, instant, free, and
> defensible when a host asks why they got three shifts and someone else got six. A language model
> is none of those five things.
>
> And every AI call has a plain-template fallback. If the model is down, the messages read more
> robotic — the schedule still gets built.

`— CUT —`

## Slide 7 — Fairness is not a shift count

> Fairness needs more thought than it usually gets.
>
> A Tuesday two o'clock session for a small brand and a Friday eight o'clock session for your
> biggest brand are not the same shift. One has more visibility, more GMV, usually more incentive
> upside. If you measure fairness by counting shifts, you can call a schedule fair while quietly
> handing every good slot to the same few people.
>
> So each session carries a weight — prime time multiplies it, brand tier multiplies it. And the
> score divides accumulated load by how much availability someone actually offered, so people who
> make themselves available are rewarded without part-timers being penalised.
>
> On the test data, six people carried three weeks of heavy load. The next week the engine gave them
> two point one weighted points against thirty-six for everyone else. That's a hard correction —
> deliberately. It self-balances over two to three weeks.

## Slide 8 — Before and after

> All nine requirements. Left column is the assumed baseline, right is what's built and verified.
>
> I won't read every row. Three worth calling out.
>
> Assignment: hours a week of manual work becomes a full week drafted in under a minute.
>
> Absence: instead of asking a group chat and giving the shift to whoever replies first — which is
> exactly what concentrates workload on the same people — the replacement goes through the same
> fairness rules.
>
> And audit: not "a cell changed", but who changed what, when, and why.

`— CUT —`

## Slide 9 — Measured, not projected

> These are from an actual run, not an estimate.
>
> Twenty-six slots to fill. Twenty-three filled automatically. Three gaps. Under sixty seconds.
>
> I want to talk about the three gaps, because I could have hidden them.
>
> All three were the same role on the same client — and the engine reported exactly why: ten staff
> aren't certified for that brand, five are the wrong role. It names the constraint rather than
> showing a blank cell. A scheduler can act on that in seconds.
>
> The chart is the audit log from that run. What matters is the mix — five different actors: three
> workflows and two named humans. That single view is the audit requirement.

## Slide 10 — The demonstration

> Here's what I'll show you, in the order the work actually happens. Seven steps, all nine
> requirements, about six minutes.

`[SWITCH TO SCREEN RECORDING — Part Two]`

---

# PART TWO — THE DEMO  (~6 min)

## Step 1 — Availability in plain English  *(req 1)*

`[Open the availability form]`

> This is how availability comes in. A host fills this in however they like — no dropdowns, no
> grid, just plain English.

`[Type: "Mon-Wed evenings from 6pm, Thursday all day, not available Friday" — submit]`
`[Switch to Airtable → Availability]`

> And that becomes structured data. Monday, Tuesday, Wednesday, six until eleven. Thursday, all day.
>
> Notice what's *not* there. There's no Friday row. The model read "not available Friday" as an
> exclusion, not an availability window. That distinction matters — get it wrong and you book someone
> on the one day they ruled out.
>
> If the model can't parse a message confidently, the row is still written with the original text
> and flagged for review. A submission is never silently dropped.

`— CUT —`

## Step 2 — The weekly draft  *(reqs 2, 3, 4)*

`[n8n → Workflow A → Execute Workflow]`

> This is the core. In production it runs on a schedule; I'm triggering it now so you're not
> watching me wait.

`[Let it run. Open the Assignment Engine node output]`

> It pulled the sessions, the roster, everyone's availability, absences, and four weeks of history.
> Then for every slot it applied eight hard filters — role, certification, availability covering the
> full session, no absence, no clash including a thirty-minute buffer, weekly cap — and ranked
> whoever survived by fairness.
>
> Twenty-six slots, twenty-three filled, three gaps. Under a minute.

`[Show the gaps array with reasonBreakdown]`

> And there's the gap detail — not "unfilled", but *why*.

`[Airtable → Assignments, show the new Draft rows]`

> Everything lands as Draft. Nobody has been told anything yet.

`— CUT —`

## Step 3 — The human gate  *(req 5)*

`[Airtable → Scheduler Review view]`

> This is the part I'd want a sceptical scheduler to see. The engine proposes; it doesn't publish.
>
> I can change any row.

`[Change one assignment's Staff link]`

> And when I'm happy, I tick Approved.

`[Tick Approved on 2-3 rows]`

## Step 4 — Publishing and notifications  *(req 6)*

`[n8n → Workflow E → Execute Workflow]`

> Approval is what triggers publishing.

`[Switch to Telegram Desktop as messages arrive]`

> Each person gets their own message on their own channel — written by the model, so it reads like
> a person rather than a template.

`[Airtable → Assignments: show Status = Published, Notified ticked]`

> And the records update.

`— CUT —`

## Step 4b — An override after publishing  *(reqs 5, 9)*

`[Airtable → Assignments → pick a row now showing Status = Published]`

> One more on the override point, because this is the case that usually gets missed. The schedule
> is already out. People have been told. And now something changes.

`[Change that row's Staff link to a different person. Type a reason into Change Reason.]`

> I reassign it, and I record why.

`[n8n → Workflow E → Execute Workflow]`
`[Telegram Desktop — the change notification arrives]`

> The newly assigned person is told it's a change to a schedule they'd already received. And in a
> moment you will see my name against that edit in the audit log — not a workflow’s name, mine.
>
> If I'd skipped the reason field it would still be logged, marked as not provided, and the
> scheduler would get a nudge. The trail never has a hole in it just because someone was in a hurry.

`— CUT —`

## Step 5 — An absence  *(req 7)*

`[Telegram Desktop]`

> Now the hard case. A host can't make their shift.

`[Send: "Hi this is <name>. I can't make my shift on <date>, I'm sick"]`

> No form, no format. Just a message.

`[Wait for the reply]`

> The model read the name, the date, and the reason. The system found the affected shift, logged the
> absence, and then ran the *same* fairness engine to find a replacement — qualified for that client,
> genuinely free, no clash — and told them.
>
> That last part matters more than it sounds. Asking a group chat gives the shift to whoever replies
> fastest, and that's precisely the mechanism that overloads your most eager people. Routing
> replacements through fairness stops absences quietly undoing it.
>
> If nobody qualifies, it escalates to the scheduler with the near-misses — who's free but not
> certified, who's certified but already booked. A decision, not a dead end.

`— CUT —`

## Step 6 — Publishing the schedule  *(req 8)*

`[n8n → Workflow C execution → download the .ics]`

> The finished schedule comes out three ways. A live shared view, an HTML snapshot, and a calendar
> file.

`[Drag the .ics into a calendar app]`

> That imports straight into any calendar, with a reminder an hour before each session.

## Step 7 — The audit trail  *(req 9)*

`[Airtable → Audit Log]`

> And everything you've just watched is here.
>
> The draft run. The publishes. The change I made by hand — with my name on it, and the before and
> after values. The absence and its replacement.
>
> Look at the actor column: three workflows and two people. A spreadsheet's version history tells
> you a cell changed. This tells you who reassigned whom, when, and why — which is the only version
> anyone can act on.

`[SWITCH BACK TO SLIDES]`

---

# PART THREE — CLOSING  (~2 min)

## Slide 11 — Eleven defects found by running it

> One slide most people wouldn't include.
>
> Building this surfaced eleven defects, and every single one failed *silently* — the workflow
> reported success and did nothing. A query returning zero rows halted the entire chain with no
> error. The AI credential was misconfigured for days and everything quietly ran on fallback
> templates, so the system appeared to work perfectly.
>
> I'm showing you this because it's the difference between software that compiles and software that
> runs. None of these would have been found by designing on paper. All eleven are fixed and covered
> by forty-one automated tests.

## Slide 12 — Risks

> Every failure mode has a defined path. AI down: falls back to templates. Message misread: below
> seventy percent confidence it asks rather than guesses. No replacement available: escalates with
> near-misses.
>
> And one I'll flag before you find it — the Airtable free tier caps at a thousand records. At your
> volume that's about four months. It needs quarterly archiving or a paid plan.

## Slide 13 — Pilot versus production

> To be straight about what this is. It's a pilot-grade deployment — running on a laptop, free tiers
> throughout. But the logic is production-grade, and the same five workflow files run unchanged on a
> real server. Nothing needs rewriting to scale. It needs hosting and a paid data tier.

## Slide 14 — Close

> I'll finish on the line that matters most to whoever runs your scheduling today.
>
> **The engine proposes. The scheduler disposes. The system remembers which.**
>
> This isn't automation taking judgement away. It's automation doing the mechanical part — the
> matching, the conflict checking, the fairness maths — so the human spends their time on the calls
> that actually need a person.
>
> Two things I'd suggest next. First, tell me what your current setup actually does, so we can
> replace my assumed baseline with a real one. Second, a two-week pilot on a single client brand
> — enough to prove it against real sessions without risking the whole roster.
>
> Thanks for watching. Happy to go deeper on any of it.

---

## If something breaks mid-recording

| Problem | Do this |
|---|---|
| Telegram doesn't fire | The tunnel URL changes on every cloudflared restart. Stop, fix, re-record that segment only |
| Workflow A returns nothing | Re-seed, run E once, start that segment again |
| A node errors on camera | Cut it. Don't narrate over an error — it undercuts the "verified" claim |
| Running long | Cut slides 12 and 15. Never cut 3, 6, or 9 — caveat, AI reasoning, measured results |

## Two things to have ready for questions

**"Why not let the AI do the scheduling?"** — Slide 6. Exact, reproducible, instant, free,
defensible. The model is none of those. It's also a fairness question: an unexplainable assignment
is one you can't defend to the person who got fewer shifts.

**"Is the fairness correction too aggressive?"** — Yes, deliberately, and it self-balances over two
to three weeks. There's a gentler exponential-decay variant documented if you want the correction
spread out.
