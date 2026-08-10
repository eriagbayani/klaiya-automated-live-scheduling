/* Builds the Klaiya schema in an existing (empty) Airtable base.
   Idempotent: re-running skips anything that already exists. */

const spec = require('./schema-spec');
const { getSchema, createTable, createField } = require('./airtable');

const manual = [];   // things the API refused - reported at the end

async function main() {
  console.log('\nReading current base schema...');
  let schema = await getSchema();
  const byName = () => Object.fromEntries(schema.tables.map(t => [t.name, t]));

  /* ---------- pass 1: tables + scalar fields ---------- */
  // Tables are created with ONLY the primary field, then every other field is
  // added individually. Airtable rejects several field types (lastModifiedTime,
  // lastModifiedBy, ...) inside a table-creation call, and adding fields one at
  // a time means one bad field reports itself instead of killing the whole run.
  console.log('\n--- Pass 1: tables and scalar fields ---');
  for (const t of spec.tables) {
    let existing = byName()[t.name];

    if (!existing) {
      await createTable({ name: t.name, fields: [t.primary] });
      console.log(`  created table  ${t.name}`);
      schema = await getSchema();
      existing = byName()[t.name];
    } else {
      console.log(`  table exists   ${t.name}`);
    }

    const have = new Set(existing.fields.map(f => f.name));
    let added = 0;
    for (const f of t.fields) {
      if (have.has(f.name)) continue;

      // Airtable has no create-API for these types at all - don't waste a call.
      if (f.manualOnly) {
        manual.push({ table: t.name, field: f.name, type: 'uncreatable', ui: f.ui });
        continue;
      }

      try {
        await createField(existing.id, f);
        added++;
      } catch (e) {
        console.log(`    ! field      ${t.name}.${f.name} (${f.type}) -> ${e.message}`);
        manual.push({ table: t.name, field: f.name, type: f.type, why: e.message });
      }
    }
    if (added) console.log(`    + ${added} field(s)`);
    schema = await getSchema();
  }

  /* ---------- pass 2: linked records ---------- */
  console.log('\n--- Pass 2: linked record fields ---');
  const allLinks = [
    ...spec.tables.flatMap(t => t.links.map(l => ({ ...l, table: t.name }))),
    ...spec.lateLinks,
  ];

  for (const link of allLinks) {
    schema = await getSchema();
    const tbls = byName();
    const host = tbls[link.table];
    const target = tbls[link.to];

    if (!host || !target) {
      manual.push({ table: link.table, field: link.name, type: 'link', why: 'table missing' });
      continue;
    }
    if (host.fields.some(f => f.name === link.name)) {
      console.log(`  exists         ${link.table}.${link.name}`);
      continue;
    }

    // Airtable's accepted option shape for creating a link field varies by API
    // version, and its validator errors are misleading. Try shapes simplest-first;
    // isReversed and prefersSingleRecordLink are read-only on most versions.
    const shapes = [
      { linkedTableId: target.id },
      { linkedTableId: target.id, prefersSingleRecordLink: Boolean(link.single) },
      { linkedTableId: target.id, isReversed: false, prefersSingleRecordLink: Boolean(link.single) },
    ];

    let done = false, lastErr = null;
    for (const options of shapes) {
      try {
        await createField(host.id, { name: link.name, type: 'multipleRecordLinks', options });
        console.log(`  + link         ${link.table}.${link.name} -> ${link.to}`);
        done = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!done) {
      console.log(`  ! link         ${link.table}.${link.name} -> ${lastErr.message}`);
      manual.push({ table: link.table, field: link.name, type: 'link', why: lastErr.message, to: link.to });
    }
  }

  /* ---------- pass 3: lookups and formulas ---------- */
  console.log('\n--- Pass 3: lookup and formula fields ---');
  console.log('  (Airtable often rejects these over the API - anything that fails');
  console.log('   is listed at the end with exact click-by-click instructions)');

  for (const t of spec.tables) {
    if (!t.derived.length) continue;
    schema = await getSchema();
    const host = byName()[t.name];
    if (!host) continue;

    for (const d of t.derived) {
      if (host.fields.some(f => f.name === d.name)) {
        console.log(`  exists         ${t.name}.${d.name}`);
        continue;
      }

      let body;
      if (d.kind === 'lookup') {
        const linkField = host.fields.find(f => f.name === d.via);
        const targetTableId = linkField && linkField.options && linkField.options.linkedTableId;
        const targetTable = schema.tables.find(x => x.id === targetTableId);
        const targetField = targetTable && targetTable.fields.find(f => f.name === d.field);
        if (!linkField || !targetField) {
          manual.push({ table: t.name, field: d.name, type: 'lookup',
                        why: `needs ${d.via} -> ${d.field}`, via: d.via, source: d.field });
          console.log(`  ! lookup       ${t.name}.${d.name} (source not ready)`);
          continue;
        }
        body = { name: d.name, type: 'multipleLookupValues',
                 options: { recordLinkFieldId: linkField.id, fieldIdInLinkedTable: targetField.id } };
      } else {
        body = { name: d.name, type: 'formula', options: { formula: d.formula } };
      }

      try {
        await createField(host.id, body);
        console.log(`  + ${d.kind.padEnd(8)}    ${t.name}.${d.name}`);
      } catch (e) {
        console.log(`  ! ${d.kind.padEnd(8)}    ${t.name}.${d.name} -> ${e.message}`);
        manual.push({ table: t.name, field: d.name, type: d.kind,
                      why: e.message, via: d.via, source: d.field, formula: d.formula });
      }
    }
  }

  /* ---------- report ---------- */
  console.log('\n' + '='.repeat(64));
  if (!manual.length) {
    console.log('Schema complete. Every field was created via the API.');
    console.log('\nNext:  node verify-schema.js');
    return;
  }

  console.log(`${manual.length} field(s) must be added by hand in the Airtable UI.`);
  console.log('This is normal - Airtable restricts creating computed fields over the API.\n');

  const byTable = {};
  for (const m of manual) (byTable[m.table] = byTable[m.table] || []).push(m);

  for (const [table, items] of Object.entries(byTable)) {
    console.log(`  ${table}`);
    for (const m of items) {
      if (m.type === 'lookup') {
        console.log(`    - "${m.name || m.field}"  ->  field type: Lookup`);
        console.log(`        linked record field: ${m.via}`);
        console.log(`        field to look up:    ${m.source}`);
      } else if (m.type === 'formula') {
        console.log(`    - "${m.field}"  ->  field type: Formula`);
        console.log(`        formula: ${m.formula}`);
      } else if (m.type === 'uncreatable') {
        console.log(`    - "${m.field}"  ->  field type: ${m.ui}`);
        console.log(`        (Airtable has no create-API for this type - UI only)`);
      } else if (m.type === 'link') {
        console.log(`    - "${m.field}"  ->  field type: Link to another record`);
        console.log(`        table to link to: ${m.to}`);
      } else {
        console.log(`    - "${m.field}"  ->  field type: ${m.type}   (${m.why})`);
      }
    }
    console.log('');
  }

  console.log('Add those, then run:  node verify-schema.js');
}

main().catch(e => {
  console.error('\nFAILED:', e.message);
  if (e.status === 403) {
    console.error('\n403 usually means the token is missing the schema.bases:write scope,');
    console.error('or the base is not in the token\'s allowed list.');
  }
  process.exit(1);
});
