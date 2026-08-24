const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Line 258
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE billings\s*SET current_reading = \?, consumption = \?, amount_due = \?, status = \?\s*WHERE id = \?\s*`\);\s*stmt\.run\(newCurr, newConsumption, newAmountDue, newStatus, id\);/m, 
"await db.execute({ sql: 'UPDATE billings SET current_reading = ?, consumption = ?, amount_due = ?, status = ? WHERE id = ?', args: [newCurr, newConsumption, newAmountDue, newStatus, id] });");

// Line 302
code = code.replace(/const countStmt = db\.prepare\('SELECT COUNT\(\*\) as count FROM payments WHERE receipt_number LIKE \?'\);\s*const countResult = countStmt\.get\(likeStr\);/m, 
"const countResult = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [likeStr] })).rows[0];");

// Line 320
code = code.replace(/const paymentStmt = db\.prepare\('INSERT INTO payments \(billing_id, amount_paid, payment_method, receipt_number\) VALUES \(\?, \?, \?, \?\)'\);\s*const paymentInfo = paymentStmt\.run\(billing_id, parsedAmount, payment_method, receipt_number\);\s*const updateBillingStmt = db\.prepare\('UPDATE billings SET status = \? WHERE id = \?'\);\s*updateBillingStmt\.run\(newStatus, billing_id\);/m, 
`const paymentInfo = await db.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, parsedAmount, payment_method, receipt_number] });
    await db.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`);

// Line 358
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE tenants\s*SET name = \?, billing_type = \?, flat_rate = \?, minimum_cubic_meters = \?, minimum_charge = \?, rate_per_cubic_meter = \?, currency = \?\s*WHERE id = \(SELECT id FROM tenants LIMIT 1\)\s*`\);\s*stmt\.run\(name, billing_type, parseFloat\(flat_rate\), parseFloat\(minimum_cubic_meters\) \|\| 0, parseFloat\(minimum_charge\) \|\| 0, parseFloat\(rate_per_cubic_meter\), currency\);/m, 
"await db.execute({ sql: 'UPDATE tenants SET name = ?, billing_type = ?, flat_rate = ?, minimum_cubic_meters = ?, minimum_charge = ?, rate_per_cubic_meter = ?, currency = ? WHERE id = (SELECT id FROM tenants LIMIT 1)', args: [name, billing_type, parseFloat(flat_rate), parseFloat(minimum_cubic_meters) || 0, parseFloat(minimum_charge) || 0, parseFloat(rate_per_cubic_meter), currency] });");

// Line 383
code = code.replace(/const stmt = db\.prepare\('INSERT INTO consumers \(name, meter_number, address, contact_number\) VALUES \(\?, \?, \?, \?\)'\);\s*for \(const c of consumersList\) \{\s*try \{\s*stmt\.run\(c\.name, c\.meter_number, c\.address, c\.contact_number\);/m, 
`for (const c of consumersList) {
      try {
        await db.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)', args: [c.name, c.meter_number, c.address, c.contact_number] });`);

// Line 467
code = code.replace(/const insertStmt = db\.prepare\(`\s*INSERT INTO billings \(consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date\)\s*VALUES \(\?, \?, \?, \?, \?, \?, 'PENDING', \?\)\s*`\);\s*for \(const r of readingsList\) \{\s*try \{\s*insertStmt\.run\(r\.consumer_id, billing_month, r\.previous_reading, r\.current_reading, r\.consumption, r\.amount_due, due_date\);/m, 
`for (const r of readingsList) {
        try {
          await db.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date) VALUES (?, ?, ?, ?, ?, ?, \\'PENDING\\', ?)', args: [r.consumer_id, billing_month, r.previous_reading, r.current_reading, r.consumption, r.amount_due, due_date] });`);

fs.writeFileSync('server.js', code);
