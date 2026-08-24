const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// 1. Make handlers async
code = code.replace(/\(req,\s*res\)\s*=>/g, 'async (req, res) =>');
// Fix any double asyncs
code = code.replace(/async\s+async/g, 'async');

// 2. Separate statements (stmt.run, stmt.get, stmt.all)
code = code.replace(/const\s+stmt\s*=\s*db\.prepare\(([^)]+)\);\s*const\s+info\s*=\s*stmt\.run\(([^)]*)\);/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `const info = await db.execute(${sql});`;
  return `const info = await db.execute({ sql: ${sql}, args: [${args}] });`;
});
code = code.replace(/const\s+stmt\s*=\s*db\.prepare\(([^)]+)\);\s*return\s*stmt\.get\(([^)]*)\);/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `return (await db.execute(${sql})).rows[0];`;
  return `return (await db.execute({ sql: ${sql}, args: [${args}] })).rows[0];`;
});
code = code.replace(/const\s+stmt\s*=\s*db\.prepare\(([^)]+)\);\s*return\s*stmt\.all\(([^)]*)\);/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `return (await db.execute(${sql})).rows;`;
  return `return (await db.execute({ sql: ${sql}, args: [${args}] })).rows;`;
});
code = code.replace(/const\s+stmt\s*=\s*db\.prepare\(([^)]+)\);\s*const\s+([^ ]+)\s*=\s*stmt\.all\(([^)]*)\);/g, (match, sql, varName, args) => {
  if (!args || args.trim() === '') return `const ${varName} = (await db.execute(${sql})).rows;`;
  return `const ${varName} = (await db.execute({ sql: ${sql}, args: [${args}] })).rows;`;
});

// 3. Inline statements (db.prepare.get/all/run)
code = code.replace(/db\.prepare\(([^)]+)\)\.get\(([^)]*)\)/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `(await db.execute(${sql})).rows[0]`;
  return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows[0]`;
});
code = code.replace(/db\.prepare\(([^)]+)\)\.all\(([^)]*)\)/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `(await db.execute(${sql})).rows`;
  return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows`;
});
code = code.replace(/db\.prepare\(([^)]+)\)\.run\(([^)]*)\)/g, (match, sql, args) => {
  if (!args || args.trim() === '') return `await db.execute(${sql})`;
  return `await db.execute({ sql: ${sql}, args: [${args}] })`;
});

// 4. db.exec('BEGIN TRANSACTION') etc
code = code.replace(/db\.exec\('BEGIN TRANSACTION'\);?/g, "const tx = await db.transaction('write');");
code = code.replace(/db\.prepare\('BEGIN TRANSACTION'\)\.run\(\);?/g, "const tx = await db.transaction('write');");
code = code.replace(/db\.prepare\('COMMIT'\)\.run\(\);?/g, "await tx.commit();");
code = code.replace(/db\.prepare\('ROLLBACK'\)\.run\(\);?/g, "await tx.rollback();");
code = code.replace(/db\.exec\('COMMIT'\);?/g, "await tx.commit();");
code = code.replace(/db\.exec\('ROLLBACK'\);?/g, "await tx.rollback();");

// 5. Array map to Promise.all
code = code.replace(/const result = consumers\.map\(c => \{/g, 'const result = await Promise.all(consumers.map(async c => {');
code = code.replace(/already_billed,\r?\n\s+billed_id\r?\n\s+\};\r?\n\s+\}\);/g, 'already_billed,\n        billed_id\n      };\n    }));');

// 6. Fix lastInsertRowid
code = code.replace(/\.lastInsertRowid/g, '.lastInsertRowid.toString()');

// 7. Fix transaction loops (insertMany) - line 387
// const insertMany = db.transaction((consumersList) => {
//   const stmt = db.prepare('INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)');
//   for (const c of consumersList) {
//     stmt.run(c.name, c.meter_number, c.address, c.contact_number);
//   }
// });
// insertMany(consumers);
// We can just replace this whole block with a manual loop
const insertManyRegex = /const insertMany = db\.transaction\(\(consumersList\) => \{[^}]+\}\);\s+insertMany\(consumers\);/m;
code = code.replace(insertManyRegex, `const tx = await db.transaction('write');
    for (const c of consumers) {
      await tx.execute({
        sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)',
        args: [c.name, c.meter_number, c.address, c.contact_number]
      });
    }
    await tx.commit();`);


// 8. Fix transaction loops (batchInsert) - line 469
const batchInsertRegex = /const batchInsert = db\.transaction\(\(readingsList\) => \{[^}]+\}\);\s+batchInsert\(readings\);/m;
code = code.replace(batchInsertRegex, `const tx = await db.transaction('write');
    for (const r of readings) {
      await tx.execute({
        sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [r.consumer_id, billing_month, r.previous_reading, r.current_reading, r.consumption, r.amount_due, due_date]
      });
    }
    await tx.commit();`);


fs.writeFileSync('server.js', code);
console.log("Refactoring complete.");
