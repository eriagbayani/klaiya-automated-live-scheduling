/* Builds the Klaiya pitch deck. Run: node build-deck.js */
const pptxgen = require('pptxgenjs');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';              // 13.3 x 7.5
pres.author = 'Rainerio Agbayani Jr.';
pres.title = 'Klaiya — Automated Live Scheduling Workflow';

/* ---------------- palette ---------------- */
const INK    = '13203A';   // dominant dark
const STEEL  = '2C4A7C';   // supporting
const VERM   = 'E8543F';   // accent — "on air"
const GREEN  = '2E9E6B';
const AMBER  = 'C8892B';
const MUTED  = '5B6B85';
const TINT   = 'EEF2F8';
const WHITE  = 'FFFFFF';
const HEAD = 'Cambria';
const BODY = 'Calibri';

const W = 13.3, M = 0.6, CW = 13.3 - M * 2;

/* ---------------- helpers ---------------- */
function titleSlide(s, text, sub) {
  s.addText(text, { x: M, y: 0.45, w: CW, h: 0.75, fontFace: HEAD, fontSize: 34,
    bold: true, color: INK, margin: 0 });
  if (sub) s.addText(sub, { x: M, y: 1.18, w: CW, h: 0.4, fontFace: BODY, fontSize: 14,
    color: MUTED, margin: 0 });
}

// the repeating motif: a filled circle badge with a short label
function badge(s, x, y, label, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color: fill } });
  s.addText(label, { x, y, w: 0.42, h: 0.42, align: 'center', valign: 'middle',
    fontFace: BODY, fontSize: 13, bold: true, color: WHITE, margin: 0 });
}

function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.07,
    fill: { color: fill || TINT }, line: { color: fill || TINT } });
}

function stat(s, x, y, w, value, label, color) {
  s.addText(value, { x, y, w, h: 0.9, fontFace: HEAD, fontSize: 44, bold: true,
    color: color || INK, align: 'center', margin: 0 });
  s.addText(label, { x, y: y + 0.88, w, h: 0.5, fontFace: BODY, fontSize: 11,
    color: MUTED, align: 'center', margin: 0 });
}

/* ============================================================
   1 — TITLE
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText('Automated Live Scheduling Workflow', { x: M, y: 2.0, w: 11.0, h: 1.0,
    fontFace: HEAD, fontSize: 42, bold: true, color: WHITE, margin: 0 });
  s.addText('Solution design and working prototype  ·  Klaiya Digital Solution',
    { x: M, y: 3.05, w: 11.0, h: 0.45, fontFace: BODY, fontSize: 17, color: 'A9BBD6', margin: 0 });
  s.addText('Rainerio Agbayani Jr.  ·  12 August 2026',
    { x: M, y: 3.6, w: 11.0, h: 0.35, fontFace: BODY, fontSize: 13, color: '7A8DAD', margin: 0 });

  const chips = [
    ['5', 'n8n workflows, 95 nodes'],
    ['9 / 9', 'requirements verified live'],
    ['41', 'automated tests passing'],
  ];
  chips.forEach(([v, l], i) => {
    const x = M + i * 4.0;
    s.addShape(pres.ShapeType.roundRect, { x, y: 4.7, w: 3.6, h: 1.25, rectRadius: 0.08,
      fill: { color: '1C2C4C' }, line: { color: '2A3F66' } });
    s.addText(v, { x, y: 4.82, w: 3.6, h: 0.55, fontFace: HEAD, fontSize: 26, bold: true,
      color: VERM, align: 'center', margin: 0 });
    s.addText(l, { x, y: 5.36, w: 3.6, h: 0.4, fontFace: BODY, fontSize: 11,
      color: 'A9BBD6', align: 'center', margin: 0 });
  });

  s.addNotes('Opening. This is a solution design plus a working prototype - every requirement has been run against live Airtable, Groq and Telegram, not just designed.');
}

/* ============================================================
   2 — THE PROBLEM
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'What manual scheduling costs',
    'Four failures, all of them symptoms of the same missing capability');

  const items = [
    ['1', 'Scheduling conflicts', 'One host booked to two client sessions that overlap. Per-client tabs make cross-brand clashes invisible.'],
    ['2', 'Incomplete coverage', 'A session reaches air time understaffed, discovered too late to fix.'],
    ['3', 'Uneven workload', 'Reliable staff absorb the load. Prime-time, high-GMV slots concentrate among a few.'],
    ['4', 'Last-minute gaps', 'Someone calls in sick and the coordinator starts a group-chat scramble under time pressure.'],
  ];

  items.forEach(([n, head, body], i) => {
    const x = M + (i % 2) * 6.15;
    const y = 1.85 + Math.floor(i / 2) * 2.4;
    card(s, x, y, 5.75, 2.05);
    badge(s, x + 0.32, y + 0.32, n, i < 2 ? VERM : STEEL);
    s.addText(head, { x: x + 0.95, y: y + 0.3, w: 4.5, h: 0.4, fontFace: HEAD,
      fontSize: 17, bold: true, color: INK, margin: 0 });
    s.addText(body, { x: x + 0.95, y: y + 0.78, w: 4.5, h: 1.1, fontFace: BODY,
      fontSize: 12, color: MUTED, margin: 0 });
  });

  s.addNotes('These are the four problems in the brief. The point to land: they are not four separate problems, they are four symptoms of one thing - nobody has automated the decisions.');
}

/* ============================================================
   3 — ASSUMED BASELINE
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'The starting point', 'What a typical mid-size agency setup already covers');

  // caveat box - deliberately prominent
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 1.75, w: CW, h: 1.0, rectRadius: 0.07,
    fill: { color: 'FDF0EE' }, line: { color: VERM, width: 1.25 } });
  s.addText('ASSUMED BASELINE — NOT CONFIRMED', { x: M + 0.3, y: 1.87, w: 6, h: 0.3,
    fontFace: BODY, fontSize: 11, bold: true, color: VERM, charSpacing: 1, margin: 0 });
  s.addText('I had no visibility into Klaiya\u2019s current automation, so this models a typical setup: a shared spreadsheet, a reminder bot, and a human doing the actual matching. If any of it is wrong, the gaps change — the solution does not, because it is built against the nine requirements.',
    { x: M + 0.3, y: 2.16, w: CW - 0.6, h: 0.5, fontFace: BODY, fontSize: 11.5, color: '7A3226', margin: 0 });

  const cols = [
    [GREEN, '1', 'Already covered', 'Manual overrides — trivially, since a spreadsheet has no controls at all'],
    [AMBER, '5', 'Half covered', 'Data input · conflict prevention · notifications · publishing · audit trail'],
    [VERM, '3', 'Not covered', 'Automated assignment · fair allocation · absence management'],
  ];
  cols.forEach(([c, n, head, body], i) => {
    const x = M + i * 4.1;
    card(s, x, 3.05, 3.75, 2.5);
    s.addText(n, { x, y: 3.2, w: 3.75, h: 0.85, fontFace: HEAD, fontSize: 40, bold: true,
      color: c, align: 'center', margin: 0 });
    s.addText(head, { x, y: 4.05, w: 3.75, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true,
      color: INK, align: 'center', margin: 0 });
    s.addText(body, { x: x + 0.3, y: 4.45, w: 3.15, h: 0.95, fontFace: BODY, fontSize: 11,
      color: MUTED, align: 'center', margin: 0 });
  });

  s.addText('Say the caveat out loud. Framed as an assumption it invites correction; framed as fact it invites a contradiction you cannot win.',
    { x: M, y: 5.85, w: CW, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: MUTED, margin: 0 });

  s.addNotes('CRITICAL SLIDE. Read the caveat aloud, do not skip it. Inviting correction turns this into a working session instead of a pitch someone judges.');
}

/* ============================================================
   4 — THE INSIGHT
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText('The baseline automates communication.\nIt does not automate decisions.',
    { x: M, y: 1.1, w: 11.6, h: 1.5, fontFace: HEAD, fontSize: 32, bold: true,
      color: WHITE, lineSpacing: 42, margin: 0 });
  s.addText('Reminders and a shared sheet are storage and messaging. Every judgement is still human.',
    { x: M, y: 2.7, w: 11.6, h: 0.4, fontFace: BODY, fontSize: 14, color: 'A9BBD6', margin: 0 });

  const rows = [
    ['Who is qualified for this session?', 'Coordinator, from memory'],
    ['Does this clash with anything?', 'Nobody, reliably'],
    ['Who deserves the next shift?', 'Coordinator, informally'],
    ['Who covers this absence?', 'First person to reply in chat'],
  ];
  rows.forEach(([q, a], i) => {
    const y = 3.5 + i * 0.78;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: CW, h: 0.62, rectRadius: 0.06,
      fill: { color: '1C2C4C' }, line: { color: '1C2C4C' } });
    s.addText(q, { x: M + 0.35, y, w: 5.6, h: 0.62, valign: 'middle', fontFace: BODY,
      fontSize: 13.5, bold: true, color: WHITE, margin: 0 });
    s.addText(a, { x: M + 6.2, y, w: 5.5, h: 0.62, valign: 'middle', fontFace: BODY,
      fontSize: 13, color: VERM, margin: 0 });
  });

  s.addNotes('This is the thesis of the whole deck. Four decisions, all human today. Everything that follows automates exactly these four.');
}

/* ============================================================
   5 — ARCHITECTURE
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'How it works', 'Four layers — n8n orchestrates, Airtable stores, Groq handles language');

  const layers = [
    ['Sources and triggers', 'Weekly cron  ·  Hosted availability form  ·  Telegram messages  ·  Scheduler approval', TINT, INK],
    ['n8n orchestration — 5 workflows, 95 nodes', 'A weekly draft  ·  B absence cover  ·  C publish & notify  ·  D availability intake  ·  E change watcher', 'DCE6F5', INK],
    ['Deterministic assignment engine', 'Role match  ·  certification  ·  conflict check  ·  fairness ranking  —  no LLM anywhere in this layer', STEEL, WHITE],
    ['Services and delivery', 'Airtable, 7 tables  ·  Groq llama-3.3-70b for language only  ·  Telegram, Slack, email  ·  HTML + calendar export', TINT, INK],
  ];

  layers.forEach(([head, body, fill, fg], i) => {
    const y = 1.85 + i * 1.16;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: CW, h: 1.0, rectRadius: 0.07,
      fill: { color: fill }, line: { color: fill } });
    s.addText(head, { x: M + 0.35, y: y + 0.13, w: CW - 0.7, h: 0.38, fontFace: HEAD,
      fontSize: 15, bold: true, color: fg, margin: 0 });
    s.addText(body, { x: M + 0.35, y: y + 0.53, w: CW - 0.7, h: 0.35, fontFace: BODY,
      fontSize: 11.5, color: fg === WHITE ? 'C9D8EE' : MUTED, margin: 0 });
  });

  s.addText('The engine sits inside n8n but is called out separately because it is the part that must never be probabilistic.',
    { x: M, y: 6.6, w: CW, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: MUTED, margin: 0 });

  s.addNotes('Walk down the layers. Emphasise the third band - it is highlighted because that is where the actual scheduling decision lives, and it is deliberately plain JavaScript.');
}

/* ============================================================
   6 — LLM VS DETERMINISTIC
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Where the AI is — and where it deliberately is not',
    'Language tasks go to the model. Decisions do not.');

  card(s, M, 1.85, 5.85, 3.5, 'FDF0EE');
  badge(s, M + 0.35, 2.15, 'AI', VERM);
  s.addText('Groq  ·  llama-3.3-70b', { x: M + 1.0, y: 2.16, w: 4.5, h: 0.4,
    fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0 });
  s.addText([
    { text: 'Parse free-text availability into dated rows', options: { bullet: true, breakLine: true } },
    { text: 'Parse absence messages from Telegram', options: { bullet: true, breakLine: true } },
    { text: 'Draft personalised shift notifications', options: { bullet: true, breakLine: true } },
    { text: 'Summarise coverage gaps for the scheduler', options: { bullet: true } },
  ], { x: M + 0.45, y: 2.8, w: 5.1, h: 2.3, fontFace: BODY, fontSize: 12.5,
       color: '5A3128', paraSpaceAfter: 8, margin: 0 });

  card(s, M + 6.25, 1.85, 5.85, 3.5, 'E8EFF9');
  badge(s, M + 6.6, 2.15, 'JS', STEEL);
  s.addText('Deterministic code', { x: M + 7.25, y: 2.16, w: 4.5, h: 0.4,
    fontFace: HEAD, fontSize: 16, bold: true, color: INK, margin: 0 });
  s.addText([
    { text: 'Match role and client certification', options: { bullet: true, breakLine: true } },
    { text: 'Detect time overlap, with a 30-minute buffer', options: { bullet: true, breakLine: true } },
    { text: 'Compute fairness and rank candidates', options: { bullet: true, breakLine: true } },
    { text: 'Choose who gets the shift', options: { bullet: true } },
  ], { x: M + 6.7, y: 2.8, w: 5.1, h: 2.3, fontFace: BODY, fontSize: 12.5,
       color: '243B5E', paraSpaceAfter: 8, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.6, w: CW, h: 1.1, rectRadius: 0.07,
    fill: { color: INK }, line: { color: INK } });
  s.addText('An assignment must be exact, reproducible, instant, free and defensible when a host asks why they got three shifts and someone else got six. A language model is none of those five. Every AI call also has a static-template fallback — an outage degrades wording, never the schedule.',
    { x: M + 0.4, y: 5.72, w: CW - 0.8, h: 0.9, fontFace: BODY, fontSize: 12,
      color: 'C9D8EE', margin: 0 });

  s.addNotes('The most likely technical question in the room is "why not just let the AI schedule it?" This slide is the answer. Five properties, the model has none of them.');
}

/* ============================================================
   7 — FAIRNESS
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Fairness is not a shift count',
    'A Tuesday 2pm Tier-C session and a Friday 8pm Tier-A session are not the same shift');

  card(s, M, 1.85, 5.85, 2.3);
  s.addText('Session weight', { x: M + 0.35, y: 2.0, w: 5.1, h: 0.35, fontFace: HEAD,
    fontSize: 15, bold: true, color: INK, margin: 0 });
  s.addText('base 1.0  ×  prime time 18:00–22:00 (1.5)  ×  brand tier (A 1.4 · B 1.2 · C 1.0)',
    { x: M + 0.35, y: 2.4, w: 5.1, h: 0.55, fontFace: 'Courier New', fontSize: 11.5,
      color: STEEL, margin: 0 });
  s.addText('Range 1.0 to 2.1. Prime-time, high-GMV sessions carry more visibility and more incentive upside — so they count for more.',
    { x: M + 0.35, y: 3.0, w: 5.1, h: 0.95, fontFace: BODY, fontSize: 11.5, color: MUTED, margin: 0 });

  card(s, M + 6.25, 1.85, 5.85, 2.3);
  s.addText('Fairness score', { x: M + 6.6, y: 2.0, w: 5.1, h: 0.35, fontFace: HEAD,
    fontSize: 15, bold: true, color: INK, margin: 0 });
  s.addText('(weighted load + 1) ÷ (slots they were available for + 1)',
    { x: M + 6.6, y: 2.4, w: 5.1, h: 0.4, fontFace: 'Courier New', fontSize: 11.5,
      color: STEEL, margin: 0 });
  s.addText('Lowest score gets the next shift. Dividing by availability rewards people who make themselves available, without punishing part-timers for having less capacity.',
    { x: M + 6.6, y: 2.9, w: 5.1, h: 1.05, fontFace: BODY, fontSize: 11.5, color: MUTED, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 4.4, w: CW, h: 1.85, rectRadius: 0.07,
    fill: { color: TINT }, line: { color: TINT } });
  s.addText('Measured on the test dataset', { x: M + 0.4, y: 4.55, w: 5, h: 0.35,
    fontFace: HEAD, fontSize: 14, bold: true, color: INK, margin: 0 });
  s.addText('Six staff carried three weeks of heavy prior load. In the next week the engine gave them 2.1 weighted points against 36.3 for everyone else — a hard, visible correction that self-balances over two to three weeks.',
    { x: M + 0.4, y: 4.95, w: 7.0, h: 1.0, fontFace: BODY, fontSize: 12, color: MUTED, margin: 0 });
  stat(s, M + 7.8, 4.5, 2.0, '2.1', 'previously overloaded', MUTED);
  stat(s, M + 9.9, 4.5, 2.0, '36.3', 'everyone else', VERM);

  s.addNotes('If asked whether it is too aggressive: yes, deliberately. It self-balances within two to three weeks, and an exponential-decay variant is documented for production.');
}

/* ============================================================
   8 — BEFORE / AFTER
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Before and after, against all nine requirements',
    'The "before" column describes the assumed baseline, not a confirmed current system');

  const head = [
    { text: '#', options: { bold: true, color: WHITE, fill: { color: INK }, align: 'center' } },
    { text: 'Requirement', options: { bold: true, color: WHITE, fill: { color: INK } } },
    { text: 'Before  (assumed)', options: { bold: true, color: WHITE, fill: { color: INK } } },
    { text: 'After  (built and verified)', options: { bold: true, color: WHITE, fill: { color: INK } } },
  ];
  const rows = [
    ['1', 'Data input', 'Chat messages retyped by hand', 'Form and Telegram → AI-parsed into dated rows'],
    ['2', 'Automated assignment', '100% manual, hours per week', 'A full week drafted in under 60 seconds'],
    ['3', 'Conflict prevention', 'Misses cross-client overlaps', 'Zero double-bookings, structurally impossible'],
    ['4', 'Fair allocation', 'A shift count at best', 'Weighted by prime time and brand tier'],
    ['5', 'Manual overrides', 'Uncontrolled — edit any cell', 'Draft → review → approve → publish, edits audited'],
    ['6', 'Notifications', 'Group broadcast, silent on change', 'Per person, per channel, fires on change'],
    ['7', 'Absence management', 'Group chat, first responder wins', 'Qualified, available, fairest replacement, auto-assigned'],
    ['8', 'Export and publish', 'A live, mutable sheet', 'Shared view + HTML snapshot + calendar feed'],
    ['9', 'Audit trail', 'Cell history, no reason recorded', 'Who changed what, when and why'],
  ];

  s.addTable([head, ...rows.map(r => [
    { text: r[0], options: { align: 'center', bold: true, color: STEEL } },
    { text: r[1], options: { bold: true, color: INK } },
    { text: r[2], options: { color: MUTED } },
    { text: r[3], options: { color: '1D5C42' } },
  ])], {
    x: M, y: 1.8, w: CW, colW: [0.5, 2.6, 4.2, 4.8],
    fontFace: BODY, fontSize: 11.5, rowH: 0.44, valign: 'middle',
    border: { type: 'solid', color: 'D6DEEA', pt: 0.5 },
    fill: { color: WHITE },
  });

  s.addNotes('Do not read every row. Pick three - assignment, fairness, absence - and let them read the rest. Repeat that the before column is assumed.');
}

/* ============================================================
   9 — MEASURED RESULTS
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Measured, not projected',
    'Figures below come from an actual run against live Airtable, Groq and Telegram');

  stat(s, M,        1.8, 2.85, '26', 'slots to fill', INK);
  stat(s, M + 3.05, 1.8, 2.85, '23', 'filled automatically', GREEN);
  stat(s, M + 6.10, 1.8, 2.85, '3', 'gaps, each explained', AMBER);
  stat(s, M + 9.15, 1.8, 2.85, '<60s', 'to draft a full week', VERM);

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 3.5, w: 5.9, h: 2.9, rectRadius: 0.07,
    fill: { color: TINT }, line: { color: TINT } });
  s.addText('The three gaps are a feature', { x: M + 0.35, y: 3.65, w: 5.2, h: 0.35,
    fontFace: HEAD, fontSize: 15, bold: true, color: INK, margin: 0 });
  s.addText('All three were the same AuraTech Live Admin slot, and the engine reported exactly why: ten staff not certified for that client, five in the wrong role. It names the constraint instead of reporting a blank.\n\nA run that explains its own gaps is more useful than one that hides them.',
    { x: M + 0.35, y: 4.05, w: 5.2, h: 2.1, fontFace: BODY, fontSize: 12, color: MUTED, margin: 0 });

  s.addChart(pres.ChartType.bar, [{
    name: 'Audit entries',
    labels: ['Published', 'Availability', 'Changed', 'Override', 'Absence cover', 'Draft run'],
    values: [6, 3, 3, 2, 1, 1],
  }], {
    x: M + 6.3, y: 3.5, w: 5.8, h: 2.9,
    barDir: 'bar', showTitle: true, title: 'Audit trail from the live run',
    titleFontFace: HEAD, titleFontSize: 13, titleColor: INK,
    chartColors: [STEEL], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFontSize: 10, dataLabelColor: INK,
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
    catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
    valGridLine: { color: 'E2E8F2', size: 1 }, catGridLine: { style: 'none' },
    showLegend: false,
  });

  s.addText('Five distinct actors appear in that log — three workflows and two named humans. That distinction is the audit-trail requirement in a single screenshot.',
    { x: M, y: 6.6, w: CW, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: MUTED, margin: 0 });

  s.addNotes('Stress "measured". The baseline numbers are estimates; these are from a real run. That asymmetry is the difference between a claim and a demonstration.');
}

/* ============================================================
   10 — DEMO SEQUENCE
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'The demonstration', 'All nine requirements, in the order the work actually happens');

  const steps = [
    ['1', 'A host submits availability in plain English', 'Parsed into dated rows. "Not available Friday" is correctly excluded.', '1'],
    ['2', 'The weekly draft runs', 'Qualification, conflicts and fairness in one pass. Coverage stats and a gap report.', '2 · 3 · 4'],
    ['3', 'The scheduler reviews and approves', 'Nothing reaches staff until a human ticks Approved.', '5'],
    ['4', 'Publishing notifies each person', 'Per-person, on their own channel, written by the model.', '6'],
    ['5', 'A host reports an absence by message', 'Replacement found on the same fairness rules and contacted automatically.', '7'],
    ['6', 'The schedule exports', 'Shared view, HTML snapshot, and a calendar file that imports anywhere.', '8'],
    ['7', 'The audit log shows every step above', 'Who did what, when, and why — including the human edits.', '9'],
  ];

  steps.forEach(([n, head, body, req], i) => {
    const y = 1.8 + i * 0.72;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: CW, h: 0.62, rectRadius: 0.06,
      fill: { color: i % 2 ? WHITE : TINT }, line: { color: 'E2E8F2' } });
    badge(s, M + 0.18, y + 0.1, n, STEEL);
    s.addText(head, { x: M + 0.78, y, w: 4.9, h: 0.62, valign: 'middle', fontFace: BODY,
      fontSize: 12.5, bold: true, color: INK, margin: 0 });
    s.addText(body, { x: M + 5.75, y, w: 5.3, h: 0.62, valign: 'middle', fontFace: BODY,
      fontSize: 11, color: MUTED, margin: 0 });
    s.addText(req, { x: M + 11.15, y, w: 0.95, h: 0.62, valign: 'middle', align: 'center',
      fontFace: BODY, fontSize: 11, bold: true, color: VERM, margin: 0 });
  });

  s.addText('Roughly six minutes end to end.', { x: M, y: 6.9, w: CW, h: 0.3,
    fontFace: BODY, fontSize: 11, italic: true, color: MUTED, margin: 0 });

  s.addNotes('If presenting live, this slide is the map before you switch to the screen recording. Requirement numbers on the right let people follow along.');
}

/* ============================================================
   11 — WHAT RUNNING IT FOUND
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText('Eleven defects found by running it', { x: M, y: 0.5, w: CW, h: 0.7,
    fontFace: HEAD, fontSize: 32, bold: true, color: WHITE, margin: 0 });
  s.addText('Every one of them failed silently — the workflow reported success and did nothing',
    { x: M, y: 1.2, w: CW, h: 0.4, fontFace: BODY, fontSize: 14, color: 'A9BBD6', margin: 0 });

  const items = [
    ['A query returning zero rows halted the entire chain', 'No error. The weekly draft simply stopped and reported success.'],
    ['Lookup fields cannot be compared in Airtable filters', 'Two workflows returned nothing, forever, without complaint.'],
    ['The AI credential was misconfigured for days', 'Every call quietly used its fallback template. The system "worked" throughout.'],
    ['Exports were being base64-decoded, not encoded', 'Produced binary garbage that still downloaded as a valid-looking file.'],
    ['Change detection could never fire', 'n8n discards in-memory state on manual runs and on restart.'],
  ];
  items.forEach(([head, body], i) => {
    const y = 1.95 + i * 0.95;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: CW, h: 0.82, rectRadius: 0.06,
      fill: { color: '1C2C4C' }, line: { color: '1C2C4C' } });
    s.addText(head, { x: M + 0.35, y: y + 0.09, w: CW - 0.7, h: 0.32, fontFace: BODY,
      fontSize: 13, bold: true, color: WHITE, margin: 0 });
    s.addText(body, { x: M + 0.35, y: y + 0.42, w: CW - 0.7, h: 0.3, fontFace: BODY,
      fontSize: 11.5, color: '9DB2D4', margin: 0 });
  });

  s.addText('Common thread: n8n features that depend on live editor state do not survive a JSON import. The design now avoids that machinery or handles both cases, and 41 automated tests cover every fix.',
    { x: M, y: 6.75, w: CW, h: 0.5, fontFace: BODY, fontSize: 12, italic: true,
      color: VERM, margin: 0 });

  s.addNotes('Unconventional slide - most people hide bugs. Include it. It is the strongest evidence this is running software rather than a diagram. If asked why so many: because it was actually run.');
}

/* ============================================================
   12 — RISKS
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Risks, and what happens when they occur', 'Every failure mode has a defined path');

  const head = [
    { text: 'Risk', options: { bold: true, color: WHITE, fill: { color: INK } } },
    { text: 'Likelihood', options: { bold: true, color: WHITE, fill: { color: INK }, align: 'center' } },
    { text: 'How the design handles it', options: { bold: true, color: WHITE, fill: { color: INK } } },
  ];
  const rows = [
    ['AI service down or rate-limited', 'Medium', 'Every call has a static-template fallback. Schedules still generate; wording gets plainer.'],
    ['An absence message is misread', 'Medium', 'Below 0.7 confidence it asks for clarification instead of acting.'],
    ['No qualified replacement exists', 'High', 'Escalates with nearest-miss candidates and the one constraint each failed.'],
    ['Staff never submit availability', 'High', 'They become ineligible and appear in the gap report by name, not silently.'],
    ['Airtable free-tier record cap', 'Certain, ~4 months', 'Quarterly archiving, or a paid tier. Flagged now rather than discovered later.'],
    ['The engine produces a legal but unpopular schedule', 'Medium', 'The approval gate exists for exactly this. Fairness is a heuristic, not a verdict.'],
  ];

  s.addTable([head, ...rows.map(r => [
    { text: r[0], options: { bold: true, color: INK } },
    { text: r[1], options: { align: 'center', color: MUTED } },
    { text: r[2], options: { color: MUTED } },
  ])], {
    x: M, y: 1.8, w: CW, colW: [3.5, 1.4, 7.2],
    fontFace: BODY, fontSize: 11.5, rowH: 0.62, valign: 'middle',
    border: { type: 'solid', color: 'D6DEEA', pt: 0.5 }, fill: { color: WHITE },
  });

  s.addNotes('Naming the Airtable cap unprompted reads as competence, not weakness. Same with the fairness heuristic caveat.');
}

/* ============================================================
   13 — PILOT VS PRODUCTION
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'What this is, and what production would need',
    'The same five workflow files run unchanged on production infrastructure');

  const cols = [
    ['Pilot — built and running', GREEN, [
      'Docker on a laptop, free tier throughout',
      'Airtable free plan, 1,000 records',
      'One Telegram bot, tunnel for webhooks',
      'Nine requirements demonstrated end to end',
      '41 automated tests over the core logic',
    ]],
    ['Production — what it takes', STEEL, [
      'Small VPS or n8n Cloud, roughly $6/month',
      'Paid Airtable tier, or quarterly archiving',
      'Real domain and HTTPS, no tunnel',
      'Secret store, rotated tokens, failure alerts',
      'Two-way calendar sync and reply confirmations',
    ]],
  ];

  cols.forEach(([head, color, items], i) => {
    const x = M + i * 6.15;
    card(s, x, 1.85, 5.75, 4.0, i === 0 ? 'E9F5EF' : TINT);
    s.addText(head, { x: x + 0.4, y: 2.05, w: 5.0, h: 0.4, fontFace: HEAD,
      fontSize: 16, bold: true, color: color, margin: 0 });
    s.addText(items.map((t, j) => ({
      text: t, options: { bullet: true, breakLine: j < items.length - 1 },
    })), { x: x + 0.5, y: 2.6, w: 4.9, h: 3.0, fontFace: BODY, fontSize: 12,
      color: INK, paraSpaceAfter: 10, margin: 0 });
  });

  s.addText('Nothing here needs rewriting to scale. It needs hosting and a paid data tier.',
    { x: M, y: 6.1, w: CW, h: 0.35, fontFace: BODY, fontSize: 12, italic: true,
      color: MUTED, margin: 0 });

  s.addNotes('Answers the inevitable "is this a toy?" question. Honest framing: pilot-grade deployment, production-grade logic.');
}

/* ============================================================
   14 — CLOSING
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText('The engine proposes.\nThe scheduler disposes.\nThe system remembers which.',
    { x: M, y: 1.5, w: 11.0, h: 2.0, fontFace: HEAD, fontSize: 34, bold: true,
      color: WHITE, lineSpacing: 46, margin: 0 });

  const chips = [
    ['Hours', 'of weekly scheduling replaced by one 60-second run'],
    ['Zero', 'double-bookings — structurally prevented, not caught later'],
    ['Every change', 'attributed to a person or a workflow, with a reason'],
  ];
  chips.forEach(([v, l], i) => {
    const x = M + i * 4.0;
    s.addShape(pres.ShapeType.roundRect, { x, y: 4.2, w: 3.6, h: 1.5, rectRadius: 0.08,
      fill: { color: '1C2C4C' }, line: { color: '2A3F66' } });
    s.addText(v, { x: x + 0.25, y: 4.35, w: 3.1, h: 0.45, fontFace: HEAD, fontSize: 20,
      bold: true, color: VERM, margin: 0 });
    s.addText(l, { x: x + 0.25, y: 4.82, w: 3.1, h: 0.75, fontFace: BODY, fontSize: 11.5,
      color: 'A9BBD6', margin: 0 });
  });

  s.addText('Next: confirm the real current-state baseline, then a two-week pilot on one client brand.',
    { x: M, y: 6.2, w: 11.6, h: 0.4, fontFace: BODY, fontSize: 13, color: 'A9BBD6', margin: 0 });

  s.addNotes('Close on the override line - it reassures the scheduler that automation is not taking their judgement away. Then the ask: confirm the baseline, run a two-week pilot.');
}

/* ============================================================
   15 — APPENDIX
   ============================================================ */
{
  const s = pres.addSlide();
  titleSlide(s, 'Appendix — how the engine decides',
    'Eight hard constraints, then three ranking rules');

  card(s, M, 1.85, 5.85, 4.3);
  s.addText('Hard constraints — fail any, excluded', { x: M + 0.4, y: 2.05, w: 5.1, h: 0.35,
    fontFace: HEAD, fontSize: 14, bold: true, color: INK, margin: 0 });
  s.addText([
    'Active on the roster', 'Role matches the slot', 'Certified for that client brand',
    'Availability covers the full session', 'No absence logged for that window',
    'No clash with another booking, +30 min buffer', 'Under their weekly cap',
    'Not already on the same session',
  ].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
    { x: M + 0.5, y: 2.5, w: 5.0, h: 3.4, fontFace: BODY, fontSize: 11.5, color: MUTED,
      paraSpaceAfter: 6, margin: 0 });

  card(s, M + 6.25, 1.85, 5.85, 2.0);
  s.addText('Ranking — order the survivors', { x: M + 6.65, y: 2.05, w: 5.1, h: 0.35,
    fontFace: HEAD, fontSize: 14, bold: true, color: INK, margin: 0 });
  s.addText([
    'Lowest fairness score first',
    'Then longest since their last shift',
    'Then a stable hash — so reruns are identical',
  ].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
    { x: M + 6.75, y: 2.5, w: 5.0, h: 1.2, fontFace: BODY, fontSize: 11.5, color: MUTED,
      paraSpaceAfter: 6, margin: 0 });

  s.addShape(pres.ShapeType.roundRect, { x: M + 6.25, y: 4.15, w: 5.85, h: 2.0,
    rectRadius: 0.07, fill: { color: INK }, line: { color: INK } });
  s.addText('Scarcity first', { x: M + 6.65, y: 4.35, w: 5.1, h: 0.35, fontFace: HEAD,
    fontSize: 14, bold: true, color: WHITE, margin: 0 });
  s.addText('Sessions are filled hardest-first, not chronologically. Filling a session with twelve eligible hosts before one with two can strand the scarce session with nobody left. This single ordering choice is the difference between 94% and 100% coverage, and it costs nothing.',
    { x: M + 6.65, y: 4.75, w: 5.1, h: 1.3, fontFace: BODY, fontSize: 11.5,
      color: 'A9BBD6', margin: 0 });

  s.addNotes('Only show this if someone asks how the matching works. Scarcity-first ordering is the non-obvious bit worth mentioning.');
}

pres.writeFile({ fileName: 'C:/Users/My PC/Desktop/Klaiya-POC/deck/Klaiya-Automated-Live-Scheduling.pptx' })
  .then(f => console.log('written: ' + f));
