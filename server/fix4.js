const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/const countStmt = db\.prepare\('SELECT COUNT\(\*\) as count FROM payments WHERE receipt_number LIKE \?'\);\s+const res = countStmt\.get\(`\$\{prefix\}%`\);/g, 
"const res = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [`${prefix}%`] })).rows[0];");

code = code.replace(/const paymentStmt = db\.prepare\('INSERT INTO payments \(billing_id, amount_paid, payment_method, receipt_number\) VALUES \(\?, \?, \?, \?\)'\);\s+const paymentInfo = paymentStmt\.run\(billing_id, amountToApply, payment_method, generatedReceipt\);\s+const updateBillingStmt = db\.prepare\('UPDATE billings SET status = \? WHERE id = \?'\);\s+updateBillingStmt\.run\(newStatus, billing_id\);/g, 
`const paymentInfo = await tx.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, amountToApply, payment_method, generatedReceipt] });
    await tx.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`);

code = code.replace(/const stmt = db\.prepare\([\s\S]*?UPDATE billings[\s\S]*?WHERE id = \?[\s\S]*?`\);\s*const info = stmt\.run\(newCurr, newConsumption, newAmountDue, id\);/g, 
"const info = await db.execute({ sql: 'UPDATE billings SET current_reading = ?, consumption = ?, amount_due = ? WHERE id = ?', args: [newCurr, newConsumption, newAmountDue, id] });");

code = code.replace(/const stmt = db\.prepare\([\s\S]*?UPDATE tenants[\s\S]*?rate_per_cubic_meter = \?[\s\S]*?`\);\s*stmt\.run\(name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter\);/g, 
"await db.execute({ sql: 'UPDATE tenants SET name = ?, billing_type = ?, flat_rate = ?, minimum_cubic_meters = ?, minimum_charge = ?, rate_per_cubic_meter = ?', args: [name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter] });");

code = code.replace(/const stmt = db\.prepare\('INSERT INTO consumers \(name, meter_number, address, contact_number\) VALUES \(\?, \?, \?, \?\)'\);\s*for \(const c of consumersList\) \{\s*stmt\.run\(c\.name, c\.meter_number, c\.address, c\.contact_number\);\s*\}/g, 
`for (const c of consumersList) {
      await tx.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)', args: [c.name, c.meter_number, c.address, c.contact_number] });
    }`);

code = code.replace(/const insertStmt = db\.prepare\(`[\s\S]*?INSERT INTO billings[\s\S]*?VALUES \(\?, \?, \?, \?, \?, \?, \?\)[\s\S]*?`\);\s*for \(const r of readingsList\) \{\s*insertStmt\.run\(r\.consumer_id, billing_month, r\.previous_reading, r\.current_reading, r\.consumption, r\.amount_due, due_date\);\s*\}/g, 
`for (const r of readingsList) {
        await tx.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [r.consumer_id, billing_month, r.previous_reading, r.current_reading, r.consumption, r.amount_due, due_date] });
      }`);

fs.writeFileSync('server.js', code);
