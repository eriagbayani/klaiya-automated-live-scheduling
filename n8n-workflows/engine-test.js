/* Runs the Assignment Engine code straight out of workflow A's JSON, against synthetic data. */
const fs = require('fs');

const wf = JSON.parse(fs.readFileSync(
  require('path').join(__dirname, 'workflow-a-core-scheduling-engine.json'), 'utf8'));
const engineCode = wf.nodes.find(n => n.name === 'Assignment Engine').parameters.jsCode;

// ---- synthetic data ----
const clients = {
  glow:  { id: 'recGLOW', name: 'Glow Cosmetics PH', tier: 'A', cert: true },
  aura:  { id: 'recAURA', name: 'AuraTech',          tier: 'A', cert: true },
  home:  { id: 'recHOME', name: 'HomeEssentials',    tier: 'B', cert: false },
  snack: { id: 'recSNACK',name: 'SnackHub',          tier: 'C', cert: false },
};

const roles = ['Live Host', 'Live Admin', 'Both'];
const staff = [];
for (let i = 1; i <= 15; i++) {
  const role = roles[i % 3];
  const certs = [];
  if (i % 2 === 0) certs.push('recGLOW');
  if (i % 3 === 0) certs.push('recAURA');
  staff.push({
    id: `recSTAFF${String(i).padStart(2, '0')}`,
    name: `Staff ${i}`,
    role, active: true,
    certifiedClients: certs,
    maxSessionsPerWeek: 6,
    notifyChannel: 'Telegram',
  });
}

const dates = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'];
const mk = (id, date, s, e, c, h, a) => ({
  id, date, startTime: s, endTime: e,
  clientId: clients[c].id, clientName: clients[c].name, clientTier: clients[c].tier,
  requiresCertification: clients[c].cert, hostsRequired: h, adminsRequired: a,
});

const sessions = [
  mk('recS01','2026-08-10','14:00','16:00','snack',1,1),
  mk('recS02','2026-08-10','19:00','21:00','glow', 2,1),
  mk('recS03','2026-08-11','20:00','22:00','aura', 1,1),
  mk('recS04','2026-08-11','15:00','17:00','home', 1,1),
  mk('recS05','2026-08-12','19:00','21:00','glow', 1,1),
  mk('recS06','2026-08-12','13:00','15:00','snack',1,1),
  mk('recS07','2026-08-13','20:00','22:00','aura', 1,1),
  mk('recS08','2026-08-13','18:00','20:00','home', 1,1),
  // deliberate collision: same evening, overlapping windows, two different clients
  mk('recS09','2026-08-14','19:00','21:00','glow', 1,1),
  mk('recS10','2026-08-14','20:00','22:00','aura', 1,1),
  mk('recS11','2026-08-15','19:00','21:00','home', 2,1),
  mk('recS12','2026-08-16','14:00','16:00','snack',1,1),
];

// availability: most staff free 13:00-23:00 most days; 3 staff submit nothing
const availability = [];
for (const s of staff) {
  if (['recSTAFF13','recSTAFF14','recSTAFF15'].includes(s.id)) continue; // no submission
  for (const d of dates) {
    if ((Number(s.id.slice(-2)) + Number(d.slice(-2))) % 5 === 0) continue; // some days off
    availability.push({ staffId: s.id, date: d, availableFrom: '13:00', availableTo: '23:00' });
  }
}

const absences = [
  { staffId: 'recSTAFF04', date: '2026-08-14', startTime: '00:00', endTime: '23:59' },
];

// 3 weeks of prior history, deliberately lopsided so fairness has something to correct
const history = [];
for (let w = 1; w <= 3; w++) {
  for (let i = 1; i <= 6; i++) {              // staff 1-6 got most of the past work
    history.push({
      staffId: `recSTAFF${String(i).padStart(2, '0')}`,
      date: `2026-07-${String(10 + w * 3).padStart(2, '0')}`,
      startTime: '19:00', endTime: '21:00', weight: 2.1,
    });
  }
}

// ---- shim n8n globals ----
const $input = { first: () => ({ json: { sessions, staff, availability, absences, history } }) };
const runner = new Function('$input', engineCode + '\n');
const out = runner($input)[0].json;

// ---- report ----
console.log('=== STATS ===');
console.log(out.stats);

console.log('\n=== COVERAGE ===');
console.log(`filled ${out.stats.slotsFilled}/${out.stats.slotsTotal}  gaps: ${out.gaps.length}`);
for (const g of out.gaps) {
  console.log(`  GAP  ${g.client} ${g.date} ${g.startTime}-${g.endTime} (${g.role})`,
              JSON.stringify(g.reasonBreakdown));
}

console.log('\n=== LOAD DISTRIBUTION (new assignments only) ===');
const load = {};
for (const a of out.assignments) load[a.staffName] = (load[a.staffName] || 0) + a.weight;
const sorted = Object.entries(load).sort((a, b) => b[1] - a[1]);
for (const [n, w] of sorted) console.log(`  ${n.padEnd(10)} ${w.toFixed(1)}  ${'#'.repeat(Math.round(w * 2))}`);
const unassigned = staff.filter(s => !load[s.name]).map(s => s.name);
console.log(`  (no new shifts: ${unassigned.join(', ') || 'none'})`);

// ---- CORRECTNESS ASSERTIONS ----
console.log('\n=== ASSERTIONS ===');
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) fail++;
};

const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };

// 1. no double-booking
const byStaffDate = {};
for (const a of out.assignments) {
  const k = a.staffId + '|' + a.date;
  (byStaffDate[k] = byStaffDate[k] || []).push(a);
}
let dbl = 0;
for (const [k, list] of Object.entries(byStaffDate)) {
  for (let i = 0; i < list.length; i++) for (let j = i+1; j < list.length; j++) {
    if (toMin(list[i].startTime) < toMin(list[j].endTime) && toMin(list[j].startTime) < toMin(list[i].endTime)) {
      dbl++; console.log(`      overlap: ${k} ${list[i].startTime}-${list[i].endTime} vs ${list[j].startTime}-${list[j].endTime}`);
    }
  }
}
check('no overlapping assignments', dbl === 0, `(${dbl} found)`);

// 2. certification respected
const staffById = Object.fromEntries(staff.map(s => [s.id, s]));
const sessById  = Object.fromEntries(sessions.map(s => [s.id, s]));
let certViol = 0;
for (const a of out.assignments) {
  const sess = sessById[a.sessionId];
  if (sess.requiresCertification && !staffById[a.staffId].certifiedClients.includes(sess.clientId)) certViol++;
}
check('certification enforced', certViol === 0, `(${certViol} violations)`);

// 3. role match
let roleViol = 0;
for (const a of out.assignments) {
  const p = staffById[a.staffId];
  if (p.role !== a.role && p.role !== 'Both') roleViol++;
}
check('role match enforced', roleViol === 0, `(${roleViol} violations)`);

// 4. availability covers window
let availViol = 0;
for (const a of out.assignments) {
  const ok = availability.some(av => av.staffId === a.staffId && av.date === a.date &&
    toMin(av.availableFrom) <= toMin(a.startTime) && toMin(av.availableTo) >= toMin(a.endTime));
  if (!ok) availViol++;
}
check('availability covers session', availViol === 0, `(${availViol} violations)`);

// 5. absence respected
let absViol = 0;
for (const a of out.assignments) {
  if (absences.some(ab => ab.staffId === a.staffId && ab.date === a.date)) absViol++;
}
check('absences respected', absViol === 0, `(${absViol} violations)`);

// 6. weekly cap
const wk = {};
for (const a of out.assignments) wk[a.staffId] = (wk[a.staffId] || 0) + 1;
const capViol = Object.entries(wk).filter(([id, n]) => n > staffById[id].maxSessionsPerWeek).length;
check('weekly cap respected', capViol === 0, `(${capViol} violations)`);

// 7. no person twice on the same session
let sameSess = 0;
const perSess = {};
for (const a of out.assignments) {
  const k = a.sessionId;
  (perSess[k] = perSess[k] || []).push(a.staffId);
}
for (const list of Object.values(perSess)) {
  if (new Set(list).size !== list.length) sameSess++;
}
check('nobody assigned twice to one session', sameSess === 0, `(${sameSess} violations)`);

// 8. determinism - rerun must be identical
const out2 = new Function('$input', engineCode + '\n')($input)[0].json;
check('deterministic across runs',
  JSON.stringify(out.assignments) === JSON.stringify(out2.assignments));

// 9. fairness actually corrects history - staff 1-6 were overloaded before
const newLoadTop6 = out.assignments.filter(a => Number(a.staffId.slice(-2)) <= 6)
  .reduce((s, a) => s + a.weight, 0);
const newLoadRest = out.assignments.filter(a => Number(a.staffId.slice(-2)) > 6)
  .reduce((s, a) => s + a.weight, 0);
check('fairness favours under-loaded staff', newLoadRest > newLoadTop6,
  `(previously-overloaded got ${newLoadTop6.toFixed(1)}, rest got ${newLoadRest.toFixed(1)})`);

console.log(`\n${fail === 0 ? 'ALL ASSERTIONS PASSED' : fail + ' ASSERTION(S) FAILED'}`);
