/* Reads the live base and reports whether the workflows are doing what they should.
   Safe to run any time - read-only. Also doubles as the pre-demo health check. */

const { getSchema, listRecords } = require('./airtable');

const one = (v) => Array.isArray(v) ? v[0] : v;
const F = (r, n) => (r.fields && r.fields[n] !== undefined) ? r.fields[n] : r[n];
const count = (arr, fn) => arr.filter(fn).length;
const tally = (arr, keyFn) => {
  const out = {};
  for (const x of arr) { const k = keyFn(x) || '(blank)'; out[k] = (out[k] || 0) + 1; }
  return out;
};
const show = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k}: ${v}`).join('   ');

async function main() {
  const schema = await getSchema();
  const T = Object.fromEntries(schema.tables.map(t => [t.name, t.id]));

  const [assignments, audit, sessions, availability, staff, absences] = await Promise.all([
    listRecords(T['Assignments']),
    listRecords(T['Audit Log']),
    listRecords(T['Sessions']),
    listRecords(T['Availability']),
    listRecords(T['Staff']),
    T['Absences'] ? listRecords(T['Absences']) : [],
  ]);

  const issues = [];

  console.log('\n' + '='.repeat(64));
  console.log('DATA');
  console.log('='.repeat(64));
  console.log(`  Staff          ${staff.length}   (active: ${count(staff, r => F(r, 'Active'))})`);
  console.log(`  Sessions       ${sessions.length}   ${show(tally(sessions, r => F(r, 'Status')))}`);
  console.log(`  Availability   ${availability.length}`);
  console.log(`  Absences       ${absences.length}`);
  console.log(`  Assignments    ${assignments.length}`);
  console.log(`  Audit Log      ${audit.length}`);

  console.log('\n' + '='.repeat(64));
  console.log('ASSIGNMENTS');
  console.log('='.repeat(64));
  console.log(`  By status      ${show(tally(assignments, r => F(r, 'Status')))}`);
  console.log(`  By origin      ${show(tally(assignments, r => F(r, 'Assigned By')))}`);
  console.log(`  Approved       ${count(assignments, r => F(r, 'Approved'))}`);
  console.log(`  Notified       ${count(assignments, r => F(r, 'Notified'))}`);

  // the check that matters: approved drafts that never got published
  const stuck = assignments.filter(r =>
    F(r, 'Approved') && !F(r, 'Notified') && F(r, 'Status') === 'Draft');
  if (stuck.length) {
    issues.push(`${stuck.length} assignment(s) are Approved but still Draft and un-notified.`
      + '\n     Workflow E has not picked them up. Run E, or check its Airtable filter.');
  }

  const published = assignments.filter(r => F(r, 'Status') === 'Published');
  const publishedNotNotified = published.filter(r => !F(r, 'Notified'));
  if (publishedNotNotified.length) {
    issues.push(`${publishedNotNotified.length} Published assignment(s) have Notified unticked.`
      + '\n     Workflow C sent nothing for these, or failed partway through its loop.');
  }

  console.log('\n' + '='.repeat(64));
  console.log('AUDIT TRAIL');
  console.log('='.repeat(64));
  if (!audit.length) {
    console.log('  (empty)');
    issues.push('Audit Log is empty - no workflow has written to it yet.');
  } else {
    console.log(`  By action      ${show(tally(audit, r => F(r, 'Action')))}`);
    console.log(`  By actor       ${show(tally(audit, r => F(r, 'Actor')))}`);
    console.log('\n  Most recent:');
    for (const r of audit.slice(-6).reverse()) {
      const after = String(F(r, 'After Value') || '').replace(/\s+/g, ' ').slice(0, 52);
      console.log(`    ${String(F(r, 'Action') || '?').padEnd(22)} ${after}`);
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log('SCHEMA HEALTH');
  console.log('='.repeat(64));

  // the formula fields workflows B and E filter on
  const flatOk = count(assignments, r => F(r, 'Session Date Flat'));
  const nameOk = count(assignments, r => F(r, 'Staff Name Flat'));
  console.log(`  Session Date Flat populated   ${flatOk}/${assignments.length}`);
  console.log(`  Staff Name Flat populated     ${nameOk}/${assignments.length}`);
  if (assignments.length && flatOk < assignments.length) {
    issues.push('Session Date Flat is blank on some rows. Workflows B and E filter on it'
      + '\n     and will silently return nothing for those records.');
  }
  if (assignments.length && nameOk < assignments.length) {
    issues.push('Staff Name Flat is blank on some rows. Workflow B looks up absences by it.');
  }

  // change-detection baseline. Workflow E only looks at sessions from yesterday
  // onward, so historical rows are out of scope by design - count only what E sees.
  const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const inWindow = assignments.filter(r =>
    F(r, 'Status') === 'Published' && String(F(r, 'Session Date Flat') || '') >= cutoff);
  const outOfWindow = count(assignments, r =>
    F(r, 'Status') === 'Published' && String(F(r, 'Session Date Flat') || '') < cutoff);

  const hasField = schema.tables.find(t => t.name === 'Assignments')
    .fields.some(f => f.name === 'Logged State');
  const seeded = count(inWindow, r => F(r, 'Logged State'));

  if (!hasField) {
    console.log('  Logged State field            MISSING');
    issues.push('The "Logged State" field does not exist on Assignments.'
      + '\n     Run create-base.js to add it, then re-import Workflows C and E.');
  } else {
    console.log(`  Logged State seeded           ${seeded}/${inWindow.length} published rows in E's window`);
    console.log(`     (${outOfWindow} historical row(s) excluded - session date before ${cutoff})`);
    if (inWindow.length && seeded === 0) {
      issues.push('No in-window Published row has a baseline yet.'
        + '\n     Run Workflow E once to seed, then make your edit.');
    } else if (seeded < inWindow.length) {
      issues.push(`${inWindow.length - seeded} in-window row(s) still unseeded - run E again.`);
    }
  }

  // name the rows that are actually editable for a change-detection test
  if (inWindow.length) {
    console.log('\n  Editable for a change-detection test:');
    for (const r of inWindow.slice(0, 8)) {
      console.log(`    ${String(one(F(r, 'Session Date Flat'))).padEnd(12)}`
        + `${String(one(F(r, 'Session Client')) || '?').padEnd(20)}`
        + `${String(F(r, 'Role') || '').padEnd(12)}${one(F(r, 'Staff Name')) || ''}`);
    }
  }

  // routing lookups - workflow C switches on these
  const chanOk = count(assignments, r => one(F(r, 'Staff Notify Channel')));
  const tgOk = count(assignments, r => one(F(r, 'Staff Telegram Chat ID')));
  console.log(`  Staff Notify Channel resolved ${chanOk}/${assignments.length}`);
  console.log(`  Staff Telegram Chat ID set    ${tgOk}/${assignments.length}`);
  if (assignments.length && chanOk < assignments.length) {
    issues.push('Staff Notify Channel is blank on some rows - Workflow C will route those to Email.');
  }
  if (assignments.length && tgOk < assignments.length) {
    issues.push('Some staff have no Telegram Chat ID. Their notifications will fail.');
  }

  console.log('\n' + '='.repeat(64));
  if (!issues.length) {
    console.log('NO PROBLEMS FOUND.');
  } else {
    console.log(`${issues.length} THING(S) TO LOOK AT:\n`);
    issues.forEach((p, i) => console.log(`  ${i + 1}. ${p}\n`));
  }
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
