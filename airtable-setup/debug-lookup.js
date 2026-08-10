/* Runs Workflow B's "Find Affected Assignments" query directly against Airtable,
   so we can see whether the filter or the data is at fault.

   Usage:  node debug-lookup.js "Marco Reyes" 2026-08-12
*/

const { getSchema, api, BASE } = require('./airtable');

const name = process.argv[2];
const date = process.argv[3];
if (!name || !date) {
  console.error('\nUsage: node debug-lookup.js "Staff Name" YYYY-MM-DD\n');
  process.exit(1);
}

const one = (v) => Array.isArray(v) ? v[0] : v;

async function search(tableId, formula) {
  const res = await api('GET', `/${BASE}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`);
  return res.records || [];
}

async function main() {
  const schema = await getSchema();
  const T = Object.fromEntries(schema.tables.map(t => [t.name, t.id]));

  // exactly what Workflow B sends
  const formula = `AND({Staff Name Flat} = '${name}', {Session Date Flat} = '${date}', {Status} = 'Published')`;
  console.log('\nWorkflow B sends this filterByFormula:\n  ' + formula);

  const hits = await search(T['Assignments'], formula);
  console.log(`\n  -> ${hits.length} record(s)\n`);

  if (hits.length) {
    for (const r of hits) {
      console.log(`  ${r.id}  ${one(r.fields['Session Client'])} ${one(r.fields['Session Date'])} `
        + `${one(r.fields['Session Start'])}-${one(r.fields['Session End'])} ${r.fields['Role']}`);
    }
    console.log('\nThe query works. The problem is elsewhere in Workflow B.');
    return;
  }

  // narrow it down one clause at a time
  console.log('No match. Testing each clause separately:\n');

  const byName = await search(T['Assignments'], `{Staff Name Flat} = '${name}'`);
  console.log(`  {Staff Name Flat} = '${name}'        -> ${byName.length}`);

  const byDate = await search(T['Assignments'], `{Session Date Flat} = '${date}'`);
  console.log(`  {Session Date Flat} = '${date}'   -> ${byDate.length}`);

  const byBoth = await search(T['Assignments'],
    `AND({Staff Name Flat} = '${name}', {Session Date Flat} = '${date}')`);
  console.log(`  both, any status                          -> ${byBoth.length}`);

  if (byBoth.length) {
    console.log('\n  Rows matching name + date, with their status:');
    for (const r of byBoth) {
      console.log(`    ${r.id}  Status="${r.fields['Status']}"  `
        + `Role=${r.fields['Role']}  Client=${one(r.fields['Session Client'])}`);
    }
  }

  // show what the flat fields actually contain for that person
  const anyForName = await search(T['Assignments'], `FIND('${name.split(' ')[0]}', {Staff Name Flat}) > 0`);
  if (anyForName.length) {
    console.log(`\n  All rows whose Staff Name Flat contains "${name.split(' ')[0]}":`);
    for (const r of anyForName.slice(0, 10)) {
      console.log(`    Staff Name Flat="${r.fields['Staff Name Flat']}"  `
        + `Session Date Flat="${r.fields['Session Date Flat']}"  Status="${r.fields['Status']}"`);
    }
  } else {
    console.log(`\n  No row at all has "${name.split(' ')[0]}" in Staff Name Flat.`);
  }

  console.log('\nRead the numbers above: whichever clause returns 0 is the broken one.');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
