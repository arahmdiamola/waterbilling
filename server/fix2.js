const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Dashboard metrics
code = code.replace(/const total_consumers = db\.prepare\('SELECT COUNT\(\*\) as count FROM consumers'\)\.get\(\)\.count;/g, 
  "const total_consumers = (await db.execute('SELECT COUNT(*) as count FROM consumers')).rows[0].count;");
code = code.replace(/const billedStmt = db\.prepare\('SELECT SUM\(amount_due\) as total FROM billings'\)\.get\(\);/g, 
  "const billedStmt = (await db.execute('SELECT SUM(amount_due) as total FROM billings')).rows[0];");
code = code.replace(/const collectedStmt = db\.prepare\('SELECT SUM\(amount_paid\) as total FROM payments'\)\.get\(\);/g, 
  "const collectedStmt = (await db.execute('SELECT SUM(amount_paid) as total FROM payments')).rows[0];");

// Payments and billing checks
code = code.replace(/const payments = db\.prepare\('SELECT SUM\(amount_paid\) as total_paid FROM payments WHERE billing_id = \?'\)\.get\(id\);/g, 
  "const payments = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total_paid FROM payments WHERE billing_id = ?', args: [id] })).rows[0];");
code = code.replace(/const totalPaidStmt = db\.prepare\('SELECT SUM\(amount_paid\) as total FROM payments WHERE billing_id = \?'\)\.get\(billing_id\);/g, 
  "const totalPaidStmt = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [billing_id] })).rows[0];");
code = code.replace(/const totalPaidStmt = db\.prepare\('SELECT SUM\(amount_paid\) as total FROM payments WHERE billing_id = \?'\)\.get\(payment\.billing_id\);/g, 
  "const totalPaidStmt = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [payment.billing_id] })).rows[0];");

// Audit Logs stmt
code = code.replace(/const stmt = db\.prepare\('INSERT INTO audit_logs \(username, action, details\) VALUES \(\?, \?, \?\)'\);\r?\n\s*stmt\.run\(username, action, details\);/g, 
  "await db.execute({ sql: 'INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)', args: [username, action, details] });");

// Users stmt
code = code.replace(/const stmt = db\.prepare\('INSERT INTO users \(username, password_hash, role\) VALUES \(\?, \?, \?\)'\);\r?\n\s*const info = stmt\.run\(username, hash, userRole\);/g, 
  "const info = await db.execute({ sql: 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', args: [username, hash, userRole] });");

// Consumers stmt
code = code.replace(/const stmt = db\.prepare\('INSERT INTO consumers \(name, meter_number, address, contact_number\) VALUES \(\?, \?, \?, \?\)'\);\r?\n\s*const info = stmt\.run\(name, meter_number, address, contact_number\);/g, 
  "const info = await db.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)', args: [name, meter_number, address, contact_number] });");

// Billings insert stmt
code = code.replace(/const stmt = db\.prepare\(`\s*INSERT INTO billings \(consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?\)\s*`\);\s*const info = stmt\.run\(consumer_id, billing_month, parseFloat\(previous_reading\), parseFloat\(current_reading\), consumption, amount_due, due_date\);/m, 
  "const info = await db.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [consumer_id, billing_month, parseFloat(previous_reading), parseFloat(current_reading), consumption, amount_due, due_date] });");

// Billing update stmt
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE billings\s*SET current_reading = \?, consumption = \?, amount_due = \?\s*WHERE id = \?\s*`\);\s*stmt\.run\(newCurr, newConsumption, newAmountDue, id\);/m, 
  "await db.execute({ sql: 'UPDATE billings SET current_reading = ?, consumption = ?, amount_due = ? WHERE id = ?', args: [newCurr, newConsumption, newAmountDue, id] });");

// Receipt number logic
code = code.replace(/const countStmt = db\.prepare\('SELECT COUNT\(\*\) as count FROM payments WHERE receipt_number LIKE \?'\);\s*const res = countStmt\.get\(`${prefix}%`\);/m, 
  "const res = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [`${prefix}%`] })).rows[0];");

// Payment processing logic inside transaction
code = code.replace(/const paymentStmt = db\.prepare\('INSERT INTO payments \(billing_id, amount_paid, payment_method, receipt_number\) VALUES \(\?, \?, \?, \?\)'\);\s*const paymentInfo = paymentStmt\.run\(billing_id, amountToApply, payment_method, generatedReceipt\);\s*const updateBillingStmt = db\.prepare\('UPDATE billings SET status = \? WHERE id = \?'\);\s*updateBillingStmt\.run\(newStatus, billing_id\);/m, 
  `const paymentInfo = await tx.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, amountToApply, payment_method, generatedReceipt] });
      await tx.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`);

// Update settings logic
code = code.replace(/const stmt = db\.prepare\(`\s*UPDATE tenants\s*SET name = \?, billing_type = \?, flat_rate = \?, minimum_cubic_meters = \?, minimum_charge = \?, rate_per_cubic_meter = \?\s*`\);\s*stmt\.run\(name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter\);/m, 
  "await db.execute({ sql: 'UPDATE tenants SET name = ?, billing_type = ?, flat_rate = ?, minimum_cubic_meters = ?, minimum_charge = ?, rate_per_cubic_meter = ?', args: [name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter] });");

// Reports ledger and aging
code = code.replace(/const ledgerRaw = db\.prepare\(`([\s\S]*?)`\)\.all\(consumer_id\);/m, 
  "const ledgerRaw = (await db.execute({ sql: `$1`, args: [consumer_id] })).rows;");
code = code.replace(/const agingRaw = db\.prepare\(`([\s\S]*?)`\)\.all\(\);/m, 
  "const agingRaw = (await db.execute(`$1`)).rows;");

fs.writeFileSync('server.js', code);
console.log('Fixed remaining missed queries');
