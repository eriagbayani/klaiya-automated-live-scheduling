/* Tests the Code nodes added for workflows C(ICS), D and E. */
const fs = require('fs');
const DIR = require('path').join(__dirname, '/');
const load = (f) => JSON.parse(fs.readFileSync(DIR + f, 'utf8'));
const nodeCode = (wf, name) => wf.nodes.find(n => n.name === name).parameters.jsCode;

let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) fail++;
};

const mkItems = (arr) => ({ all: () => arr.map(j => ({ json: j })), first: () => ({ json: arr[0] }) });

/* ---------------- C: ICS export ---------------- */
console.log('\n=== Workflow C - ICS calendar export ===');
{
  const c = load('workflow-c-publish-notify-audit.json');
  const src = nodeCode(c, 'Build Calendar Export (ICS)');
  const rows = [
    { id: 'recA1', fields: { 'Session Date': ['2026-08-10'], 'Session Start': ['19:00'],
      'Session End': ['21:00'], 'Session Client': ['Glow Cosmetics PH'], 'Staff Name': ['Maria S'],
      'Role': 'Live Host', 'Status': 'Published' } },
    { id: 'recA2', fields: { 'Session Date': ['2026-08-11'], 'Session Start': ['09:30'],
      'Session End': ['11:00'], 'Session Client': ['SnackHub; Co'], 'Staff Name': ['Jen T'],
      'Role': 'Live Admin', 'Status': 'Published' } },
    { id: 'recBad', fields: { 'Session Date': [], 'Role': 'Live Host' } }, // must be skipped
  ];
  const $ = () => mkItems(rows);
  const out = new Function('$', src)($)[0].json;
  // the node now emits base64 so convertToFile can decode it back to a real file
  const ics = Buffer.from(out.ics, 'base64').toString('utf8');

  check('has VCALENDAR wrapper', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  check('CRLF line endings (RFC 5545)', ics.includes('\r\n') && !/[^\r]\n/.test(ics));
  check('skips rows with missing date', (ics.match(/BEGIN:VEVENT/g) || []).length === 2,
    `(${(ics.match(/BEGIN:VEVENT/g) || []).length} events from 3 rows)`);
  check('zero-pads times correctly', ics.includes('DTSTART;TZID=Asia/Manila:20260811T093000'));
  check('escapes semicolons in text', ics.includes('SnackHub\\; Co'));
  check('includes VTIMEZONE for Manila', ics.includes('TZID:Asia/Manila') && ics.includes('TZOFFSETTO:+0800'));
  check('every VEVENT has a UID', (ics.match(/UID:/g) || []).length === 2);
  check('balanced BEGIN/END blocks',
    (ics.match(/BEGIN:/g) || []).length === (ics.match(/END:/g) || []).length);
}

/* ---------------- D: availability expansion ---------------- */
console.log('\n=== Workflow D - availability parsing ===');
{
  const d = load('workflow-d-availability-intake.json');
  const src = nodeCode(d, 'Expand Slots');
  const form = { 'Your name': 'Maria S', 'Week starting (Monday)': '2026-08-10',
                 'When are you available?': 'Mon-Wed evenings, Thursday all day' };
  const staff = { id: 'recSTAFF01' };

  const run = (groqContent) => {
    const $ = (n) => n === 'Availability Form' ? mkItems([form]) : mkItems([staff]);
    const $input = { first: () => ({ json: groqContent }) };
    return new Function('$input', '$', src)($input, $).map(i => i.json);
  };

  // happy path
  const good = run({ choices: [{ message: { content: JSON.stringify({ slots: [
    { date: '2026-08-10', from: '18:00', to: '23:00' },
    { date: '2026-08-11', from: '18:00', to: '23:00' },
    { date: '2026-08-13', from: '09:00', to: '23:00' },
  ], confidence: 0.9 }) } }] });
  check('expands to one row per day', good.length === 3);
  check('maps to Airtable field names',
    good[0]['Available From'] === '18:00' && good[0]['Staff'][0] === 'recSTAFF01');
  check('high confidence not flagged for review', good.every(g => g['Needs Review'] === false));

  // low confidence
  const low = run({ choices: [{ message: { content: JSON.stringify({
    slots: [{ date: '2026-08-10', from: '18:00', to: '23:00' }], confidence: 0.4 }) } }] });
  check('low confidence flagged for review', low[0]['Needs Review'] === true);

  // malformed slots must be dropped
  const junk = run({ choices: [{ message: { content: JSON.stringify({ slots: [
    { date: '2026-08-10', from: '18:00', to: '23:00' },
    { date: 'next tuesday', from: '18:00', to: '23:00' },  // bad date
    { date: '2026-08-12', from: '25:00', to: '23:00' },    // bad hour
    { date: '2026-08-13', from: '22:00', to: '19:00' },    // end before start
  ], confidence: 0.9 }) } }] });
  check('drops malformed slots', junk.length === 1, `(kept ${junk.length} of 4)`);

  // groq total failure
  const dead = run({ error: 'timeout' });
  check('Groq failure preserved as raw text, not dropped',
    dead.length === 1 && dead[0]['Source'] === 'Manual'
    && dead[0]['Raw Text'] === form['When are you available?']);
  check('Groq failure flagged for review', dead[0]['Needs Review'] === true);

  // internal fields stripped before Airtable
  const stripSrc = nodeCode(d, 'Strip Internal Fields');
  const stripped = new Function('$input', stripSrc)(mkItems(good)).map(i => i.json);
  check('internal _fields stripped before write',
    stripped.every(s => !('_parseFailed' in s) && !('_staffName' in s)));
}

/* ---------------- E: change detection ---------------- */
console.log('\n=== Workflow E - approval & change detection ===');
{
  const e = load('workflow-e-publish-change-watcher.json');
  const src = nodeCode(e, 'Detect Approvals & Changes');

  const base = { staff: 'Maria S', role: 'Live Host', status: 'Published' };
  const row = (id, over = {}, loggedState = base) => ({ id, fields: Object.assign({
    'Staff': ['recS1'], 'Staff Name': ['Maria S'], 'Role': 'Live Host', 'Status': 'Published',
    'Approved': true, 'Notified': true, 'Session Client': ['Glow'], 'Session Date': ['2026-08-14'],
    'Session Start': ['19:00'], 'Session End': ['21:00'],
    'Logged State': loggedState === null ? '' : JSON.stringify(loggedState),
  }, over) });

  const run = (rows) => new Function('$input', src)(mkItems(rows))[0].json;

  // a published row with no baseline gets seeded, not reported as a change
  const r0 = run([row('rec1', {}, null)]);
  check('no baseline -> seeded, not reported as a change',
    r0.changeCount === 0 && r0.stateUpdateCount === 1);

  // baseline matches current -> nothing
  const r1 = run([row('rec1'), row('rec2')]);
  check('unchanged rows produce no audit rows',
    r1.changeCount === 0 && r1.stateUpdateCount === 0);

  // a human swaps the assigned staff member
  const r2 = run([row('rec1', { 'Staff': ['recS9'], 'Staff Name': ['Jen T'],
                                'Change Reason': 'Maria requested swap' })]);
  check('detects a staff swap', r2.changeCount === 1);
  check('captures before and after',
    r2.changes[0].diffs[0].before === 'Maria S' && r2.changes[0].diffs[0].after === 'Jen T');
  check('staff swap triggers re-notification', r2.renotifyIds.length === 1);
  check('reason captured when provided', r2.missingReasonCount === 0);
  check('baseline refreshed after an audited change', r2.stateUpdateCount === 1);

  // detection is stateless across runs - same input, same result every time
  const r2again = run([row('rec1', { 'Staff': ['recS9'], 'Staff Name': ['Jen T'],
                                     'Change Reason': 'Maria requested swap' })]);
  check('stateless: repeat run gives identical result',
    JSON.stringify(r2.changes) === JSON.stringify(r2again.changes));

  // a change with no reason must still be logged
  const r3 = run([row('rec1', { 'Role': 'Live Admin' })]);
  check('flags a change with no reason', r3.missingReasonCount === 1);
  check('missing reason still produces an audit entry', r3.changeCount === 1);

  // status-only change must NOT re-notify
  const r4 = run([row('rec1', { 'Status': 'Cancelled' })]);
  check('status-only change does not spam a re-notification', r4.renotifyIds.length === 0);

  // newly approved draft -> publish queue
  const r5 = run([row('rec9', { 'Status': 'Draft', 'Approved': true, 'Notified': false }, null)]);
  check('queues newly approved drafts for publish',
    r5.publishCount === 1 && r5.toPublish[0] === 'rec9');

  // corrupt baseline must not throw
  const r6 = run([row('rec1', { 'Logged State': 'not json{{{' })]);
  check('corrupt baseline is treated as missing, not fatal',
    r6.changeCount === 0 && r6.stateUpdateCount === 1);

  // Airtable caps PATCH at 10 records per call
  const many = Array.from({ length: 23 }, (_, i) => row('rec' + i, {}, null));
  const r7 = run(many);
  check('state updates chunked at 10 per PATCH',
    r7.stateChunks.length === 3 && r7.stateChunks[0].length === 10 && r7.stateChunks[2].length === 3,
    `(${r7.stateChunks.length} chunks)`);

  // audit row expansion
  const expandSrc = nodeCode(e, 'Expand Change Audit Rows');
  const rows2 = new Function('$input', expandSrc)({ first: () => ({ json: r2 }) }).map(i => i.json);
  check('audit rows carry actor and reason',
    rows2[0]['Action'] === 'MANUAL_OVERRIDE' && rows2[0]['Reason'] === 'Maria requested swap');
  const noReason = new Function('$input', expandSrc)({ first: () => ({ json: r3 }) }).map(i => i.json);
  check('missing reason recorded explicitly, not left blank',
    /NOT PROVIDED/.test(noReason[0]['Reason']));
}

console.log(`\n${fail === 0 ? 'ALL ASSERTIONS PASSED' : fail + ' ASSERTION(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
