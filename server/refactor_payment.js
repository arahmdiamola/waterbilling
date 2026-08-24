const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /app\.post\('\/api\/payments', async \(req, res\) => \{[\s\S]*?\}\);/m;
const match = code.match(regex);
if (match) {
  const replacement = `app.post('/api/payments', async (req, res) => {
  let { billing_id, amount_paid, payment_method, receipt_number } = req.body;
  payment_method = payment_method || 'CASH';
  try {
    const parsedAmount = parseFloat(amount_paid);
    
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount paid must be greater than 0' });
    }

    const tx = await db.transaction('write');
    try {
      const billing = (await tx.execute({ sql: 'SELECT amount_due, status FROM billings WHERE id = ?', args: [billing_id] })).rows[0];
      if (!billing) {
        await tx.rollback();
        return res.status(404).json({ error: 'Billing not found' });
      }
      
      if (billing.status === 'PAID') {
        await tx.rollback();
        return res.status(400).json({ error: 'Billing is already fully paid' });
      }

      // Auto-generate receipt number if not provided
      if (!receipt_number) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = \`\${year}\${month}\${day}\`;
        
        const likeStr = \`WB-\${dateStr}-%\`;
        const countResult = (await tx.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [likeStr] })).rows[0];
        
        const seq = String(countResult.count + 1).padStart(4, '0');
        receipt_number = \`WB-\${dateStr}-\${seq}\`;
      }

      const totalPaidStmt = (await tx.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [billing_id] })).rows[0];
      const totalPaidBefore = totalPaidStmt.total || 0;
      const totalPaidAfter = totalPaidBefore + parsedAmount;

      let newStatus = 'PENDING';
      if (totalPaidAfter >= billing.amount_due) {
        newStatus = 'PAID';
      } else if (totalPaidAfter > 0) {
        newStatus = 'PARTIAL';
      }

      const paymentInfo = await tx.execute({ sql: 'INSERT INTO payments (billing_id, amount_paid, payment_method, receipt_number) VALUES (?, ?, ?, ?)', args: [billing_id, parsedAmount, payment_method, receipt_number] });
      await tx.execute({ sql: 'UPDATE billings SET status = ? WHERE id = ?', args: [newStatus, billing_id] });

      await tx.commit();
      
      logAudit(req.user.username, 'PAYMENT', \`Recorded payment of PHP \${parsedAmount} for Bill ID \${billing_id} (Receipt: \${receipt_number})\`);

      const remainingBalance = Math.max(0, billing.amount_due - totalPaidAfter);

      res.status(201).json({ 
        success: true, 
        message: 'Payment processed successfully',
        new_status: newStatus,
        receipt_number,
        total_paid: totalPaidAfter,
        remaining_balance: remainingBalance,
        payment_id: paymentInfo.lastInsertRowid.toString()
      });
    } catch (txError) {
      await tx.rollback();
      throw txError;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`;
  code = code.replace(regex, replacement);
  fs.writeFileSync('server.js', code);
  console.log('Success');
} else {
  console.log('Not found');
}
`;
