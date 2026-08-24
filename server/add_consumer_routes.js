const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const newRoutes = `
app.put('/api/consumers/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, meter_number, address, contact_number } = req.body;
  try {
    await db.execute({ 
      sql: 'UPDATE consumers SET name = ?, meter_number = ?, address = ?, contact_number = ? WHERE id = ?', 
      args: [name, meter_number, address, contact_number, id] 
    });
    logAudit(req.user.username, 'CONSUMERS', \`Updated consumer ID \${id}: \${name}\`);
    res.json({ message: 'Consumer updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/consumers/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const billings = await db.execute({ sql: 'SELECT id FROM billings WHERE consumer_id = ? LIMIT 1', args: [id] });
    if (billings.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete consumer with existing billing records' });
    }
    await db.execute({ sql: 'DELETE FROM consumers WHERE id = ?', args: [id] });
    logAudit(req.user.username, 'CONSUMERS', \`Deleted consumer ID: \${id}\`);
    res.json({ message: 'Consumer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/billings', async (req, res) => {`;

code = code.replace("app.get('/api/billings', async (req, res) => {", newRoutes);
fs.writeFileSync('server.js', code);
console.log('done adding routes');
