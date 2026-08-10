# Airtable Setup Scripts

Builds, checks and seeds the Klaiya base so you don't hand-create **81 fields across 7 tables**.
Hand-building that is roughly 90 minutes of clicking, and a single typo (`Start time` instead of
`Start Time`) produces a workflow that runs cleanly and does nothing.

**Your token never leaves your machine.** These run locally and read it from an environment
variable. Do not paste a PAT into a chat window, a file, or a commit.

---

## Prerequisites

- Node 18+ (you have 22)
- An **empty Airtable base** — create one in the UI, name it `Klaiya Live Scheduling`
- A Personal Access Token with **four** scopes:
  - `schema.bases:read`
  - `schema.bases:write` ← the setup scripts need this; the workflows don't
  - `data.records:read`
  - `data.records:write`

Generate at https://airtable.com/create/tokens and grant it access to that one base.

Get the Base ID from the URL: `airtable.com/appXXXXXXXXXXXXXX/...` → the `app...` part.

---

## Run

**PowerShell:**

```powershell
$env:AIRTABLE_TOKEN = "patXXXXXXXXXXXXXX"; $env:AIRTABLE_BASE_ID = "appXXXXXXXXXXXXXX"; $env:TEST_CHAT_ID = "123456789"
```

Then, in order:

```bash
node create-base.js
```

```bash
node verify-schema.js
```

```bash
node seed-data.js
```

`TEST_CHAT_ID` is optional but recommended — it sets every seeded staff member's Telegram Chat ID to
**yours**, so your first notification test reaches you and nobody else. You can change them to real
IDs later.

---

## What each script does

### `create-base.js`

Creates all 7 tables and every field, in three passes: scalar fields, then linked records, then
lookups and formulas. **Idempotent** — re-running skips whatever already exists, so it's safe after
a partial failure.

Airtable restricts creating computed fields over the API. Anything it can't create is printed at the
end as an exact click-by-click instruction:

```
  Assignments
    - "Session Date"  ->  field type: Lookup
        linked record field: Session
        field to look up:    Date
```

Expect to add the ~13 lookup and formula fields by hand. The script does the other ~68.

### `verify-schema.js`

Compares the live base against the spec and reports precise mismatches. Run it after any manual
edit. It specifically catches the failure modes that are otherwise invisible:

- **Time fields typed as Time instead of Single line text.** The engine compares `"HH:MM"` strings;
  Airtable's Time type serialises differently and every conflict check silently passes, giving you a
  schedule full of double-bookings with no errors anywhere.
- **Missing lookup fields.** Workflow C's router falls through to Email for everyone.
- **Missing `Session Date Flat` / `Staff Name Flat` formula fields.** Workflows B and E return zero
  rows on every run and look perfectly healthy.
- Linked records pointing at the wrong table.

Exits non-zero if anything is wrong, so you can chain it.

### `seed-data.js`

Populates a demo-ready dataset:

| | |
|---|---|
| 4 clients | mixed tiers, 2 requiring certification |
| 15 staff | mixed Host / Admin / Both, varied certifications |
| 12 sessions | across next week, dates computed relative to today |
| ~70 availability rows | for 12 of 15 staff — the other 3 are deliberate gap-report fodder |
| 6 past sessions + 12 past assignments | 3 weeks of load concentrated on the first 6 staff |

Two things are deliberate and worth pointing at during the demo:

- **A cross-client collision on Friday** — Glow 19:00–21:00 against AuraTech 20:00–22:00. This is
  exactly the double-booking a spreadsheet with per-client tabs cannot see.
- **Lopsided history.** The first six staff carry three weeks of prime-time Tier-A load. When the
  engine runs, it will visibly route work away from them. That contrast is the fairness slide.

Clears the tables it owns before seeding, so it's safe to re-run between demo rehearsals. Pass
`--keep` to append instead.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `403 ... not authorized` | Token missing `schema.bases:write`, or the base isn't in its allow-list | Regenerate with all four scopes and grant base access |
| `404 ... could not be found` | Wrong Base ID | Re-copy the `app...` string from the URL |
| `INVALID_REQUEST_UNKNOWN` on a lookup | Airtable won't create that field type via API | Expected — add it by hand from the printed instructions |
| `422 ... primary field` | Base isn't empty, or a table exists with a conflicting primary field | Start from a genuinely empty base |
| Seeding writes but links are blank | Ran `seed-data.js` before the link fields existed | Run `create-base.js` and `verify-schema.js` first |

---

## Starting over

Delete the base in Airtable and create a fresh empty one, then re-run all three. Faster and cleaner
than unpicking a half-built schema.
