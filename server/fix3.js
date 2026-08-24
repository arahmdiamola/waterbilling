const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Line 200: /api/billings
code = code.replace(/const stmt = db\.prepare\(`\s*INSERT INTO billings \(consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date\)\s*VALUES \(\?, \?, \?, \?, \?, \?, 'PENDING', \?\)\s*`\);\s*const info = stmt\.run\(consumer_id, billing_month, parseFloat\(previous_reading\), parseFloat\(current_reading\), consumption, amount_due, due_date\);/m,
"const info = await db.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date) VALUES (?, ?, ?, ?, ?, ?, \\'PENDING\\', ?)', args: [consumer_id, billing_month, parseFloat(previous_reading), parseFloat(current_reading), consumption, amount_due, due_date] });");

// Line 262: /api/billings/:id/adjust
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE billings\s*SET current_reading = \?, consumption = \?, amount_due = \?\s*WHERE id = \?\s*`\);\s*const info = stmt\.run\(newCurr, newConsumption, newAmountDue, id\);/m,
"const info = await db.execute({ sql: 'UPDATE billings SET current_reading = ?, consumption = ?, amount_due = ? WHERE id = ?', args: [newCurr, newConsumption, newAmountDue, id] });");

// Line 306: /api/payments
code = code.replace(/const countStmt = db\.prepare\('SELECT COUNT\(\*\) as count FROM payments WHERE receipt_number LIKE \?'\);\s*const resCount = countStmt\.get\(`\$\{prefix\}%`\);/g,
"const resCount = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [`${prefix}%`] })).rows[0];");

// Line 362: /api/settings
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE tenants\s*SET name = \?, billing_type = \?, flat_rate = \?, minimum_cubic_meters = \?, minimum_charge = \?, rate_per_cubic_meter = \?\s*`\);\s*const info = stmt\.run\(name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter\);/m,
"const info = await db.execute({ sql: 'UPDATE tenants SET name = ?, billing_type = ?, flat_rate = ?, minimum_cubic_meters = ?, minimum_charge = ?, rate_per_cubic_meter = ?', args: [name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter] });");

// Replace remaining transaction statements that didn't get caught
code = code.replace(/const paymentStmt = db\.prepare\('INSERT INTO payments \(billing_id, amount_paid, payment_method, receipt_number\) VALUES \(\?, \?, \?, \?\)'\);\s*const paymentInfo = paymentStmt\.run\(billing_id, amountToApply, payment_method, generatedReceipt\);\s*const updateBillingStmt = db\.prepare\('UPDATE billings SET status = \? WHERE id = \?'\);\s*updateBillingStmt\.run\(newStatus, billing_id\);/m,
`const paymentInfo = await tx.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, amountToApply, payment_method, generatedReceipt] });
      await tx.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`);

code = code.replace(/const stmt = db\.prepare\('INSERT INTO consumers \(name, meter_number, address, contact_number\) VALUES \(\?, \?, \?, \?\)'\);\s*for \(const c of consumers\) \{\s*stmt\.run\(c\.name, c\.meter_number, c\.address, c\.contact_number\);\s*\}/m,
`for (const c of consumers) {
        await tx.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)', args: [c.name, c.meter_number, c.address, c.contact_number] });
      }`);

code = code.replace(/const insertStmt = db\.prepare\(`\s*INSERT INTO billings \(consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?\)\s*`\);\s*for \(const r of readings\) \{\s*insertStmt\.run\(r\.consumer_id, billing_month, r\.previous_reading, r\.current_reading, r\.consumption, r\.amount_due, due_date\);\s*\}/m,
`for (const r of readings) {
        await tx.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [r.consumer_id, billing_month, r.previous_reading, r.current_reading, r.consumption, r.amount_due, due_date] });
      }`);


fs.writeFileSync('server.js', code);
console.log('Fixed final missed queries');
