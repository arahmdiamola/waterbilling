const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The `batchInsert` transaction block around line 445:
code = code.replace(/const batchInsert = db\.transaction\(\(readingsList\) => \{([\s\S]*?)const insertStmt = db\.prepare\(`\s*INSERT INTO billings \(consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date\)\s*VALUES \(\?, \?, \?, \?, \?, \?, 'PENDING', \?\)\s*`\);([\s\S]*?)insertStmt\.run\(r\.consumer_id, billing_month, prev, curr, consumption, amount_due, due_date\);([\s\S]*?)\}\);\s*const result = batchInsert\(readings\);/m, 
`const tx = await db.transaction('write');
    let generated = 0;
    let total_amount = 0;
    const errors = [];
    try {
      $1$2await tx.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date) VALUES (?, ?, ?, ?, ?, ?, \\'PENDING\\', ?)', args: [r.consumer_id, billing_month, prev, curr, consumption, amount_due, due_date] });$3await tx.commit();
    } catch(e) {
      await tx.rollback();
      throw e;
    }
    const result = { generated, total_amount, errors };`);

fs.writeFileSync('server.js', code);
console.log('Fixed batch insert');
