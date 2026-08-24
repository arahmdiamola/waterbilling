const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

function safeReplace(target, replacement) {
  if (!code.includes(target)) {
    console.error('TARGET NOT FOUND:', target.substring(0, 80));
    return false;
  }
  code = code.replace(target, replacement);
  return true;
}

// 1. JWT + Login response
safeReplace(
  "{ id: user.id, username: user.username, role: user.role }, JWT_SECRET",
  "{ id: user.id, username: user.username, role: user.role, assigned_purok: user.assigned_purok || null }, JWT_SECRET"
);
safeReplace(
  "res.json({ token, username: user.username, role: user.role });",
  "res.json({ token, username: user.username, role: user.role, assigned_purok: user.assigned_purok || null });"
);

// 2. User creation - accept assigned_purok
safeReplace(
  "const { username, password, role } = req.body;",
  "const { username, password, role, assigned_purok } = req.body;"
);
safeReplace(
  "const info = await db.execute({ sql: 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', args: [username, hash, userRole] });",
  "const assignedPurok = userRole === 'STAFF' ? (assigned_purok || null) : null;\n    const info = await db.execute({ sql: 'INSERT INTO users (username, password_hash, role, assigned_purok) VALUES (?, ?, ?, ?)', args: [username, hash, userRole, assignedPurok] });"
);
safeReplace(
  "res.status(201).json({ id: info.lastInsertRowid.toString(), username, role: userRole });",
  "res.status(201).json({ id: info.lastInsertRowid.toString(), username, role: userRole, assigned_purok: assignedPurok });"
);

// 3. GET /api/consumers - filter by purok for STAFF
safeReplace(
  "const consumers = (await db.execute('SELECT * FROM consumers ORDER BY name')).rows;",
  `let consumers;
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      consumers = (await db.execute({ sql: 'SELECT * FROM consumers WHERE purok = ? ORDER BY name', args: [req.user.assigned_purok] })).rows;
    } else {
      consumers = (await db.execute('SELECT * FROM consumers ORDER BY name')).rows;
    }`
);

// 4. POST /api/consumers - include purok
safeReplace(
  "const { name, meter_number, address, contact_number } = req.body;",
  "const { name, meter_number, address, contact_number, purok } = req.body;"
);
safeReplace(
  "const info = await db.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number) VALUES (?, ?, ?, ?)', args: [name, meter_number, address, contact_number] });",
  "const consumerPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : (purok || null);\n      const info = await db.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number, purok) VALUES (?, ?, ?, ?, ?)', args: [name, meter_number, address, contact_number, consumerPurok] });"
);
safeReplace(
  "res.status(201).json({ id: info.lastInsertRowid.toString(), name, meter_number, address, contact_number });",
  "res.status(201).json({ id: info.lastInsertRowid.toString(), name, meter_number, address, contact_number, purok: consumerPurok });"
);

// 5. PUT /api/consumers/:id - include purok
safeReplace(
  "const { name, meter_number, address, contact_number } = req.body;\n  try {\n    await db.execute({ \n      sql: 'UPDATE consumers SET name = ?, meter_number = ?, address = ?, contact_number = ? WHERE id = ?', \n      args: [name, meter_number, address, contact_number, id] \n    });",
  "const { name, meter_number, address, contact_number, purok } = req.body;\n  try {\n    await db.execute({ \n      sql: 'UPDATE consumers SET name = ?, meter_number = ?, address = ?, contact_number = ?, purok = ? WHERE id = ?', \n      args: [name, meter_number, address, contact_number, purok || null, id] \n    });"
);

// 6. GET /api/billings - filter by purok for STAFF
safeReplace(
  "const billings = (await db.execute(`\n      SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number as consumer_meter\n      FROM billings b \n      JOIN consumers c ON b.consumer_id = c.id \n      ORDER BY b.created_at DESC`)).rows;",
  `let billings;
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      billings = (await db.execute({ sql: \`
        SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number as consumer_meter
        FROM billings b 
        JOIN consumers c ON b.consumer_id = c.id 
        WHERE c.purok = ?
        ORDER BY b.created_at DESC\`, args: [req.user.assigned_purok] })).rows;
    } else {
      billings = (await db.execute(\`
        SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number as consumer_meter
        FROM billings b 
        JOIN consumers c ON b.consumer_id = c.id 
        ORDER BY b.created_at DESC\`)).rows;
    }`
);

// 7. GET /api/dashboard - filter stats by purok
safeReplace(
  "const totalConsumers = (await db.execute('SELECT COUNT(*) as count FROM consumers')).rows[0].count;",
  `const isStaff = req.user.role === 'STAFF' && req.user.assigned_purok;
    const purokFilter = isStaff ? req.user.assigned_purok : null;
    
    let totalConsumers;
    if (purokFilter) {
      totalConsumers = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM consumers WHERE purok = ?', args: [purokFilter] })).rows[0].count;
    } else {
      totalConsumers = (await db.execute('SELECT COUNT(*) as count FROM consumers')).rows[0].count;
    }`
);

// Dashboard billing stats
safeReplace(
  "const billingStats = (await db.execute(`\n      SELECT \n        SUM(amount_due) as total_billed,\n        SUM(CASE WHEN status = 'PAID' THEN amount_due ELSE 0 END) as total_collected,\n        SUM(CASE WHEN status != 'PAID' THEN amount_due ELSE 0 END) as total_pending\n      FROM billings`)).rows[0];",
  `let billingStats;
    if (purokFilter) {
      billingStats = (await db.execute({ sql: \`
        SELECT 
          SUM(b.amount_due) as total_billed,
          SUM(CASE WHEN b.status = 'PAID' THEN b.amount_due ELSE 0 END) as total_collected,
          SUM(CASE WHEN b.status != 'PAID' THEN b.amount_due ELSE 0 END) as total_pending
        FROM billings b JOIN consumers c ON b.consumer_id = c.id WHERE c.purok = ?\`, args: [purokFilter] })).rows[0];
    } else {
      billingStats = (await db.execute(\`
        SELECT 
          SUM(amount_due) as total_billed,
          SUM(CASE WHEN status = 'PAID' THEN amount_due ELSE 0 END) as total_collected,
          SUM(CASE WHEN status != 'PAID' THEN amount_due ELSE 0 END) as total_pending
        FROM billings\`)).rows[0];
    }`
);

// Dashboard recent billings
safeReplace(
  "const recentBillings = (await db.execute(`\n      SELECT b.*, c.name as consumer_name \n      FROM billings b JOIN consumers c ON b.consumer_id = c.id \n      ORDER BY b.created_at DESC LIMIT 10`)).rows;",
  `let recentBillings;
    if (purokFilter) {
      recentBillings = (await db.execute({ sql: \`
        SELECT b.*, c.name as consumer_name 
        FROM billings b JOIN consumers c ON b.consumer_id = c.id 
        WHERE c.purok = ?
        ORDER BY b.created_at DESC LIMIT 10\`, args: [purokFilter] })).rows;
    } else {
      recentBillings = (await db.execute(\`
        SELECT b.*, c.name as consumer_name 
        FROM billings b JOIN consumers c ON b.consumer_id = c.id 
        ORDER BY b.created_at DESC LIMIT 10\`)).rows;
    }`
);

// 8. Collection summary - add purok filter
safeReplace(
  "const { month } = req.query;\n  try {",
  "const { month, purok } = req.query;\n  const staffPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : null;\n  const effectivePurok = staffPurok || purok || null;\n  try {"
);

safeReplace(
  "WHERE b.billing_month = ?\\n      ORDER BY c.name\`, args: [month] })).rows;",
  "WHERE b.billing_month = ?\`, args: [month] })).rows;\n" +
  "    // Apply purok filter (re-query if needed)\n" +
  "    if (effectivePurok) {\n" +
  "      const filteredBills = (await db.execute({ sql: \`\n" +
  "        SELECT b.*, c.name as consumer_name,\n" +
  "          (SELECT SUM(p.amount_paid) FROM payments p WHERE p.billing_id = b.id) as amount_paid\n" +
  "        FROM billings b\n" +
  "        JOIN consumers c ON b.consumer_id = c.id\n" +
  "        WHERE b.billing_month = ? AND c.purok = ?\n" +
  "        ORDER BY c.name\`, args: [month, effectivePurok] })).rows;\n" +
  "      bills.length = 0;\n" +
  "      filteredBills.forEach(b => bills.push(b));\n" +
  "    }"
);

// 9. Consumer ledger - enforce purok for STAFF
safeReplace(
  "app.get('/api/reports/consumer-ledger', async (req, res) => {\n  const { consumer_id } = req.query;\n  try {",
  `app.get('/api/reports/consumer-ledger', async (req, res) => {
  const { consumer_id } = req.query;
  try {
    // Enforce purok access for STAFF
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      const consumerCheck = (await db.execute({ sql: 'SELECT purok FROM consumers WHERE id = ?', args: [consumer_id] })).rows[0];
      if (!consumerCheck || consumerCheck.purok !== req.user.assigned_purok) {
        return res.status(403).json({ error: 'Access denied. Consumer not in your assigned purok.' });
      }
    }`
);

// 10. Aging report - filter by purok for STAFF
safeReplace(
  "app.get('/api/reports/aging', async (req, res) => {\n  try {",
  `app.get('/api/reports/aging', async (req, res) => {
  try {
    const staffPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : null;`
);

// 11. Add purok-summary report endpoint before audit-logs
const purokSummaryRoute = `
app.get('/api/reports/purok-summary', async (req, res) => {
  const { month } = req.query;
  try {
    let sql = \`
      SELECT 
        c.purok,
        COUNT(DISTINCT c.id) as total_consumers,
        COALESCE(SUM(b.amount_due), 0) as total_billed,
        COALESCE(SUM(CASE WHEN b.status = 'PAID' THEN b.amount_due ELSE 0 END), 0) as total_collected,
        COALESCE(SUM(CASE WHEN b.status != 'PAID' THEN b.amount_due ELSE 0 END), 0) as total_pending
      FROM consumers c
      LEFT JOIN billings b ON b.consumer_id = c.id\`;
    const args = [];
    if (month) {
      sql += \` AND b.billing_month = ?\`;
      args.push(month);
    }
    sql += \` WHERE c.purok IS NOT NULL AND c.purok != '' GROUP BY c.purok ORDER BY c.purok\`;
    
    const rows = (await db.execute({ sql, args })).rows;
    const summary = rows.map(r => ({
      purok: r.purok,
      total_consumers: r.total_consumers,
      total_billed: r.total_billed || 0,
      total_collected: r.total_collected || 0,
      total_pending: r.total_pending || 0,
      collection_rate: r.total_billed > 0 ? ((r.total_collected || 0) / r.total_billed * 100).toFixed(1) + '%' : '0%'
    }));
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

`;

safeReplace("app.get('/api/audit-logs',", purokSummaryRoute + "app.get('/api/audit-logs',");

// 12. Add /api/puroks endpoint for dropdowns
const puroksRoute = `
app.get('/api/puroks', async (req, res) => {
  try {
    const puroks = (await db.execute("SELECT DISTINCT purok FROM consumers WHERE purok IS NOT NULL AND purok != '' ORDER BY purok")).rows;
    res.json(puroks.map(p => p.purok));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

`;

safeReplace("// --- Middleware ---", puroksRoute + "// --- Middleware ---");

fs.writeFileSync('server.js', code);
console.log('All backend changes applied successfully!');
