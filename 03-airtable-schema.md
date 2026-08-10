# Airtable Base Build Guide

Build the tables **in this order** — later tables reference earlier ones, and Airtable won't let you
create a Linked Record field pointing at a table that doesn't exist yet.

Base name: **Klaiya Live Scheduling**

> **Three rules that will silently break the engine if ignored:**
> 1. `Start Time` / `End Time` / `Available From` / `Available To` are **Single line text**, format
>    `"HH:MM"` (24-hour, zero-padded — `09:00`, not `9:00`). **Not** Airtable's Time field type.
> 2. Every cross-table reference is a **Linked Record**, never a Single Select.
> 3. Field names must match **exactly**, including capitalisation and spaces. The Code nodes read
>    `r.fields['Start Time']` — `Start time` returns `undefined` and the check fails silently.

---

## 1. Clients

Create this first — Sessions and Staff both link to it.

| Field | Type | Config |
|---|---|---|
| `Client Name` | Single line text | *primary field* |
| `Brand Tier` | Single select | `A`, `B`, `C` |
| `Platform` | Single select | `TikTok Shop`, `Shopee`, `Lazada`, `Multi` |
| `Requires Certification` | Checkbox | |
| `Active` | Checkbox | default checked |

**Brand Tier drives the fairness weighting** (A ×1.4, B ×1.2, C ×1.0). Tier A = your highest-GMV or
most visible brands — the sessions people actually want.

**Sample rows:**

| Client Name | Brand Tier | Platform | Requires Certification | Active |
|---|---|---|---|---|
| Glow Cosmetics PH | A | TikTok Shop | ✅ | ✅ |
| HomeEssentials | B | Shopee | ☐ | ✅ |
| SnackHub | C | TikTok Shop | ☐ | ✅ |
| AuraTech | A | Lazada | ✅ | ✅ |

---

## 2. Staff

| Field | Type | Config |
|---|---|---|
| `Name` | Single line text | *primary field* |
| `Role` | Single select | `Live Host`, `Live Admin`, `Both` |
| `Active` | Checkbox | default checked |
| `Certified Clients` | **Link to Clients** | allow multiple ✅ |
| `Max Sessions Per Week` | Number (integer) | default `6` |
| `Notify Channel` | Single select | `Telegram`, `Slack`, `Email` |
| `Telegram Chat ID` | Single line text | numeric ID, not @username |
| `Slack Member ID` | Single line text | |
| `Email` | Email | |
| `Skill Tier` | Single select | `Senior`, `Mid`, `Junior` — reserved for v2, not read by the engine |
| `Date Joined` | Date | ISO format |

`Role = Both` satisfies either a Host or an Admin slot — useful for the flexible staff most agencies
have, and it materially improves coverage.

**Seed ~15 staff for a convincing demo.** A 5-person roster makes fairness look trivial; 15 makes
the load-distribution chart tell a story.

---

## 3. Sessions

The demand side — what needs staffing.

| Field | Type | Config |
|---|---|---|
| `Session Name` | Formula | *primary field* — see below |
| `Date` | Date | ISO format `YYYY-MM-DD` |
| `Start Time` | **Single line text** | `"19:00"` |
| `End Time` | **Single line text** | `"21:00"` |
| `Client` | **Link to Clients** | single |
| `Hosts Required` | Number (integer) | default `1` |
| `Admins Required` | Number (integer) | default `1` |
| `Status` | Single select | `Draft`, `Published`, `Cancelled` |
| `Client Name` | **Lookup** | via `Client` → `Client Name` |
| `Brand Tier` | **Lookup** | via `Client` → `Brand Tier` |
| `Requires Certification` | **Lookup** | via `Client` → `Requires Certification` |
| `Notes` | Long text | |

`Session Name` formula:

```
{Client Name} & " · " & DATETIME_FORMAT({Date}, "MMM D") & " " & {Start Time}
```

The three Lookups let the engine read client tier and certification requirements straight off the
Session row — no second fetch, fewer API calls.

**Sample rows** (a realistic week — note the deliberate 20:00 overlap on Aug 14, which is exactly
the cross-client double-booking the assumed baseline misses):

| Date | Start | End | Client | Hosts | Admins |
|---|---|---|---|---|---|
| 2026-08-10 | 14:00 | 16:00 | SnackHub | 1 | 1 |
| 2026-08-10 | 19:00 | 21:00 | Glow Cosmetics PH | 2 | 1 |
| 2026-08-11 | 20:00 | 22:00 | AuraTech | 1 | 1 |
| 2026-08-14 | 19:00 | 21:00 | Glow Cosmetics PH | 1 | 1 |
| 2026-08-14 | 20:00 | 22:00 | AuraTech | 1 | 1 |

---

## 4. Availability

| Field | Type | Config |
|---|---|---|
| `Availability ID` | Autonumber | *primary field* |
| `Staff` | **Link to Staff** | single |
| `Date` | Date | |
| `Available From` | **Single line text** | `"18:00"` |
| `Available To` | **Single line text** | `"23:00"` |
| `Source` | Single select | `Form`, `Parsed`, `Manual` |
| `Raw Text` | Long text | original message, if parsed by Groq |
| `Needs Review` | Checkbox | set by Workflow D when Groq's confidence < 0.7, or when parsing failed entirely |
| `Staff Name` | **Lookup** | via `Staff` → `Name` |

`Needs Review` is how requirement 1 stays honest. When Groq can't confidently parse a submission,
the row is still written — with the raw text preserved — and flagged rather than silently dropped.
Build a view filtered to `Needs Review = 1` so the scheduler can fix the handful that need it.

**Availability must *cover* the session window, not merely overlap it.** Someone free 18:00–20:00
is not eligible for a 19:00–21:00 session. The engine uses `contains()`, not `overlaps()`, and that
is deliberate — partial availability is how understaffed sessions happen.

---

## 5. Absences

| Field | Type | Config |
|---|---|---|
| `Absence ID` | Autonumber | *primary field* |
| `Staff` | **Link to Staff** | single |
| `Date` | Date | |
| `Start Time` | **Single line text** | blank = full day |
| `End Time` | **Single line text** | blank = full day |
| `Reason` | Single line text | |
| `Status` | Single select | `Open`, `Replacement Found`, `Escalated`, `Resolved Manually` |
| `Reported At` | Created time | |
| `Raw Message` | Long text | original Telegram text — **keep this**, it's your audit defence if Groq misparses |
| `Parse Confidence` | Number (decimal, 2dp) | Groq's self-reported confidence |
| `Affected Assignment` | **Link to Assignments** | create after table 6 exists |

---

## 6. Assignments

The output table — one row per person per session.

| Field | Type | Config |
|---|---|---|
| `Assignment ID` | Autonumber | *primary field* |
| `Session` | **Link to Sessions** | single |
| `Staff` | **Link to Staff** | single |
| `Role` | Single select | `Live Host`, `Live Admin` |
| `Status` | Single select | `Draft`, `Published`, `Cancelled`, `Replaced` |
| `Assigned By` | Single select | `Auto`, `Manual`, `Replacement` |
| `Approved` | Checkbox | **the human gate — nothing publishes without this** |
| `Notified` | Checkbox | |
| `Weight` | Number (decimal, 2dp) | written by the engine |
| `Fairness Score At Assignment` | Number (decimal, 3dp) | written by the engine — makes fairness *inspectable*, which is a good demo moment |
| `Session Date` | **Lookup** | via `Session` → `Date` |
| `Session Start` | **Lookup** | via `Session` → `Start Time` |
| `Session End` | **Lookup** | via `Session` → `End Time` |
| `Session Client` | **Lookup** | via `Session` → `Client Name` |
| `Staff Name` | **Lookup** | via `Staff` → `Name` |
| `Staff Notify Channel` | **Lookup** | via `Staff` → `Notify Channel` |
| `Staff Telegram Chat ID` | **Lookup** | via `Staff` → `Telegram Chat ID` |
| `Staff Slack Member ID` | **Lookup** | via `Staff` → `Slack Member ID` |
| `Staff Email` | **Lookup** | via `Staff` → `Email` |
| `Last Modified` | **Last modified time** | field type, not a formula. Leave "all editable fields" selected |
| `Last Modified By` | **Last modified by** | field type. This is the `Actor` in the audit trail |
| `Change Reason` | Single line text | the scheduler fills this in when overriding — Workflow E flags changes without one |
| `Logged State` | Long text | JSON baseline written by Workflow C at publish; Workflow E diffs the live row against it to detect manual edits |

### Why `Logged State` lives in Airtable

The obvious place for a change-detection baseline is n8n's workflow static data. It doesn't work:
`$getWorkflowStaticData` **only persists for production runs of an active workflow**, so every
manual "Execute Workflow" gets a throwaway copy and reports zero changes forever. It's also wiped
by a container restart.

Storing the baseline per record in Airtable makes detection completely stateless — the same input
always produces the same result, manual and scheduled runs behave identically, and restarting
Docker changes nothing. Workflow C writes it on publish; Workflow E refreshes it after auditing a
change, and seeds it for any Published row that doesn't have one yet.
| `Session Date Flat` | **Formula** | `DATETIME_FORMAT({Session Date}, 'YYYY-MM-DD')` |
| `Staff Name Flat` | **Formula** | `ARRAYJOIN({Staff Name})` |

### Why the two "Flat" formula fields exist

Lookup fields return **arrays**, and Airtable's `filterByFormula` cannot reliably compare an array
to a string. `{Session Date} = '2026-08-14'` and `IS_AFTER({Session Date}, ...)` both fail or return
nothing — silently, with no error. Workflows A, B and E all filter Assignments by date or staff
name, so they query the flattened formula fields instead.

If you skip these two fields, Workflows B and E return zero rows on every run and look like they're
working perfectly while doing nothing at all.

### The 9 Lookup fields are not optional

Two workflows depend on them:

- **Workflow B** searches Assignments by `{Staff Name}` and `{Session Date}` directly. Without these
  Lookups it would fetch every Session and every Staff record and join them in JavaScript on every
  absence — 3× the API calls, and it will hit the rate limit under load.
- **Workflow C** reads `Staff Notify Channel` / `Telegram Chat ID` / `Slack Member ID` / `Email`
  off the Assignment row to route each notification. Without the four routing Lookups, the Switch
  node has nothing to switch on and **every message silently falls through to the Email branch**.
  Miss these four and the workflow will appear to run cleanly while nobody on Telegram hears anything.

### Required views

| View | Type | Filter | Purpose |
|---|---|---|---|
| **Scheduler Review** | Grid | `Status = Draft` | Where the human reviews and ticks `Approved` |
| **Published Schedule** | Grid, grouped by `Session Date` | `Status = Published` | Share this link — it's your requirement-8 deliverable |
| **Needs Notification** | Grid | `Approved = 1 AND Notified = 0` | What Workflow E picks up on its 15-minute poll |

Build **Scheduler Review** before the demo. Walking through it live is how you prove requirement 5
(manual override) — and it's the slide that reassures a sceptical scheduler that automation isn't
taking their judgement away.

---

## 7. Audit Log

| Field | Type | Config |
|---|---|---|
| `Log ID` | Autonumber | *primary field* |
| `Timestamp` | Created time | |
| `Action` | Single select | `DRAFT_GENERATED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_CHANGED`, `MANUAL_OVERRIDE`, `PUBLISHED`, `ABSENCE_REPORTED`, `ABSENCE_REPLACED`, `ABSENCE_ESCALATED`, `NOTIFICATION_SENT` |
| `Actor` | Single line text | `Workflow A` / `Workflow B` / scheduler's name |
| `Assignment` | **Link to Assignments** | |
| `Staff Affected` | **Link to Staff** | |
| `Session Affected` | **Link to Sessions** | |
| `Before Value` | Long text | |
| `After Value` | Long text | |
| `Reason` | Long text | |
| `Source` | Single select | `Automated`, `Manual` |

This table is the whole of requirement 9. The distinction to draw in the pitch: a spreadsheet's
version history tells you *a cell changed*. This tells you *who reassigned whom, when, and why* —
which is the only version anyone can actually act on.

---

## 8. Finish up

**Back-link on Absences:** now that Assignments exists, add `Affected Assignment` (Link to
Assignments) to the Absences table.

**Generate the Personal Access Token:**
1. https://airtable.com/create/tokens
2. Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
3. Access: the **Klaiya Live Scheduling** base
4. Copy the token — it's shown **once**. Paste it into n8n's credential store, not into a file.

**Grab the Base ID:** open the base and read the URL — `airtable.com/appXXXXXXXXXXXXXX/...`.
The `app...` string is the Base ID. Table IDs (`tbl...`) appear when you open each table.

---

## 9. Seed data checklist

Before running Workflow A, you need enough data that the output is *interesting*:

- [ ] 4 clients (mix of tiers, at least 2 requiring certification)
- [ ] 15 staff (mix of Host / Admin / Both; vary `Certified Clients` so certification actually bites)
- [ ] 20 sessions across one week, **including at least one overlapping pair on the same evening**
- [ ] Availability rows for ~12 of the 15 staff — leave 3 with none, so the gap report has something
      real to say
- [ ] 2–3 absence rows in the past week, so the fairness history isn't empty on the first run

That last point matters: with zero history every staff member scores identically and the fairness
ranking collapses to the hash tie-break. Seed 2–3 weeks of past assignments and the load-distribution
chart becomes the most persuasive slide in the deck.
