/* Fills the Airtable/Telegram placeholders in the workflow JSON files.

   Reads table IDs straight from the live base, so there is nothing to copy by hand.
   Writes to n8n-workflows/configured/ - the originals stay clean as templates.

   Env: AIRTABLE_BASE_ID (required), SCHEDULER_CHAT_ID or TEST_CHAT_ID (optional)
*/

const fs = require('fs');
const path = require('path');
const { getSchema, BASE } = require('./airtable');

const SRC = path.join(__dirname, '..', 'n8n-workflows');
const OUT = path.join(SRC, 'configured');

// placeholder -> Airtable table name
const TABLE_PLACEHOLDERS = {
  REPLACE_WITH_SESSIONS_TABLE_ID: 'Sessions',
  REPLACE_WITH_STAFF_TABLE_ID: 'Staff',
  REPLACE_WITH_AVAILABILITY_TABLE_ID: 'Availability',
  REPLACE_WITH_ABSENCES_TABLE_ID: 'Absences',
  REPLACE_WITH_ASSIGNMENTS_TABLE_ID: 'Assignments',
  REPLACE_WITH_AUDIT_LOG_TABLE_ID: 'Audit Log',
};

// left for the n8n UI - credentials are picked from a dropdown, and workflow C's
// id does not exist until it has been imported
const DEFERRED = [
  'REPLACE_WITH_AIRTABLE_CRED_ID',
  'REPLACE_WITH_GROQ_CRED_ID',
  'REPLACE_WITH_TELEGRAM_CRED_ID',
  'REPLACE_WITH_SLACK_CRED_ID',
  'REPLACE_WITH_SMTP_CRED_ID',
  'REPLACE_WITH_WORKFLOW_C_ID',
];

async function main() {
  const chatId = process.env.SCHEDULER_CHAT_ID || process.env.TEST_CHAT_ID || '';

  console.log('\nReading table IDs from the live base...');
  const schema = await getSchema();
  const ids = Object.fromEntries(schema.tables.map(t => [t.name, t.id]));

  const map = { REPLACE_WITH_BASE_ID: BASE };
  let missing = false;
  for (const [ph, table] of Object.entries(TABLE_PLACEHOLDERS)) {
    if (!ids[table]) {
      console.error(`  MISSING TABLE: "${table}" - run create-base.js first`);
      missing = true;
      continue;
    }
    map[ph] = ids[table];
    console.log(`  ${table.padEnd(14)} ${ids[table]}`);
  }
  if (missing) process.exit(1);

  if (chatId) {
    map.REPLACE_WITH_SCHEDULER_CHAT_ID = chatId;
    console.log(`  ${'Scheduler chat'.padEnd(14)} ${chatId}`);
  } else {
    console.log('\n  NOTE: no SCHEDULER_CHAT_ID / TEST_CHAT_ID set.');
    console.log('        Telegram chat placeholders left in place - set them in n8n by hand.');
  }

  fs.mkdirSync(OUT, { recursive: true });

  console.log('\nWriting configured workflows...');
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json'));
  const stillOpen = new Set();

  for (const f of files) {
    let text = fs.readFileSync(path.join(SRC, f), 'utf8');
    let hits = 0;

    for (const [ph, val] of Object.entries(map)) {
      const n = text.split(ph).length - 1;
      if (n) { text = text.split(ph).join(val); hits += n; }
    }

    // sanity: output must still be valid JSON
    try { JSON.parse(text); }
    catch (e) { console.error(`  ! ${f} produced invalid JSON - skipped`); continue; }

    for (const d of DEFERRED) if (text.includes(d)) stillOpen.add(d);

    fs.writeFileSync(path.join(OUT, f), text, 'utf8');
    console.log(`  ${f}  (${hits} replacements)`);
  }

  console.log('\n' + '='.repeat(64));
  console.log(`Configured files are in:  n8n-workflows\\configured\\`);
  console.log('Import THOSE into n8n, not the originals.\n');

  if (stillOpen.size) {
    console.log('Still to set inside n8n (by design):');
    for (const d of [...stillOpen].sort()) {
      if (d === 'REPLACE_WITH_WORKFLOW_C_ID') {
        console.log(`  - ${d}`);
        console.log('      Import workflow C first, copy its id from the URL, then paste it into');
        console.log('      Workflow B "Call Workflow C (Notify)" and BOTH of Workflow E\'s call nodes.');
      } else {
        console.log(`  - ${d}  -> pick the credential from the node dropdown`);
      }
    }
  }
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
