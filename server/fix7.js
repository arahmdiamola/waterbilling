const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Replace the `batchInsert` function with standard loop for Turso
code = code.replace(/const batchInsert = db\.transaction\(\(readingsList\) => \{([\s\S]*?)\}\);\s*const result = batchInsert\(readings\);/m, 
`const tx = await db.transaction('write');
    let generated = 0;
    let total_amount = 0;
    const errors = [];
    try {
      for (const r of readings) {
        try {
          const prev = parseFloat(r.previous_reading) || 0;
          const curr = parseFloat(r.current_reading);
          
          if (isNaN(curr)) {
            errors.push({ consumer_id: r.consumer_id, error: 'Invalid current reading' });
            continue;
          }

          let consumption = null;
          let amount_due = 0;

          if (tenant.billing_type === 'METERED') {
            consumption = curr - prev;
            if (consumption < 0) {
              errors.push({ consumer_id: r.consumer_id, error: 'Current reading is less than previous reading' });
              continue;
            }
            const minCubic = tenant.minimum_cubic_meters || 0;
            const minCharge = tenant.minimum_charge || 0;
            if (consumption <= minCubic) {
              amount_due = minCharge;
            } else {
              amount_due = minCharge + (consumption - minCubic) * tenant.rate_per_cubic_meter;
            }
          } else {
            amount_due = tenant.flat_rate;
          }

          await tx.execute({
            sql: "INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)",
            args: [r.consumer_id, billing_month, prev, curr, consumption, amount_due, due_date || null]
          });
          generated++;
          total_amount += amount_due;
        } catch (err) {
          errors.push({ consumer_id: r.consumer_id, error: err.message });
        }
      }
      await tx.commit();
    } catch(e) {
      await tx.rollback();
      throw e;
    }
    const result = { generated, total_amount, errors };`);

// Also fix the dashboard endpoints that we discovered were broken in the screenshot
code = code.replace(/const total_consumers = db\.prepare\('SELECT COUNT\(\*\) as count FROM consumers'\)\.get\(\)\.count;/g, 
  "const total_consumers = (await db.execute('SELECT COUNT(*) as count FROM consumers')).rows[0].count;");
code = code.replace(/const billedStmt = db\.prepare\('SELECT SUM\(amount_due\) as total FROM billings'\)\.get\(\);/g, 
  "const billedStmt = (await db.execute('SELECT SUM(amount_due) as total FROM billings')).rows[0];");
code = code.replace(/const collectedStmt = db\.prepare\('SELECT SUM\(amount_paid\) as total FROM payments'\)\.get\(\);/g, 
  "const collectedStmt = (await db.execute('SELECT SUM(amount_paid) as total FROM payments')).rows[0];");


fs.writeFileSync('server.js', code);
