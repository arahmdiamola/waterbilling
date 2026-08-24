const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldStr = `app.post('/api/payments', async (req, res) => {
  let { billing_id, amount_paid, payment_method, receipt_number } = req.body;
  payment_method = payment_method || 'CASH';
  try {
    const parsedAmount = parseFloat(amount_paid);
    
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount paid must be greater than 0' });
    }

    await db.execute('BEGIN TRANSACTION');`;

const newStr = `app.post('/api/payments', async (req, res) => {
  let { billing_id, amount_paid, payment_method, receipt_number } = req.body;
  payment_method = payment_method || 'CASH';
  try {
    const parsedAmount = parseFloat(amount_paid);
    
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount paid must be greater than 0' });
    }

    const tx = await db.transaction('write');`;

code = code.replace(oldStr, newStr);

code = code.replace(`      if (!billing) {
        await db.execute('ROLLBACK');`, `      if (!billing) {
        await tx.rollback();`);

code = code.replace(`      if (billing.status === 'PAID') {
        await db.execute('ROLLBACK');`, `      if (billing.status === 'PAID') {
        await tx.rollback();`);

code = code.replace(`        const countResult = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [likeStr] })).rows[0];`, `        const countResult = (await tx.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [likeStr] })).rows[0];`);

code = code.replace(`      const billing = (await db.execute({ sql: 'SELECT amount_due, status FROM billings WHERE id = ?', args: [billing_id] })).rows[0];`, `      const billing = (await tx.execute({ sql: 'SELECT amount_due, status FROM billings WHERE id = ?', args: [billing_id] })).rows[0];`);

code = code.replace(`      const totalPaidStmt = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [billing_id] })).rows[0];`, `      const totalPaidStmt = (await tx.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [billing_id] })).rows[0];`);

code = code.replace(`      const paymentInfo = await db.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, parsedAmount, payment_method, receipt_number] });`, `      const paymentInfo = await tx.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, parsedAmount, payment_method, receipt_number] });`);

code = code.replace(`      await db.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`, `      await tx.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });`);

code = code.replace(`      await db.execute('COMMIT');`, `      await tx.commit();`);

code = code.replace(`    } catch (error) {
      await db.execute('ROLLBACK');`, `    } catch (error) {
      if (typeof tx !== 'undefined') await tx.rollback();`);

fs.writeFileSync('server.js', code);
console.log('done');
