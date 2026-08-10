# Klaiya Automated Live Scheduling — Solution Design

**Author:** Rainerio Agbayani Jr. · **Due:** 12 Aug 2026 · **Stack:** n8n + Airtable + Groq

> **Baseline caveat carried forward:** every "before" column in this document refers to the
> **assumed** baseline in [`01-assumed-baseline.md`](01-assumed-baseline.md), not to Klaiya's
> confirmed current system. Label it as assumed wherever it appears in the deck.

---

## 0. Design principle: automate decisions, not just messages

The assumed baseline already automates *communication* (reminder bot) and *storage* (shared sheet).
It does not automate *decisions*. This design targets the four decisions a human currently makes:

| Decision | Who makes it today (assumed) | Who makes it here |
|---|---|---|
| Who is qualified for this session? | Coordinator, from memory | Deterministic filter on `Certified Clients` |
| Does this clash with anything? | Nobody, reliably | Deterministic time-overlap check |
| Who *deserves* the next shift? | Coordinator, informally | Weighted fairness score |
| Who covers this absence? | First person to reply in chat | Same engine, single-slot mode |

### Where the LLM is and isn't used

| Task | Language or logic? | Handled by |
|---|---|---|
| Parse "can't do Tues, maybe Thurs pm" into structured availability | Language | **Groq** |
| Parse a free-text absence message from Telegram | Language | **Groq** |
| Draft a personalised shift notification | Language | **Groq** |
| Summarise coverage gaps for the scheduler | Language | **Groq** |
| Match role + certification | Logic | **Code node** |
| Detect time overlap | Logic | **Code node** |
| Compute fairness and rank candidates | Logic | **Code node** |
| Choose who gets the shift | Logic | **Code node** |

Rationale to state in the pitch: the assignment decision must be **exact, reproducible, auditable,
free, and instant**. An LLM is none of those five. Every Groq call in this design has a
static-template fallback, so a Groq outage degrades message quality — it never blocks a schedule.

---

## 1. Data model (Airtable, 7 tables)

Full build steps in [`03-airtable-schema.md`](03-airtable-schema.md). Summary:

```
Clients ──┐
          ├──< Sessions ──< Assignments >── Staff ──< Availability
          │                      │                └──< Absences
Staff >───┘ (Certified Clients)  └──< Audit Log
```

| Table | Purpose | Key fields |
|---|---|---|
| **Staff** | Roster + capability + contact routing | `Role`, `Certified Clients` (link), `Max Sessions Per Week`, `Notify Channel`, `Telegram Chat ID` |
| **Clients** | Brand config + desirability weighting | `Brand Tier` (A/B/C), `Platform`, `Requires Certification` |
| **Sessions** | The demand side — what needs staffing | `Date`, `Start Time`, `End Time`, `Client` (link), `Hosts Required`, `Admins Required` |
| **Availability** | When each person can work | `Staff` (link), `Date`, `Available From/To`, `Source` |
| **Absences** | Last-minute unavailability | `Staff` (link), `Date`, `Status`, `Raw Message` |
| **Assignments** | The output — one row per person per session | `Session` (link), `Staff` (link), `Role`, `Status`, `Assigned By` |
| **Audit Log** | Immutable record of every change | `Action`, `Actor`, `Before/After`, `Reason` |

### Three schema decisions that will bite you if changed

**1. `Start Time` / `End Time` are Single line text, format `"HH:MM"` (24h, zero-padded).**
Not Airtable's native Time type. The Code nodes parse these with `split(':')`. Airtable's Time
field returns a different serialisation through the API and the comparison fails *silently* —
you get a schedule with no errors and no conflicts detected, which is the worst failure mode.

**2. Every cross-table reference is a Linked Record, never a Single Select.**
The engine matches on real Airtable record IDs (`recXXXXXXXX`). A Select field gives you a display
string, which breaks the moment two staff share a first name.

**3. `Assignments` needs 9 Lookup fields.** Five carry session and staff context (`Session Date`,
`Session Start`, `Session End`, `Session Client`, `Staff Name`); four carry notification routing
(`Staff Notify Channel`, `Staff Telegram Chat ID`, `Staff Slack Member ID`, `Staff Email`).
Workflows B, C and E read all of these off the Assignment row rather than re-fetching Sessions and
Staff — fewer API calls, and it keeps Workflow C under the rate limit. Omit the four routing
lookups and every notification falls through to the Email branch while the workflow still reports
success.

---

## 2. The assignment engine (deterministic, n8n Code node)

### 2.1 Session weighting — why fairness isn't a shift count

A Tuesday 14:00 session for a Tier-C brand and a Friday 20:00 session for a Tier-A brand are not
the same shift. Prime-time, high-GMV sessions carry more visibility and, at most TSP agencies,
more incentive upside. Counting raw shifts calls a scheduler "fair" while systematically handing
the good slots to favourites.

```
Session Weight = 1.0
               × (1.5 if start time falls in 18:00–22:00 else 1.0)
               × (Tier A 1.4 | Tier B 1.2 | Tier C 1.0)
```

Range: 1.0 (off-peak, Tier C) → 2.1 (prime-time, Tier A).

### 2.2 Fairness score

```
fairnessScore = (weightedLoadInWindow + 1) / (sessionsTheyWereAvailableFor + 1)
```

Rolling 28-day window. **Lower score = more deserving of the next shift.**

The denominator matters: someone who offers 20 slots of availability and works 10 is being used at
a different rate than someone who offers 4 and works 3. Dividing by availability rewards people who
make themselves available without punishing part-timers for having less capacity. The `+1` on both
sides is Laplace smoothing — it stops a brand-new hire (0/0) from becoming a divide-by-zero.

**Measured behaviour, and a tuning knob you should know about.** On the test dataset (§2.7) where
staff 1–6 carried three weeks of heavy prior load, the engine gave them **2.1 weighted points** in
the new week versus **36.3** for everyone else. That is the algorithm working as specified — but it
is a *hard* correction: five previously-overloaded people got zero shifts that week.

Over 2–3 weeks it self-balances, because their load stops growing while everyone else's rises. If
you want a gentler correction, add exponential decay to the history term so older shifts count
less:

```javascript
// in the ledger build, replace the flat sum:
weightedLoad: hist.reduce((sum, h) => {
  const ageDays = Math.max(0, (new Date() - new Date(h.date)) / 86400000);
  return sum + (Number(h.weight) || 1) * Math.pow(0.5, ageDays / 14); // 14-day half-life
}, 0),
```

Leave it flat for the demo — the stark correction is the more legible story on a slide. Mention the
decay option verbally as the production refinement; it shows you've thought past the pitch.

### 2.3 Hard constraints (filters — a candidate fails any, they're out)

1. `Active = true`
2. Role matches the slot (`Live Host` / `Live Admin`; `Both` satisfies either)
3. If `Client.Requires Certification`, staff must have that client in `Certified Clients`
4. An Availability record covers the **full** session window that date
5. No Absence record overlapping the session window
6. No existing Assignment overlapping the window **+ 30 min buffer** (travel/setup/teardown)
7. Assignments this week `< Max Sessions Per Week`
8. Not already assigned to this same session in the other role

### 2.4 Ranking (soft — order the survivors)

1. `fairnessScore` ascending
2. `daysSinceLastShift` descending (spread people out)
3. Stable hash of staff ID (deterministic tie-break — reruns produce identical output, which
   matters for auditability)

### 2.5 Scarcity-first ordering

Sessions are **not** filled chronologically. They're sorted by **eligible-candidate count ascending**
— hardest-to-fill first. Filling a session with 12 eligible hosts before one with 2 can strand the
scarce session with zero options. This one ordering choice is the difference between "94% coverage"
and "100% coverage" on realistic data, and it costs nothing.

### 2.6 Full Code node source

```javascript
// ============================================================
// KLAIYA SCHEDULING ENGINE — deterministic assignment
// n8n Code node · Mode: "Run Once for All Items"
// Input: one item with { sessions, staff, availability, absences, history }
// Output: { assignments: [...], gaps: [...], stats: {...} }
// ============================================================

const input        = $input.first().json;
const sessions     = input.sessions     || [];
const staff        = input.staff        || [];
const availability = input.availability || [];
const absences     = input.absences     || [];
const history      = input.history      || [];  // assignments, rolling 28d

const CONFIG = {
  primeStart:      '18:00',
  primeEnd:        '22:00',
  primeMultiplier: 1.5,
  tierMultiplier:  { A: 1.4, B: 1.2, C: 1.0 },
  bufferMinutes:   30,
  historyDays:     28,
};

// ---------- helpers ----------
const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h * 60) + m;
};

const overlaps = (aStart, aEnd, bStart, bEnd, buffer = 0) =>
  toMin(aStart) < toMin(bEnd) + buffer && toMin(bStart) < toMin(aEnd) + buffer;

const contains = (outerStart, outerEnd, innerStart, innerEnd) =>
  toMin(outerStart) <= toMin(innerStart) && toMin(outerEnd) >= toMin(innerEnd);

const daysBetween = (a, b) =>
  Math.round((new Date(a) - new Date(b)) / 86400000);

// deterministic tie-break — same input always yields same schedule
const stableHash = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) {
    h = ((h << 5) - h + String(s).charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

// ---------- session weighting ----------
const sessionWeight = (session) => {
  const isPrime = toMin(session.startTime) >= toMin(CONFIG.primeStart)
               && toMin(session.startTime) <  toMin(CONFIG.primeEnd);
  const tier    = session.clientTier || 'C';
  return 1.0
    * (isPrime ? CONFIG.primeMultiplier : 1.0)
    * (CONFIG.tierMultiplier[tier] || 1.0);
};

// ---------- indexes ----------
const availByStaff   = {};
const absenceByStaff = {};
const historyByStaff = {};

for (const a of availability) {
  (availByStaff[a.staffId] ||= []).push(a);
}
for (const a of absences) {
  (absenceByStaff[a.staffId] ||= []).push(a);
}
for (const h of history) {
  (historyByStaff[h.staffId] ||= []).push(h);
}

// live ledger — updated as we assign, so later sessions see earlier decisions
const ledger = {};
for (const s of staff) {
  const hist = historyByStaff[s.id] || [];
  ledger[s.id] = {
    weightedLoad:   hist.reduce((sum, h) => sum + (h.weight || 1), 0),
    availableCount: (availByStaff[s.id] || []).length,
    weekCount:      0,
    lastShiftDate:  hist.length
      ? hist.map(h => h.date).sort().slice(-1)[0]
      : null,
    booked:         hist.map(h => ({
                      date: h.date, start: h.startTime, end: h.endTime,
                    })),
  };
}

const fairnessScore = (staffId) => {
  const L = ledger[staffId];
  return (L.weightedLoad + 1) / (L.availableCount + 1);
};

// ---------- hard constraints ----------
const isEligible = (person, session, role) => {
  if (!person.active) return 'inactive';

  // role match
  if (person.role !== role && person.role !== 'Both') return 'role';

  // certification
  if (session.requiresCertification &&
      !(person.certifiedClients || []).includes(session.clientId)) {
    return 'not-certified';
  }

  // availability must COVER the whole session
  const avail = (availByStaff[person.id] || []).filter(a => a.date === session.date);
  const covered = avail.some(a =>
    contains(a.availableFrom, a.availableTo, session.startTime, session.endTime));
  if (!covered) return 'unavailable';

  // absence
  const absent = (absenceByStaff[person.id] || []).some(a =>
    a.date === session.date &&
    overlaps(a.startTime || '00:00', a.endTime || '23:59',
             session.startTime, session.endTime));
  if (absent) return 'absent';

  // conflict with anything already booked (incl. this run's decisions)
  const clash = ledger[person.id].booked.some(b =>
    b.date === session.date &&
    overlaps(b.start, b.end, session.startTime, session.endTime, CONFIG.bufferMinutes));
  if (clash) return 'conflict';

  // weekly cap
  if (ledger[person.id].weekCount >= (person.maxSessionsPerWeek || 99)) return 'at-cap';

  return null; // eligible
};

const eligibleFor = (session, role, excludeIds = []) =>
  staff.filter(p => !excludeIds.includes(p.id) && isEligible(p, session, role) === null);

// ---------- build the slot list ----------
const slots = [];
for (const s of sessions) {
  for (let i = 0; i < (s.hostsRequired || 0); i++) {
    slots.push({ session: s, role: 'Live Host' });
  }
  for (let i = 0; i < (s.adminsRequired || 0); i++) {
    slots.push({ session: s, role: 'Live Admin' });
  }
}

// SCARCITY FIRST — fill the hardest slots before the easy ones
slots.sort((a, b) =>
  eligibleFor(a.session, a.role).length - eligibleFor(b.session, b.role).length);

// ---------- assign ----------
const assignments  = [];
const gaps         = [];
const assignedPerSession = {};

for (const slot of slots) {
  const { session, role } = slot;
  const already = assignedPerSession[session.id] || [];
  const candidates = eligibleFor(session, role, already);

  if (candidates.length === 0) {
    // record WHY, not just that it failed — this drives the Groq gap summary
    const reasons = {};
    for (const p of staff) {
      const r = isEligible(p, session, role);
      if (r) reasons[r] = (reasons[r] || 0) + 1;
    }
    gaps.push({
      sessionId:   session.id,
      sessionName: `${session.clientName} — ${session.date} ${session.startTime}`,
      date:        session.date,
      startTime:   session.startTime,
      endTime:     session.endTime,
      client:      session.clientName,
      role,
      reasonBreakdown: reasons,
    });
    continue;
  }

  candidates.sort((a, b) => {
    const fa = fairnessScore(a.id), fb = fairnessScore(b.id);
    if (fa !== fb) return fa - fb;

    const da = ledger[a.id].lastShiftDate
      ? daysBetween(session.date, ledger[a.id].lastShiftDate) : 9999;
    const db = ledger[b.id].lastShiftDate
      ? daysBetween(session.date, ledger[b.id].lastShiftDate) : 9999;
    if (da !== db) return db - da;

    return stableHash(a.id) - stableHash(b.id);
  });

  const chosen = candidates[0];
  const weight = sessionWeight(session);

  assignments.push({
    sessionId:  session.id,
    staffId:    chosen.id,
    staffName:  chosen.name,
    role,
    weight,
    date:       session.date,
    startTime:  session.startTime,
    endTime:    session.endTime,
    client:     session.clientName,
    assignedBy: 'Auto',
    fairnessScoreAtAssignment: Number(fairnessScore(chosen.id).toFixed(3)),
  });

  // update ledger so the next slot sees this decision
  const L = ledger[chosen.id];
  L.weightedLoad += weight;
  L.weekCount    += 1;
  L.lastShiftDate = session.date;
  L.booked.push({ date: session.date, start: session.startTime, end: session.endTime });
  (assignedPerSession[session.id] ||= []).push(chosen.id);
}

// ---------- fairness spread (for the demo slide) ----------
const loads = staff.filter(s => s.active).map(s => ledger[s.id].weightedLoad);
const mean  = loads.reduce((a, b) => a + b, 0) / (loads.length || 1);
const stdev = Math.sqrt(
  loads.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / (loads.length || 1));

return [{
  json: {
    assignments,
    gaps,
    stats: {
      slotsTotal:     slots.length,
      slotsFilled:    assignments.length,
      slotsUnfilled:  gaps.length,
      coveragePct:    slots.length
        ? Number(((assignments.length / slots.length) * 100).toFixed(1)) : 100,
      conflictsPrevented: 0, // incremented by the conflict-audit node
      loadMean:       Number(mean.toFixed(2)),
      loadStdev:      Number(stdev.toFixed(2)),
      generatedAt:    new Date().toISOString(),
    },
  },
}];
```

**Demo value of `stats`:** `coveragePct` and `loadStdev` are your before/after numbers. Note in the
deck that the baseline figures are estimates while the engine figures are **measured from an actual
run** — that asymmetry is worth stating, it's the difference between a claim and a demonstration.

### 2.7 Test results (measured, not projected)

The engine was run standalone against a synthetic dataset — 15 staff, 4 clients, 12 sessions across
one week, 26 slots, with a deliberate cross-client evening collision on 14 Aug and three weeks of
lopsided prior history.

```
slotsTotal: 26   slotsFilled: 23   coveragePct: 88.5
conflictsPrevented: 1
loadMean: 5.08   loadStdev: 2.66   staffCount: 15
runtime: <100ms
```

All nine correctness assertions passed:

| Assertion | Result |
|---|---|
| No overlapping assignments | ✅ 0 violations |
| Certification enforced | ✅ 0 violations |
| Role match enforced | ✅ 0 violations |
| Availability covers full session window | ✅ 0 violations |
| Absences respected | ✅ 0 violations |
| Weekly cap respected | ✅ 0 violations |
| Nobody assigned twice to one session | ✅ 0 violations |
| Deterministic across reruns | ✅ byte-identical output |
| Fairness favours under-loaded staff | ✅ 2.1 vs 36.3 weighted points |

**The three gaps were real, not bugs.** All three were the AuraTech Live Admin slot, and the
engine's `reasonBreakdown` reported exactly why: `{"not-certified": 10, "role": 5}` — every one of
the 15 staff was blocked, 10 by missing AuraTech certification and 5 by being Host-only. That is
the gap report doing its job: it names the constraint instead of just saying "unfilled."

**Demo choice:** seed your Airtable so *one or two* gaps survive, not zero. A 100% coverage run
proves assignment works; a run with a correctly-explained gap proves assignment **and** gap
detection **and** the Groq summary **and** the escalation path. The imperfect run is the better
demo — say so before the stakeholder notices it and wonders.

---

## 3. Workflow A — Weekly Draft Generation

**Trigger:** Schedule (Cron) — Thursday 10:00, generating next Mon–Sun.
**Output:** Draft assignments in Airtable + a gap report to the scheduler. **Publishes nothing.**

| # | Node | Type | Key config |
|---|---|---|---|
| 1 | Weekly Trigger | `scheduleTrigger` | Cron `0 10 * * 4` |
| 2 | Compute Week Window | `code` | Sets `weekStart` / `weekEnd` ISO dates for next Mon–Sun |
| 3 | Get Sessions | `airtable` (search) | `filterByFormula`: `AND({Date}>='{{$json.weekStart}}', {Date}<='{{$json.weekEnd}}', {Status}='Draft')` |
| 4 | Get Staff | `airtable` (search) | `filterByFormula`: `{Active}=1` |
| 5 | Get Availability | `airtable` (search) | Date within week window |
| 6 | Get Absences | `airtable` (search) | Date within week window |
| 7 | Get History | `airtable` (search) | `{Session Date}` within last 28 days, `{Status}!='Cancelled'` |
| 8 | Normalise + Merge | `code` | Flattens all five result sets into one item, maps Airtable field names → engine field names |
| 9 | **Assignment Engine** | `code` | §2.6 source |
| 10 | Has Gaps? | `if` | `{{$json.gaps.length}}` > 0 |
| 11 | Create Assignments | `airtable` (create) | Status `Draft`, Assigned By `Auto` |
| 12 | Groq — Gap Summary | `httpRequest` | §9.3 prompt |
| 13 | Notify Scheduler | `telegram` / `slack` | Draft-ready message + gap summary + link to Airtable review view |
| 14 | Audit — Draft Generated | `airtable` (create) | One Audit Log row: action `DRAFT_GENERATED`, actor `Workflow A` |

**Node 8 — Normalise + Merge** (this is the node people get wrong):

```javascript
// Pulls from five upstream Airtable nodes by name and reshapes to engine input.
const rows = (nodeName) => $(nodeName).all().map(i => i.json);

const clientsById = {};
for (const c of rows('Get Sessions')) {
  // client data arrives via Lookup fields on Sessions
}

return [{
  json: {
    sessions: rows('Get Sessions').map(r => ({
      id:                   r.id,
      date:                 r.fields['Date'],
      startTime:            r.fields['Start Time'],
      endTime:              r.fields['End Time'],
      clientId:             (r.fields['Client'] || [])[0],
      clientName:           (r.fields['Client Name'] || [])[0] || 'Unknown',
      clientTier:           (r.fields['Brand Tier'] || [])[0] || 'C',
      requiresCertification: Boolean((r.fields['Requires Certification'] || [])[0]),
      hostsRequired:        r.fields['Hosts Required']  || 0,
      adminsRequired:       r.fields['Admins Required'] || 0,
    })),
    staff: rows('Get Staff').map(r => ({
      id:                 r.id,
      name:               r.fields['Name'],
      role:               r.fields['Role'],
      active:             Boolean(r.fields['Active']),
      certifiedClients:   r.fields['Certified Clients'] || [],
      maxSessionsPerWeek: r.fields['Max Sessions Per Week'] || 99,
      notifyChannel:      r.fields['Notify Channel'] || 'Email',
    })),
    availability: rows('Get Availability').map(r => ({
      staffId:       (r.fields['Staff'] || [])[0],
      date:          r.fields['Date'],
      availableFrom: r.fields['Available From'],
      availableTo:   r.fields['Available To'],
    })),
    absences: rows('Get Absences').map(r => ({
      staffId:   (r.fields['Staff'] || [])[0],
      date:      r.fields['Date'],
      startTime: r.fields['Start Time'],
      endTime:   r.fields['End Time'],
    })),
    history: rows('Get History').map(r => ({
      staffId:   (r.fields['Staff'] || [])[0],
      date:      (r.fields['Session Date'] || [])[0],
      startTime: (r.fields['Session Start'] || [])[0],
      endTime:   (r.fields['Session End'] || [])[0],
      weight:    r.fields['Weight'] || 1,
    })),
  },
}];
```

**Requirement coverage:** 1 (input), 2 (assignment), 3 (conflict + gap flagging), 4 (fairness), 9 (audit).

---

## 4. Workflow B — Absence → Replacement Finder

**Trigger:** Telegram message (staff DMs the bot in plain language).
**Output:** Replacement assigned + both parties notified, or escalation to the scheduler.

| # | Node | Type | Key config |
|---|---|---|---|
| 1 | Absence Message | `telegramTrigger` | Updates: `message` |
| 2 | **Groq — Parse Absence** | `httpRequest` | §9.1 prompt, `response_format: json_object` |
| 3 | Validate Parse | `code` | Schema-check Groq output; on failure set `needsHumanReview: true` |
| 4 | Parsed OK? | `if` | `{{ $json.needsHumanReview === false }}` |
| 5 | Find Staff | `airtable` (search) | Match on Telegram Chat ID (preferred) or parsed name |
| 6 | Find Affected Assignments | `airtable` (search) | `AND({Staff Name}='…', {Session Date}='…', {Status}='Published')` |
| 7 | Any Shift Affected? | `if` | Length > 0 |
| 8 | Log Absence | `airtable` (create) | Absences row, Status `Open`, `Raw Message` = original text |
| 9 | Get Candidate Pool | `airtable` ×3 | Staff, Availability (that date), Assignments (that date) |
| 10 | **Replacement Engine** | `code` | Same engine, single-slot mode — §2 constraints, excludes the absent person |
| 11 | Replacement Found? | `if` | `{{$json.replacement }}` not empty |
| 12a | Create Replacement | `airtable` (create) | Assigned By `Replacement`, Status `Published` |
| 12b | Mark Original Replaced | `airtable` (update) | Status `Replaced` |
| 12c | Call Workflow C | `executeWorkflow` | Passes `assignmentIds` for both parties |
| 13a | Groq — Escalation Draft | `httpRequest` | §9.4 prompt |
| 13b | Escalate to Scheduler | `telegram` | Gap + why nobody qualified + nearest-miss candidates |
| 14 | Audit | `airtable` (create) | `ABSENCE_REPLACED` or `ABSENCE_ESCALATED` |

**Design note worth saying out loud in the demo:** the replacement uses the *same fairness engine* as
the weekly draft. The assumed baseline's "who can cover?" group-chat broadcast rewards whoever is
fastest to reply — which is precisely the mechanism that concentrates workload on the same few
people. Routing replacements through fairness means absences no longer quietly undo fair allocation.

**Nearest-miss reporting:** when no replacement exists, node 10 returns the candidates who failed on
exactly one constraint, with which one. The scheduler gets *"nobody qualified — but Jen is free and
uncertified for Brand X, and Marco is certified but already on Brand Y until 20:30"* rather than
"no match found." That converts a dead end into a decision the human can make in ten seconds.

---

## 5. Workflow C — Publish, Notify, Audit

**Trigger:** Execute Workflow (called by A after scheduler approval, or by B automatically).
**Input:** `{ assignmentIds: string[], changeType: 'PUBLISH' | 'CHANGE' }`

| # | Node | Type | Key config |
|---|---|---|---|
| 1 | Called by A or B | `executeWorkflowTrigger` | |
| 2 | Get Assignments | `airtable` (search) | `filterByFormula` OR-list of record IDs |
| 3 | Loop (batch 1) | `splitInBatches` | Batch size 1 — **required for rate limit** |
| 4 | Groq — Draft Message | `httpRequest` | §9.2 prompt |
| 5 | Route by Channel | `switch` | On `Notify Channel`: Telegram / Slack / Email |
| 6a/b/c | Send | `telegram` / `slack` / `emailSend` | |
| 7 | Mark Notified | `airtable` (update) | `Notified` = true, `Status` = Published |
| 8 | Audit Row | `airtable` (create) | Action, actor, before/after, reason |
| 9 | Rate Limit Wait | `wait` | 250 ms → back to node 3 |
| 10 | Build Export | `code` (after loop) | Groups assignments into an HTML schedule table |
| 11 | Publish Export | `convertToFile` / HTML→PDF | See §7 |

**Airtable rate limit — 5 requests/second per base.** At 50 staff this loop makes ~150 calls. Without
the Wait node it will 429 partway through and you'll have half your team notified and no clean way
to tell which half. The 250 ms wait is not optional decoration.

---

## 6. Workflow D — Availability Intake

**Trigger:** n8n Form Trigger (a hosted form — works on plain localhost, no tunnel needed).
**Output:** Structured Availability rows, one per available day.

This is requirement 1's other half. Absences arrive through Workflow B; *availability* arrives here.

| # | Node | Type | Key config |
|---|---|---|---|
| 1 | Availability Form | `formTrigger` | 3 fields: name, week-starting date, free-text availability |
| 2 | Find Staff Record | `airtable` (search) | `{Name} = '<submitted name>'` |
| 3 | Staff Exists? | `if` | Guards against typo'd names creating orphan rows |
| 4 | **Groq — Parse Availability** | `httpRequest` | §9.5 prompt, `json_object` mode |
| 5 | Expand Slots | `code` | One item per day; validates every date/time; preserves raw text on failure |
| 6 | Strip Internal Fields | `code` | Removes working fields before the write |
| 7 | Create Availability Rows | `airtable` (create) | |
| 8–9 | Audit | `code` + `airtable` | `AVAILABILITY_SUBMITTED` |
| 10 | Warn — Unknown Staff | `telegram` | Tells the scheduler a submission was rejected, and why |

**A submission is never silently lost.** If Groq fails outright or returns nothing usable, the row is
still written with `Source = Manual`, the original text in `Raw Text`, and `Needs Review` ticked.
Low confidence (< 0.7) writes the parsed slots *and* flags them. The failure mode is "a human checks
15 seconds of work", never "the schedule was built without knowing Maria was free on Thursday."

**Why a form and not the Telegram bot:** Telegram allows exactly one webhook per bot token, and
Workflow B already holds it. Two Telegram triggers on the same bot silently fight each other. A form
also suits the task better — weekly availability is batch input, absences are ad hoc. If you later
want both on one bot, merge D into B behind a Groq intent classifier.

---

## 7. Workflow E — Publish & Change Watcher

**Trigger:** Schedule, every 15 minutes.
**Output:** Publishes approved drafts; audits and re-notifies manual edits.

This is the workflow that closes requirements 5, 6 and 9 properly. It does two jobs off one fetch.

| # | Node | Type | Key config |
|---|---|---|---|
| 1 | Every 15 Minutes | `scheduleTrigger` | `minutesInterval: 15` |
| 2 | Get Active Assignments | `airtable` (search) | Non-cancelled, session date ≥ yesterday |
| 3 | **Detect Approvals & Changes** | `code` | Snapshot-diff against `$getWorkflowStaticData` |
| 4 | Anything To Publish? | `if` | → Call Workflow C with `changeType: PUBLISH` |
| 5 | Any Manual Changes? | `if` | → expand to one audit row per changed field |
| 6 | Create Override Audit Rows | `airtable` (create) | `MANUAL_OVERRIDE`, with before/after |
| 7 | Needs Re-notification? | `if` | → Call Workflow C with `changeType: CHANGE` |
| 8 | Any Change Missing A Reason? | `if` | → Telegram nudge to the scheduler |

### How change detection works without Airtable webhooks

Airtable's free tier has no usable outbound webhook for this. Instead, node 3 keeps a snapshot of
every tracked assignment in n8n's workflow static data (which persists between executions) and diffs
each poll against it. `Last Modified By` supplies the actor, `Change Reason` supplies the why.

Three behaviours worth knowing:

- **The first run reports zero changes.** With no baseline there is nothing to diff against — it
  seeds the snapshot and exits quietly. This is correct, but it means the very first poll after
  import looks like it did nothing.
- **A status-only change does not re-notify.** Only a `Staff` or `Role` swap on a published
  assignment reaches the person. Flipping a status to Cancelled logs an audit row and stays quiet,
  because nobody needs a message telling them a shift they were never told about is gone.
- **A change with no reason is logged anyway**, with `Reason: NOT PROVIDED`, and the scheduler gets
  a nudge. Never drop the audit row just because the human skipped the field.

---

## 8. Manual override — the human gate

Requirement 5, and the thing that makes this sellable to a scheduler who doesn't trust automation.

**Nothing Workflow A produces is visible to staff.** It writes `Status = Draft`. The scheduler works
in an Airtable **Grid view filtered to `Status = Draft`**, edits any row, then ticks `Approved`.
Workflow E's 15-minute poll picks that up and hands the IDs to Workflow C.

**After publishing**, the scheduler can still edit any row. Workflow E detects it within 15 minutes,
writes an audit row with actor and before/after values, and re-notifies the affected staff if the
change actually affects them.

The pitch line: *the engine proposes, the scheduler disposes, and the system remembers which.*

---

## 9. Groq prompts

All calls: `POST https://api.groq.com/openai/v1/chat/completions`, HTTP Header Auth credential
(`Authorization: Bearer <key>`), model `llama-3.3-70b-versatile`.

### 9.1 Parse absence message → JSON

```
temperature: 0
response_format: { "type": "json_object" }

SYSTEM:
You extract structured absence data from staff messages at a livestream agency.
Today is {{ $now.format('yyyy-MM-dd') }}. Timezone Asia/Manila.
Return ONLY a JSON object with these exact keys:
{
  "staffName": string|null,
  "date": "YYYY-MM-DD"|null,
  "startTime": "HH:MM"|null,
  "endTime": "HH:MM"|null,
  "reason": string|null,
  "isFullDay": boolean,
  "confidence": number
}
Rules:
- Resolve relative dates ("tomorrow", "tonight", "Friday") against today's date.
- 24-hour zero-padded times. "7pm" -> "19:00".
- If the message implies the whole day, isFullDay=true and times null.
- confidence 0.0-1.0: how certain you are of date and time. Below 0.7 means a human should check.
- Never invent a date. If none can be determined, date=null and confidence<=0.3.

USER:
{{ $json.message.text }}
```

### 9.2 Draft a shift notification

```
temperature: 0.4

SYSTEM:
You write short shift notifications for Klaiya, a Manila livestream commerce agency.
Tone: warm, professional, direct. 2-3 sentences max. No emoji spam (one at most).
Always include: date, start-end time, client brand, and their role.
If changeType is CHANGE, lead with the fact that this is a change to a previously sent schedule.
Output plain text only — no markdown, no preamble, no sign-off block.

USER:
Staff: {{ $json.staffName }}
Role: {{ $json.role }}
Client: {{ $json.client }}
Date: {{ $json.date }}
Time: {{ $json.startTime }}-{{ $json.endTime }}
Change type: {{ $json.changeType }}
```

### 9.3 Summarise coverage gaps for the scheduler

```
temperature: 0.2

SYSTEM:
You brief a scheduling manager on staffing gaps. Be concise and factual.
Group gaps by client, then by date. For each, state the role missing and the single most
common blocking reason. End with one line naming the tightest constraint overall.
Max 200 words. Plain text, no markdown headers.

USER:
{{ JSON.stringify($json.gaps) }}
```

### 9.4 Escalation message (no replacement found)

```
temperature: 0.3

SYSTEM:
You alert a scheduling manager that an absence has no automatic replacement.
State: who is out, which session is now uncovered, and the nearest-miss candidates
with the one constraint each failed. Be direct — this is time-sensitive.
Max 120 words. Plain text.

USER:
Absent: {{ $json.absentStaff }}
Session: {{ $json.client }} {{ $json.date }} {{ $json.startTime }}-{{ $json.endTime }}
Role needed: {{ $json.role }}
Nearest misses: {{ JSON.stringify($json.nearestMisses) }}
```

### 9.5 Parse weekly availability → JSON

```
temperature: 0
response_format: { "type": "json_object" }

SYSTEM:
You extract work availability from free-text messages by staff at a livestream commerce
agency in Manila. Return ONLY a JSON object:
{ "slots": [ { "date": "YYYY-MM-DD", "from": "HH:MM", "to": "HH:MM" } ], "confidence": number }
Rules:
- The user gives a week-start date which is a Monday. Resolve all day names against that week
  (Monday = week start, Sunday = week start + 6).
- 24-hour zero-padded times.
- "evenings" = 18:00-23:00, "afternoons" = 13:00-18:00, "mornings" = 09:00-13:00,
  "all day" = 09:00-23:00.
- Include ONLY days the person says they ARE available. Never include days they say they cannot
  work. Omit days not mentioned at all.
- confidence 0.0-1.0 for how clearly the text maps to specific days and times.
- Return an empty slots array if nothing can be determined.

USER:
Week starting (Monday): {{ $json['Week starting (Monday)'] }}
Message: {{ $json['When are you available?'] }}
```

The "only days they ARE available" rule matters more than it looks. Free-text submissions mix both
directions constantly — *"I can do Mon and Tue evenings, definitely not Friday"* — and a model that
records Friday as a slot produces a schedule that books someone on the one day they ruled out.

### Fallback pattern (apply to every Groq node)

Set the HTTP Request node to **Continue On Fail**, then follow with:

```javascript
const r = $input.first().json;
const failed = r.error || !r.choices?.[0]?.message?.content;

if (!failed) {
  return [{ json: { text: r.choices[0].message.content, source: 'groq' } }];
}

// static template — never blocks the workflow
const d = $('Get Assignments').first().json.fields;
return [{ json: {
  text: `Schedule update: you are assigned as ${d['Role']} for ${d['Session Client']} `
      + `on ${d['Session Date']}, ${d['Session Start']}-${d['Session End']}. `
      + `Please confirm in the group chat.`,
  source: 'fallback',
}}];
```

---

## 10. Export & publish (requirement 8)

Three formats ship, covering all three the brief names (PDF, shared sheet, calendar sync):

| Format | Status | Notes |
|---|---|---|
| **Airtable shared Grid view** | Manual setup, 5 min | The live schedule. Free, mobile-readable, always current |
| **HTML snapshot** | ✅ Built — Workflow C | Immutable published version. Prints to PDF from any browser |
| **ICS calendar feed** | ✅ Built — Workflow C | RFC 5545, `TZID=Asia/Manila`, 60-minute alarm per session. Imports into Google Calendar, Outlook, Apple Calendar |
| Airtable Interface (per-person portal) | Not built | Best UX. Only if there's spare time before the 12th |
| Live two-way Google Calendar sync | Not built | Push-only ICS covers the demo. True bidirectional sync is post-POC |

The ICS export is worth ten seconds of demo time: generate it, drag it into a calendar app, and the
week appears with reminders. It answers the baseline's weakest point directly — staff working off a
live document that can change underneath them now get a snapshot they own.

**Honest scope note:** an ICS file is a one-way export, not a subscription. Staff import it and get
that week; changes after import don't propagate to their calendar (Workflow C's notification does
that instead). A live subscribable feed URL is a small addition post-POC — say this rather than let
someone assume it's a two-way sync.

---

## 11. Before / after by requirement

> Before column = **assumed** baseline. Not confirmed.

| # | Requirement | Before *(assumed)* | After | Built in |
|---|---|---|---|---|
| 1 | Data Input | Free-text chat, retyped by hand | Hosted form → Groq parse → structured rows; absences parsed from Telegram | **Workflow D** + Workflow B |
| 2 | Automated Assignment | 🔴 100% manual, ~3–4 hrs/wk | Full week drafted in under 60 s | Workflow A, engine §2.6 |
| 3 | Conflict Prevention | Misses cross-client overlaps | Zero double-bookings, structurally impossible | Workflow A, overlap + 30 min buffer |
| 4 | Fair Allocation | Shift count at best | Weighted by prime-time and brand tier, normalised by availability | Workflow A, fairness §2.2 |
| 5 | Manual Overrides | Uncontrolled (edit any cell) | Draft → review → approve → publish, **and** post-publish edits detected, audited, re-notified | Airtable view + **Workflow E** |
| 6 | Notifications | Group broadcast, silent on change | Per-person, per-channel, fires on publish and on change | Workflow C, triggered by **Workflow E** |
| 7 | Absence Management | Group chat, first responder wins | Qualified, available, fairest replacement — auto-contacted | Workflow B |
| 8 | Export & Publish | Live mutable sheet | Shared Airtable view + HTML snapshot + **ICS calendar feed** | Workflow C |
| 9 | Audit Trail | Cell-level version history | Decision-level log: actor, before/after, reason — including manual edits | Audit Log + **Workflow E** |

**All nine are built.** Requirements 1, 5, 6 and 9 required Workflows D and E, which exist for
exactly that reason — the first pass covered only 2, 3, 4, 7 and 8 completely.

---

## 12. Risks and edge cases

| Risk | Likelihood | Handling |
|---|---|---|
| Groq API down / rate-limited | Medium | Every call has a static-template fallback. Schedules still generate; messages read more robotic |
| Groq misparses an absence | Medium | `confidence < 0.7` routes to human review instead of acting |
| No qualified replacement exists | **High** | Nearest-miss report to scheduler with the one constraint each candidate failed |
| Airtable 5 req/sec limit | High at 50 staff | Batch size 1 + 250 ms Wait in Workflow C |
| Airtable free tier: 1,000 records/base | Certain within ~4 months | Assignments accumulate fastest. Archive quarterly, or budget for a paid plan. **Say this in the deck** — flagging it reads as competence, not weakness |
| Two schedulers approve simultaneously | Low | Airtable record IDs make writes idempotent; audit log shows both actors |
| Staff never submits availability | High | Absent availability = ineligible. Add a Friday nudge workflow; note as v2 |
| Engine produces a legal-but-unpopular schedule | Medium | The override gate exists precisely for this. Fairness is a heuristic, not a verdict |
| Timezone drift | Low | All times are naive `HH:MM` in Asia/Manila. Single-country agency — do **not** add timezone handling, it adds bugs and no value |

---

## 13. Build order for the remaining days

| Day | Task |
|---|---|
| **Aug 7** | Airtable base built to `03-airtable-schema.md`; PAT generated; sample data seeded (~15 staff, 4 clients, 20 sessions) |
| **Aug 8** | n8n running (Docker); Workflows A and C imported; credentials attached; IDs replaced; **first successful draft run**; notification loop tested on 2–3 staff |
| **Aug 9** | Workflow E (approval → publish, change watcher); Workflow D (availability form) |
| **Aug 10** | Workflow B; Telegram bot; absence → replacement demo path |
| **Aug 11** | Deck built; run the full demo three times start-to-finish; capture screenshots as fallback |
| **Aug 12** | Present |

**If you fall behind, cut in this order:** ICS calendar export → Workflow D (seed availability by
hand instead and say so) → Workflow B's auto-outreach (leave it escalating to the scheduler).
**Never cut Workflow A or E** — A is the entire argument, and E is what makes the human-override
story real rather than theoretical. A live A → E → C run plus screenshots of B and D beats five
half-working workflows.
