/* Populates realistic demo data: 4 clients, 15 staff, 20 sessions across next week,
   availability for 12 of them, and 3 weeks of lopsided history so the fairness
   engine has something visible to correct.

   Dates are computed relative to today, so the demo always lands on "next week".
   Re-running clears the tables it owns first - safe to run repeatedly.

   Flags:  --keep    do not clear existing records
*/

const { getSchema, createRecords, listRecords, deleteRecords } = require('./airtable');

const KEEP = process.argv.includes('--keep');

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const today = new Date();
const nextMonday = (() => {
  const d = new Date(today);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d;
})();
const week = Array.from({ length: 7 }, (_, i) => iso(addDays(nextMonday, i)));

const CLIENTS = [
  { 'Client Name': 'Glow Cosmetics PH', 'Brand Tier': 'A', Platform: 'TikTok Shop', 'Requires Certification': true,  Active: true },
  { 'Client Name': 'AuraTech',          'Brand Tier': 'A', Platform: 'Lazada',      'Requires Certification': true,  Active: true },
  { 'Client Name': 'HomeEssentials',    'Brand Tier': 'B', Platform: 'Shopee',      'Requires Certification': false, Active: true },
  { 'Client Name': 'SnackHub',          'Brand Tier': 'C', Platform: 'TikTok Shop', 'Requires Certification': false, Active: true },
];

const NAMES = [
  'Maria Santos', 'Jenelyn Cruz', 'Marco Reyes', 'Aira Dela Cruz', 'Paolo Mendoza',
  'Kim Bautista', 'Rhea Villanueva', 'Carlo Aquino', 'Bea Ramos', 'Nico Tan',
  'Grace Lim', 'Justine Ocampo', 'Patricia Yu', 'Dennis Garcia', 'Angel Navarro',
];

async function main() {
  const schema = await getSchema();
  const T = Object.fromEntries(schema.tables.map(t => [t.name, t.id]));
  const need = ['Clients', 'Staff', 'Sessions', 'Availability', 'Assignments'];
  for (const n of need) {
    if (!T[n]) { console.error(`Table "${n}" not found. Run create-base.js first.`); process.exit(1); }
  }

  if (!KEEP) {
    console.log('\nClearing existing records...');
    for (const name of ['Assignments', 'Availability', 'Absences', 'Sessions', 'Staff', 'Clients', 'Audit Log']) {
      if (!T[name]) continue;
      const recs = await listRecords(T[name]);
      if (recs.length) {
        await deleteRecords(T[name], recs.map(r => r.id));
        console.log(`  cleared ${String(recs.length).padStart(3)}  ${name}`);
      }
    }
  }

  /* ---------- clients ---------- */
  console.log('\nCreating clients...');
  const clients = await createRecords(T.Clients, CLIENTS);
  const cid = Object.fromEntries(clients.map(r => [r.fields['Client Name'], r.id]));
  console.log(`  ${clients.length} clients`);

  /* ---------- staff ---------- */
  console.log('Creating staff...');
  const roles = ['Live Host', 'Live Admin', 'Both'];
  const staffRows = NAMES.map((name, i) => {
    const n = i + 1;
    const certs = [];
    if (n % 2 === 0) certs.push(cid['Glow Cosmetics PH']);
    if (n % 3 === 0) certs.push(cid['AuraTech']);
    return {
      Name: name,
      Role: roles[n % 3],
      Active: true,
      'Certified Clients': certs,
      'Max Sessions Per Week': 6,
      'Notify Channel': 'Telegram',
      // Point every test account at the scheduler's own chat until live testing is done.
      'Telegram Chat ID': process.env.TEST_CHAT_ID || '',
      Email: `staff${n}@example.com`,
      'Skill Tier': n <= 5 ? 'Senior' : (n <= 10 ? 'Mid' : 'Junior'),
      'Date Joined': iso(addDays(today, -200 + n * 10)),
    };
  });
  const staff = await createRecords(T.Staff, staffRows);
  const sid = staff.map(r => r.id);
  console.log(`  ${staff.length} staff`);

  /* ---------- sessions ---------- */
  console.log('Creating sessions...');
  const S = (dayIdx, start, end, client, hosts, admins) => ({
    'Session Name': `${client} - ${week[dayIdx]} ${start}`,
    Date: week[dayIdx],
    'Start Time': start,
    'End Time': end,
    Client: [cid[client]],
    'Hosts Required': hosts,
    'Admins Required': admins,
    Status: 'Draft',
  });

  const sessions = await createRecords(T.Sessions, [
    S(0, '14:00', '16:00', 'SnackHub', 1, 1),
    S(0, '19:00', '21:00', 'Glow Cosmetics PH', 2, 1),
    S(1, '15:00', '17:00', 'HomeEssentials', 1, 1),
    S(1, '20:00', '22:00', 'AuraTech', 1, 1),
    S(2, '13:00', '15:00', 'SnackHub', 1, 1),
    S(2, '19:00', '21:00', 'Glow Cosmetics PH', 1, 1),
    S(3, '18:00', '20:00', 'HomeEssentials', 1, 1),
    S(3, '20:00', '22:00', 'AuraTech', 1, 1),
    // deliberate cross-client collision on the same evening - the exact case a
    // spreadsheet misses, and the one to point at during the demo
    S(4, '19:00', '21:00', 'Glow Cosmetics PH', 1, 1),
    S(4, '20:00', '22:00', 'AuraTech', 1, 1),
    S(5, '19:00', '21:00', 'HomeEssentials', 2, 1),
    S(6, '14:00', '16:00', 'SnackHub', 1, 1),
  ]);
  console.log(`  ${sessions.length} sessions (${week[0]} to ${week[6]})`);

  /* ---------- availability ---------- */
  console.log('Creating availability...');
  const avail = [];
  staff.forEach((s, i) => {
    // leave the last 3 with no availability at all, so the gap report has
    // something real to say
    if (i >= 12) return;
    week.forEach((d, di) => {
      if ((i + di) % 5 === 0) return;   // scattered days off
      avail.push({
        Staff: [s.id],
        Date: d,
        'Available From': '13:00',
        'Available To': '23:00',
        Source: 'Manual',
        'Needs Review': false,
      });
    });
  });
  await createRecords(T.Availability, avail);
  console.log(`  ${avail.length} availability rows (12 of 15 staff)`);

  /* ---------- history ---------- */
  console.log('Creating history (past assignments)...');
  const pastSessions = await createRecords(T.Sessions, [0, 1, 2].flatMap(w =>
    [0, 1].map(k => ({
      'Session Name': `Past week ${w + 1} - ${k + 1}`,
      Date: iso(addDays(nextMonday, -7 * (w + 1) + k)),
      'Start Time': '19:00',
      'End Time': '21:00',
      Client: [cid['Glow Cosmetics PH']],
      'Hosts Required': 1,
      'Admins Required': 1,
      Status: 'Published',
    }))));

  // load the first 6 staff heavily so the fairness correction is visible
  const history = [];
  pastSessions.forEach((ps, i) => {
    for (let k = 0; k < 2; k++) {
      const person = sid[(i * 2 + k) % 6];
      history.push({
        Session: [ps.id],
        Staff: [person],
        Role: k === 0 ? 'Live Host' : 'Live Admin',
        Status: 'Published',
        'Assigned By': 'Auto',
        Approved: true,
        Notified: true,
        Weight: 2.1,
      });
    }
  });
  await createRecords(T.Assignments, history);
  console.log(`  ${pastSessions.length} past sessions, ${history.length} past assignments`);

  console.log('\n' + '='.repeat(64));
  console.log('Seed complete.\n');
  console.log(`  Demo week:        ${week[0]} to ${week[6]}`);
  console.log(`  Collision to show: ${week[4]} - Glow 19:00-21:00 vs AuraTech 20:00-22:00`);
  console.log(`  Staff with no availability: ${NAMES.slice(12).join(', ')}`);
  if (!process.env.TEST_CHAT_ID) {
    console.log('\n  NOTE: Telegram Chat IDs are blank. Set TEST_CHAT_ID to your own chat id');
    console.log('        and re-run, so notification tests reach you and nobody else.');
  }
  console.log('\nNext: import the workflows and run Workflow A.');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
