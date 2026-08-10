/* Checks the live Airtable base against schema-spec.js and reports exact mismatches.
   Run this before importing the workflows - it catches the silent failures. */

const spec = require('./schema-spec');
const { getSchema } = require('./airtable');

const problems = [];
const warn = [];

// What the workflows actually require. A mismatch here fails silently at runtime,
// which is why this check exists at all.
const EXPECTED_TYPE = {
  singleLineText: ['singleLineText'],
  multilineText: ['multilineText', 'singleLineText'],
  email: ['email', 'singleLineText'],
  checkbox: ['checkbox'],
  number: ['number'],
  date: ['date', 'dateTime'],
  singleSelect: ['singleSelect'],
  lastModifiedTime: ['lastModifiedTime'],
  lastModifiedBy: ['lastModifiedBy'],
  createdTime: ['createdTime'],
};

// Fields the engine parses as "HH:MM" strings. Airtable's native Time/Duration
// types serialise differently and break the comparison without erroring.
const MUST_BE_TEXT = new Set([
  'Sessions.Start Time', 'Sessions.End Time',
  'Availability.Available From', 'Availability.Available To',
  'Absences.Start Time', 'Absences.End Time',
]);

async function main() {
  const schema = await getSchema();
  const tables = Object.fromEntries(schema.tables.map(t => [t.name, t]));

  console.log('\nVerifying base schema...\n');

  for (const t of spec.tables) {
    const live = tables[t.name];
    if (!live) {
      problems.push(`Table missing entirely: ${t.name}`);
      continue;
    }

    const liveFields = Object.fromEntries(live.fields.map(f => [f.name, f]));
    const want = [
      t.primary,
      ...t.fields,
      ...t.links.map(l => ({ name: l.name, type: 'multipleRecordLinks', _link: l })),
      ...t.derived.map(d => ({
        name: d.name,
        type: d.kind === 'lookup' ? 'multipleLookupValues' : 'formula',
        _derived: d,
      })),
    ];

    let ok = 0;
    for (const f of want) {
      const lf = liveFields[f.name];
      const key = `${t.name}.${f.name}`;

      if (!lf) {
        problems.push(`Missing field: ${key}  (should be ${f.type})`);
        continue;
      }

      if (MUST_BE_TEXT.has(key) && lf.type !== 'singleLineText') {
        problems.push(
          `WRONG TYPE: ${key} is "${lf.type}" but must be Single line text.\n` +
          `             The engine compares these as "HH:MM" strings - a Time field\n` +
          `             returns a different format and every conflict check silently passes.`);
        continue;
      }

      const allowed = EXPECTED_TYPE[f.type] || [f.type];
      if (!allowed.includes(lf.type)) {
        // rollup is an acceptable stand-in for a lookup
        if (f.type === 'multipleLookupValues' && ['rollup', 'multipleLookupValues'].includes(lf.type)) {
          ok++; continue;
        }
        problems.push(`Wrong type: ${key} is "${lf.type}", expected "${f.type}"`);
        continue;
      }

      // select choices
      if (f.type === 'singleSelect' && f.options && f.options.choices) {
        const have = new Set((lf.options && lf.options.choices || []).map(c => c.name));
        const missing = f.options.choices.map(c => c.name).filter(n => !have.has(n));
        if (missing.length) {
          warn.push(`${key} is missing select options: ${missing.join(', ')}`);
        }
      }

      // linked records must point at the right table
      if (f._link) {
        const target = schema.tables.find(x => x.id === (lf.options || {}).linkedTableId);
        if (!target || target.name !== f._link.to) {
          problems.push(`${key} links to "${target ? target.name : 'unknown'}", expected "${f._link.to}"`);
          continue;
        }
      }

      ok++;
    }

    const status = want.length === ok ? 'OK  ' : 'FAIL';
    console.log(`  ${status}  ${t.name.padEnd(14)} ${ok}/${want.length} fields`);
  }

  // late links
  const live = tables['Absences'];
  for (const l of spec.lateLinks) {
    if (live && !live.fields.some(f => f.name === l.name)) {
      warn.push(`${l.table}.${l.name} missing (optional back-link, not used by any workflow)`);
    }
  }

  console.log('\n' + '='.repeat(64));

  if (warn.length) {
    console.log('\nWarnings (non-blocking):');
    warn.forEach(w => console.log('  - ' + w));
  }

  if (!problems.length) {
    console.log('\nSCHEMA OK - safe to import the workflows.');
    console.log('\nNext:  node seed-data.js');
    process.exit(0);
  }

  console.log(`\n${problems.length} PROBLEM(S) - fix these before importing:\n`);
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('\nField names are case- and space-sensitive. "Start Time" is not "Start time".');
  process.exit(1);
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
