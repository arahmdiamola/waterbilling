const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-super-secret-key-change-in-production';

const PORT = process.env.PORT || 5000;

// --- Health Check for UptimeRobot ---
app.get('/api/ping', async (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Auth Endpoints ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = (await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] })).rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, assigned_purok: user.assigned_purok || null }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, role: user.role, assigned_purok: user.assigned_purok || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Public Settings ---
app.get('/api/public/settings', async (req, res) => {
  try {
    const tenant = (await db.execute('SELECT name FROM tenants LIMIT 1')).rows[0];
    res.json({ name: tenant ? tenant.name : 'WaterBill Pro' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Distinct Puroks List (Public/Auth) ---
app.get('/api/puroks', async (req, res) => {
  try {
    const puroks = (await db.execute("SELECT DISTINCT purok FROM consumers WHERE purok IS NOT NULL AND purok != '' ORDER BY purok")).rows;
    res.json(puroks.map(p => p.purok));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // Fallback: accept token from query parameter (for direct browser downloads)
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// Protect all following routes with authentication
app.use('/api', authenticateToken);

// Require SUPER_ADMIN role middleware
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
  }
  next();
};

// Require ADMIN or SUPER_ADMIN role middleware (blocks STAFF)
const requireAdmin = (req, res, next) => {
  if (req.user.role === 'STAFF') {
    return res.status(403).json({ error: 'Access denied. Staff cannot perform this action.' });
  }
  next();
};

// Audit Logging Helper
const logAudit = async (username, action, details) => {
  try {
    await db.execute({ sql: 'INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)', args: [username, action, details] });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

// --- User Management Endpoints ---
app.get('/api/users', requireSuperAdmin, async (req, res) => {
  try {
    const users = (await db.execute('SELECT id, username, role, assigned_purok, created_at FROM users ORDER BY created_at DESC')).rows;
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireSuperAdmin, async (req, res) => {
  const { username, password, role, assigned_purok } = req.body;
  try {
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const userRole = (role === 'SUPER_ADMIN' || role === 'STAFF') ? role : 'ADMIN';
    const assignedPurok = userRole === 'STAFF' ? (assigned_purok || null) : null;
    const hash = bcrypt.hashSync(password, 10);
    const info = await db.execute({ sql: 'INSERT INTO users (username, password_hash, role, assigned_purok) VALUES (?, ?, ?, ?)', args: [username, hash, userRole, assignedPurok] });
    logAudit(req.user.username, 'USERS', `Created new user: ${username} (${userRole})`);
    res.status(201).json({ id: info.lastInsertRowid.toString(), username, role: userRole, assigned_purok: assignedPurok });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
    logAudit(req.user.username, 'USERS', `Deleted user ID: ${id}`);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Existing Endpoints ---

app.get('/api/consumers', async (req, res) => {
  try {
    let consumers;
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      consumers = (await db.execute({ sql: 'SELECT * FROM consumers WHERE purok = ? ORDER BY name', args: [req.user.assigned_purok] })).rows;
    } else {
      consumers = (await db.execute('SELECT * FROM consumers ORDER BY name')).rows;
    }
    res.json(consumers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers', requireAdmin, async (req, res) => {
  const { name, meter_number, address, contact_number, purok } = req.body;
  try {
    const consumerPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : (purok || null);
    const info = await db.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number, purok) VALUES (?, ?, ?, ?, ?)', args: [name, meter_number || null, address, contact_number, consumerPurok] });
    logAudit(req.user.username, 'CONSUMERS', `Added consumer: ${name} (Meter: ${meter_number})`);
    res.status(201).json({ id: info.lastInsertRowid.toString(), name, meter_number, address, contact_number, purok: consumerPurok });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/consumers/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, meter_number, address, contact_number, purok } = req.body;
  try {
    await db.execute({ 
      sql: 'UPDATE consumers SET name = ?, meter_number = ?, address = ?, contact_number = ?, purok = ? WHERE id = ?', 
      args: [name, meter_number || null, address, contact_number, purok || null, id] 
    });
    logAudit(req.user.username, 'CONSUMERS', `Updated consumer ID ${id}: ${name}`);
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
    logAudit(req.user.username, 'CONSUMERS', `Deleted consumer ID: ${id}`);
    res.json({ message: 'Consumer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/billings', async (req, res) => {
  try {
    let billings;
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      billings = (await db.execute({ sql: `
        SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number as consumer_meter
        FROM billings b 
        JOIN consumers c ON b.consumer_id = c.id 
        WHERE c.purok = ?
        ORDER BY b.billing_month DESC, c.name ASC
      `, args: [req.user.assigned_purok] })).rows;
    } else {
      billings = (await db.execute(`
        SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number as consumer_meter
        FROM billings b 
        JOIN consumers c ON b.consumer_id = c.id 
        ORDER BY b.billing_month DESC, c.name ASC
      `)).rows;
    }
    res.json(billings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/billings', async (req, res) => {
  const { consumer_id, billing_month, previous_reading, current_reading, due_date } = req.body;
  try {
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      const consumer = (await db.execute({ sql: 'SELECT purok FROM consumers WHERE id = ?', args: [consumer_id] })).rows[0];
      if (!consumer || consumer.purok !== req.user.assigned_purok) {
        return res.status(403).json({ error: 'Access denied. Consumer is not in your assigned purok.' });
      }
    }

    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];
    let amount_due = 0;
    let consumption = null;

    if (tenant.billing_type === 'METERED') {
      const prev = parseFloat(previous_reading);
      const curr = parseFloat(current_reading);
      consumption = curr - prev;
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

    const info = await db.execute({ sql: 'INSERT INTO billings (consumer_id, billing_month, previous_reading, current_reading, consumption, amount_due, status, due_date) VALUES (?, ?, ?, ?, ?, ?, \'PENDING\', ?)', args: [consumer_id, billing_month, parseFloat(previous_reading), parseFloat(current_reading), consumption, amount_due, due_date] });
    logAudit(req.user.username, 'BILLING', `Generated bill for Consumer ID ${consumer_id} (${billing_month}) - Amount: ${amount_due}`);
    res.status(201).json({ id: info.lastInsertRowid.toString(), consumer_id, amount_due });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/billings/:id/adjust', async (req, res) => {
  const { id } = req.params;
  const { current_reading } = req.body;

  try {
    const bill = (await db.execute({ sql: 'SELECT * FROM billings WHERE id = ?', args: [id] })).rows[0];
    if (!bill) return res.status(404).json({ error: 'Billing not found' });
    if (bill.status === 'PAID') return res.status(400).json({ error: 'Cannot adjust a fully paid bill' });

    const tenantCheck = (await db.execute('SELECT billing_type FROM tenants LIMIT 1')).rows[0];
    if (tenantCheck && tenantCheck.billing_type === 'FLAT') {
      return res.status(400).json({ error: 'Cannot adjust readings on flat rate billing. The amount is fixed.' });
    }

    const newCurr = parseFloat(current_reading);
    if (isNaN(newCurr) || newCurr < bill.previous_reading) {
      return res.status(400).json({ error: 'Invalid reading. Must be greater than or equal to previous reading.' });
    }

    // Check payments so far
    const payments = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total_paid FROM payments WHERE billing_id = ?', args: [id] })).rows[0];
    const totalPaid = payments.total_paid || 0;

    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];
    let newAmountDue = 0;
    let newConsumption = null;

    if (tenant.billing_type === 'METERED') {
      newConsumption = newCurr - bill.previous_reading;
      const minCubic = tenant.minimum_cubic_meters || 0;
      const minCharge = tenant.minimum_charge || 0;
      if (newConsumption <= minCubic) {
        newAmountDue = minCharge;
      } else {
        newAmountDue = minCharge + (newConsumption - minCubic) * tenant.rate_per_cubic_meter;
      }
    } else {
      newAmountDue = tenant.flat_rate;
    }

    if (newAmountDue < totalPaid) {
      return res.status(400).json({ error: `Cannot adjust bill below what has already been paid (â‚±${totalPaid.toFixed(2)})` });
    }

    // Determine new status
    let newStatus = 'PENDING';
    if (totalPaid > 0) {
      newStatus = (newAmountDue === totalPaid) ? 'PAID' : 'PARTIAL';
    }

    await db.execute({ sql: 'UPDATE billings SET current_reading = ?, consumption = ?, amount_due = ?, status = ? WHERE id = ?', args: [newCurr, newConsumption, newAmountDue, newStatus, id] });
    logAudit(req.user.username, 'BILLING', `Adjusted Bill ID ${id} to new reading ${newCurr}`);
    res.json({ message: 'Bill adjusted successfully', amount_due: newAmountDue, status: newStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  let { billing_id, amount_paid, payment_method, receipt_number } = req.body;
  payment_method = payment_method || 'CASH';
  try {
    const parsedAmount = parseFloat(amount_paid);
    
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount paid must be greater than 0' });
    }

    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      const billCheck = (await db.execute({ sql: 'SELECT c.purok FROM billings b JOIN consumers c ON b.consumer_id = c.id WHERE b.id = ?', args: [billing_id] })).rows[0];
      if (!billCheck || billCheck.purok !== req.user.assigned_purok) {
        return res.status(403).json({ error: 'Access denied. Billing belongs to a consumer outside your assigned purok.' });
      }
    }

    const tx = await db.transaction('write');
    
    const billing = (await tx.execute({ sql: 'SELECT amount_due, status FROM billings WHERE id = ?', args: [billing_id] })).rows[0];
    if (!billing) {
      if (typeof tx !== 'undefined') await tx.rollback();
      return res.status(404).json({ error: 'Billing not found' });
    }
    
    if (billing.status === 'PAID') {
      if (typeof tx !== 'undefined') await tx.rollback();
      return res.status(400).json({ error: 'Billing is already fully paid' });
    }

    // Auto-generate receipt number if not provided
    if (!receipt_number) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      const likeStr = `WB-${dateStr}-%`;
      const countResult = (await tx.execute({ sql: 'SELECT COUNT(*) as count FROM payments WHERE receipt_number LIKE ?', args: [likeStr] })).rows[0];
      
      const seq = String(countResult.count + 1).padStart(4, '0');
      receipt_number = `WB-${dateStr}-${seq}`;
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
    logAudit(req.user.username, 'PAYMENT', `Recorded payment of PHP ${parsedAmount} for Bill ID ${billing_id} (Receipt: ${receipt_number})`);

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
  } catch (error) {
    if (typeof tx !== 'undefined') await tx.rollback();
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', requireSuperAdmin, async (req, res) => {
  const { name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter, currency } = req.body;
  try {
    await db.execute({ sql: 'UPDATE tenants SET name = ?, billing_type = ?, flat_rate = ?, minimum_cubic_meters = ?, minimum_charge = ?, rate_per_cubic_meter = ?, currency = ? WHERE id = (SELECT id FROM tenants LIMIT 1)', args: [name, billing_type, parseFloat(flat_rate), parseFloat(minimum_cubic_meters) || 0, parseFloat(minimum_charge) || 0, parseFloat(rate_per_cubic_meter), currency] });
    logAudit(req.user.username, 'SETTINGS', `Updated system settings`);
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- NEW Endpoints ---

app.post('/api/consumers/batch', requireAdmin, async (req, res) => {
  const { consumers } = req.body;
  
  if (!Array.isArray(consumers)) {
    return res.status(400).json({ error: 'Consumers must be an array' });
  }

  try {
    const tx = await db.transaction('write');
    let inserted = 0;
    let errors = [];
    for (const c of consumers) {
      try {
        const consumerPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : (c.purok || null);
        await tx.execute({ sql: 'INSERT INTO consumers (name, meter_number, address, contact_number, purok) VALUES (?, ?, ?, ?, ?)', args: [c.name, c.meter_number || null, c.address, c.contact_number, consumerPurok] });
        inserted++;
      } catch (err) {
        errors.push({ consumer: c, error: err.message });
      }
    }
    await tx.commit();
    const result = { inserted, errors };
    
    logAudit(req.user.username, 'CONSUMERS', `Batch uploaded ${result.inserted} consumers`);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Meter Reading Endpoints ---

app.get('/api/consumers/readings', async (req, res) => {
  const { month } = req.query; // YYYY-MM
  try {
    let consumers;
    if (req.user.role === 'STAFF' && req.user.assigned_purok) {
      consumers = (await db.execute({ sql: 'SELECT id, name, meter_number, address, purok FROM consumers WHERE purok = ? ORDER BY name', args: [req.user.assigned_purok] })).rows;
    } else {
      consumers = (await db.execute('SELECT id, name, meter_number, address, purok FROM consumers ORDER BY name')).rows;
    }
    
    const result = await Promise.all(consumers.map(async c => {
      // Get the most recent billing for this consumer to find the last reading
      const lastBill = (await db.execute({ sql: `
        SELECT current_reading, billing_month 
        FROM billings 
        WHERE consumer_id = ? 
        ORDER BY billing_month DESC, id DESC 
        LIMIT 1
      `, args: [c.id] })).rows[0];

      // Check if already billed for the requested month
      let already_billed = false;
      let billed_id = null;
      if (month) {
        const existing = (await db.execute({ sql: 'SELECT id FROM billings WHERE consumer_id = ? AND billing_month = ?', args: [c.id, month] })).rows[0];
        already_billed = !!existing;
        billed_id = existing ? existing.id : null;
      }

      return {
        id: c.id,
        name: c.name,
        meter_number: c.meter_number,
        address: c.address,
        last_reading: lastBill ? lastBill.current_reading : 0,
        last_billing_month: lastBill ? lastBill.billing_month : null,
        already_billed,
        billed_id
      };
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/billings/batch', async (req, res) => {
  const { billing_month, due_date, readings } = req.body;

  if (!billing_month) {
    return res.status(400).json({ error: 'billing_month is required' });
  }
  if (!Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'readings must be a non-empty array' });
  }

  try {
    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];

    const tx = await db.transaction('write');
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
    const result = { generated, total_amount, errors };
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/collection-summary', async (req, res) => {
  const { month, purok } = req.query; // YYYY-MM
  const staffPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : null;
  const effectivePurok = staffPurok || purok || null;

  try {
    let query = `
      SELECT b.*, c.name as consumer_name, c.purok,
             (SELECT SUM(amount_paid) FROM payments WHERE billing_id = b.id) as amount_paid
      FROM billings b
      JOIN consumers c ON b.consumer_id = c.id
      WHERE 1=1
    `;
    let params = [];
    
    if (month) {
      query += ` AND b.billing_month = ?`;
      params.push(month);
    }
    
    if (effectivePurok) {
      query += ` AND c.purok = ?`;
      params.push(effectivePurok);
    }
    
    const billsRaw = (await db.execute({ sql: query, args: params })).rows;
    let total_billed = 0;
    let total_collected = 0;
    
    const bills = billsRaw.map(b => {
      const paid = b.amount_paid || 0;
      total_billed += b.amount_due;
      total_collected += paid;
      return {
        consumer_name: b.consumer_name,
        amount_due: b.amount_due,
        status: b.status,
        amount_paid: paid
      };
    });

    const total_pending = total_billed - total_collected;
    const collection_rate = total_billed > 0 ? ((total_collected / total_billed) * 100).toFixed(2) + '%' : '0%';
    const consumer_count = bills.length;

    res.json({
      month: month || 'All Time',
      total_billed,
      total_collected,
      total_pending,
      collection_rate,
      consumer_count,
      bills
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/consumer-ledger', async (req, res) => {
  const { consumer_id } = req.query;
  if (!consumer_id) return res.status(400).json({ error: 'consumer_id required' });

  try {
    const consumer = (await db.execute({ sql: 'SELECT name, meter_number, address, purok FROM consumers WHERE id = ?', args: [consumer_id] })).rows[0];
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });
    
    if (req.user.role === 'STAFF' && req.user.assigned_purok && consumer.purok !== req.user.assigned_purok) {
      return res.status(403).json({ error: 'Access denied. Consumer is not in your assigned purok.' });
    }

    const ledgerRaw = (await db.execute({ sql: `
      SELECT b.billing_month, b.consumption, b.amount_due, b.status,
             (SELECT SUM(amount_paid) FROM payments WHERE billing_id = b.id) as amount_paid
      FROM billings b
      WHERE b.consumer_id = ?
      ORDER BY b.billing_month ASC
    `, args: [consumer_id] })).rows;

    const ledger = ledgerRaw.map(l => {
      const paid = l.amount_paid || 0;
      return {
        billing_month: l.billing_month,
        consumption: l.consumption,
        amount_due: l.amount_due,
        amount_paid: paid,
        balance: l.amount_due - paid,
        status: l.status
      };
    });

    res.json({ consumer, ledger });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/aging', async (req, res) => {
  try {
    const staffPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : null;
    let query = `
      SELECT c.id as consumer_id, c.name as consumer_name,
             SUM(b.amount_due - IFNULL((SELECT SUM(amount_paid) FROM payments WHERE billing_id = b.id), 0)) as total_unpaid,
             MIN(b.billing_month) as oldest_unpaid_month,
             COUNT(b.id) as months_overdue
      FROM billings b
      JOIN consumers c ON b.consumer_id = c.id
      WHERE b.status IN ('PENDING', 'PARTIAL')
    `;
    let args = [];
    if (staffPurok) {
      query += ` AND c.purok = ?`;
      args.push(staffPurok);
    }
    query += `
      GROUP BY c.id
      HAVING total_unpaid > 0
      ORDER BY total_unpaid DESC
    `;
    
    const agingRaw = (await db.execute({ sql: query, args })).rows;

    res.json({ aging: agingRaw });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const isStaff = req.user.role === 'STAFF' && req.user.assigned_purok;
    const purokFilter = isStaff ? req.user.assigned_purok : null;

    let total_consumers, total_billed, total_collected, recent_billings;

    if (purokFilter) {
      total_consumers = (await db.execute({ sql: 'SELECT COUNT(*) as count FROM consumers WHERE purok = ?', args: [purokFilter] })).rows[0].count;
      
      const billedStmt = (await db.execute({ sql: 'SELECT SUM(b.amount_due) as total FROM billings b JOIN consumers c ON b.consumer_id = c.id WHERE c.purok = ?', args: [purokFilter] })).rows[0];
      total_billed = billedStmt.total || 0;
      
      const collectedStmt = (await db.execute({ sql: 'SELECT SUM(p.amount_paid) as total FROM payments p JOIN billings b ON p.billing_id = b.id JOIN consumers c ON b.consumer_id = c.id WHERE c.purok = ?', args: [purokFilter] })).rows[0];
      total_collected = collectedStmt.total || 0;
      
      recent_billings = (await db.execute({ sql: `
        SELECT b.*, c.name as consumer_name
        FROM billings b
        JOIN consumers c ON b.consumer_id = c.id
        WHERE c.purok = ?
        ORDER BY b.created_at DESC
        LIMIT 10
      `, args: [purokFilter] })).rows;
    } else {
      total_consumers = (await db.execute('SELECT COUNT(*) as count FROM consumers')).rows[0].count;
      
      const billedStmt = (await db.execute('SELECT SUM(amount_due) as total FROM billings')).rows[0];
      total_billed = billedStmt.total || 0;
      
      const collectedStmt = (await db.execute('SELECT SUM(amount_paid) as total FROM payments')).rows[0];
      total_collected = collectedStmt.total || 0;
      
      recent_billings = (await db.execute(`
        SELECT b.*, c.name as consumer_name
        FROM billings b
        JOIN consumers c ON b.consumer_id = c.id
        ORDER BY b.created_at DESC
        LIMIT 10
      `)).rows;
    }

    const total_pending = total_billed - total_collected;
    const collection_rate = total_billed > 0 ? ((total_collected / total_billed) * 100).toFixed(2) + '%' : '0%';

    res.json({
      total_consumers,
      active_consumers: total_consumers,
      total_billed,
      total_collected,
      total_pending,
      collection_rate,
      recent_billings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Bill Notice Endpoint ---
app.get('/api/billings/:billing_id/notice', async (req, res) => {
  const { billing_id } = req.params;
  try {
    const bill = (await db.execute({ sql: `
      SELECT b.*, c.name as consumer_name, c.address as consumer_address, c.meter_number
      FROM billings b
      JOIN consumers c ON b.consumer_id = c.id
      WHERE b.id = ?
    `, args: [billing_id] })).rows[0];

    if (!bill) return res.status(404).json({ error: 'Billing not found' });

    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];

    res.json({
      billing_id: bill.id,
      consumer_id: bill.consumer_id,
      consumer_name: bill.consumer_name,
      consumer_address: bill.consumer_address,
      meter_number: bill.meter_number,
      billing_month: bill.billing_month,
      previous_reading: bill.previous_reading,
      current_reading: bill.current_reading,
      consumption: bill.consumption,
      amount_due: bill.amount_due,
      due_date: bill.due_date,
      status: bill.status,
      billing_type: tenant ? tenant.billing_type : 'METERED',
      tenant_name: tenant ? tenant.name : '',
      minimum_cubic_meters: tenant ? tenant.minimum_cubic_meters : 0,
      minimum_charge: tenant ? tenant.minimum_charge : 0,
      rate_per_cubic_meter: tenant ? tenant.rate_per_cubic_meter : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Receipt Endpoints ---
app.get('/api/payments/receipt/:payment_id', async (req, res) => {
  const { payment_id } = req.params;
  try {
    const payment = (await db.execute({ sql: `
      SELECT p.*, b.billing_month, b.previous_reading, b.current_reading, b.consumption, b.amount_due,
             c.name as consumer_name, c.address as consumer_address, c.meter_number
      FROM payments p
      JOIN billings b ON p.billing_id = b.id
      JOIN consumers c ON b.consumer_id = c.id
      WHERE p.id = ?
    `, args: [payment_id] })).rows[0];

    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const tenant = (await db.execute('SELECT name, billing_type FROM tenants LIMIT 1')).rows[0];

    const totalPaidStmt = (await db.execute({ sql: 'SELECT SUM(amount_paid) as total FROM payments WHERE billing_id = ?', args: [payment.billing_id] })).rows[0];
    const totalPaidForBill = totalPaidStmt.total || 0;
    const remainingBalance = Math.max(0, payment.amount_due - totalPaidForBill);

    let paymentType = 'PARTIAL';
    // If the amount paid on this receipt alone is equal to amount_due, or if the total payments equal amount_due,
    // we can determine full vs partial. The requirement says:
    // "payment_type (FULL/PARTIAL)"
    if (totalPaidForBill >= payment.amount_due) {
      paymentType = 'FULL';
    }

    res.json({
      receipt_number: payment.receipt_number,
      payment_date: payment.payment_date,
      consumer_name: payment.consumer_name,
      consumer_address: payment.consumer_address,
      meter_number: payment.meter_number,
      billing_month: payment.billing_month,
      previous_reading: payment.previous_reading,
      current_reading: payment.current_reading,
      consumption: payment.consumption,
      amount_due: payment.amount_due,
      amount_paid: payment.amount_paid,
      total_paid_for_bill: totalPaidForBill,
      remaining_balance: remainingBalance,
      payment_type: paymentType,
      billing_type: tenant ? tenant.billing_type : 'METERED',
      tenant_name: tenant ? tenant.name : ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/billings/:billing_id/payments', async (req, res) => {
  const { billing_id } = req.params;
  try {
    const billing = (await db.execute({ sql: 'SELECT * FROM billings WHERE id = ?', args: [billing_id] })).rows[0];
    if (!billing) return res.status(404).json({ error: 'Billing not found' });

    const payments = (await db.execute({ sql: 'SELECT id, amount_paid, payment_date, receipt_number FROM payments WHERE billing_id = ? ORDER BY payment_date DESC', args: [billing_id] })).rows;

    const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);
    const remainingBalance = Math.max(0, billing.amount_due - totalPaid);

    res.json({
      billing,
      payments,
      total_paid: totalPaid,
      remaining_balance: remainingBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Database Management Endpoints ---

app.get('/api/database/backup', requireSuperAdmin, async (req, res) => {
  try {
    const backupFileName = `water_billing_backup_${new Date().toISOString().split('T')[0]}.db`;
    const tempBackupPath = path.resolve(__dirname, `temp_${backupFileName}`);
    
    const dbPath = path.resolve(__dirname, 'water_billing.db');
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.startsWith('libsql://')) {
      return res.status(400).json({ error: 'Direct file backup is not supported for remote Turso databases. Please use the Turso dashboard.' });
    }
    fs.copyFileSync(dbPath, tempBackupPath);
    
    logAudit(req.user.username, 'DATABASE', 'Downloaded a database backup');

    res.download(tempBackupPath, backupFileName, (err) => {
      // Clean up the temporary backup file after download finishes or fails
      if (fs.existsSync(tempBackupPath)) {
        fs.unlinkSync(tempBackupPath);
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate backup: ' + error.message });
  }
});

app.post('/api/database/restore', requireSuperAdmin, upload.single('database'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No database file uploaded' });

  try {
    // Validate that the uploaded file is a real SQLite database
    const fd = fs.openSync(req.file.path, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    
    if (header.toString('utf8') !== 'SQLite format 3\000') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid database file. Please upload a valid .db backup file.' });
    }

    const dbPath = path.resolve(__dirname, 'water_billing.db');
    
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.startsWith('libsql://')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Direct file restore is not supported for remote Turso databases.' });
    }
    // Close existing connection
    db.close();

    // Overwrite the file
    fs.copyFileSync(req.file.path, dbPath);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    logAudit(req.user.username, 'DATABASE', 'Restored database from a backup file');

    res.json({ message: 'Database restored successfully. Server is restarting.' });
    
    setTimeout(() => {
      process.exit(0); // Force restart if using nodemon/pm2
    }, 500);

  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/database/reset', requireSuperAdmin, async (req, res) => {
  const { option } = req.body; // 'FULL' or 'KEEP_CONSUMERS'
  
  try {
    const tx = await db.transaction('write');
    
    await tx.execute('DELETE FROM payments');
    await tx.execute('DELETE FROM billings');
    await tx.execute("DELETE FROM sqlite_sequence WHERE name IN ('payments', 'billings')"); // Reset auto-increment
    
    if (option === 'FULL') {
      await tx.execute("DELETE FROM consumers");
      await tx.execute("DELETE FROM sqlite_sequence WHERE name = 'consumers'");
    }
    
    await tx.commit();
    logAudit(req.user.username, 'DATABASE', `Reset database records (Option: ${option})`);
    res.json({ message: 'Database reset successfully' });
  } catch (error) {
    await tx.rollback();
    res.status(500).json({ error: error.message });
  }
});

// --- Purok Summary Endpoint ---
app.get('/api/reports/purok-summary', async (req, res) => {
  const { month } = req.query;
  try {
    let sql = `
      SELECT 
        c.purok,
        COUNT(DISTINCT c.id) as total_consumers,
        COALESCE(SUM(b.amount_due), 0) as total_billed,
        COALESCE(SUM(CASE WHEN b.status = 'PAID' THEN b.amount_due ELSE 0 END), 0) as total_collected,
        COALESCE(SUM(CASE WHEN b.status != 'PAID' THEN b.amount_due ELSE 0 END), 0) as total_pending
      FROM consumers c
      LEFT JOIN billings b ON b.consumer_id = c.id
    `;
    const args = [];
    if (month) {
      sql += ` AND b.billing_month = ?`;
      args.push(month);
    }
    sql += ` WHERE c.purok IS NOT NULL AND c.purok != '' GROUP BY c.purok ORDER BY c.purok`;
    
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

// --- Audit Logs Endpoint ---
app.get('/api/audit-logs', requireSuperAdmin, async (req, res) => {
  try {
    const logs = (await db.execute('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500')).rows;
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Offline Reading Sheet ---
app.get('/api/readings/offline-sheet', async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

  try {
    let consumers;
    const staffPurok = (req.user.role === 'STAFF' && req.user.assigned_purok) ? req.user.assigned_purok : null;
    if (staffPurok) {
      consumers = (await db.execute({ sql: 'SELECT id, name, meter_number, address FROM consumers WHERE purok = ? ORDER BY name', args: [staffPurok] })).rows;
    } else {
      consumers = (await db.execute('SELECT id, name, meter_number, address FROM consumers ORDER BY name')).rows;
    }
    
    const consumersWithReadingsUnfiltered = await Promise.all(consumers.map(async c => {
      const lastBill = (await db.execute({ sql: `
        SELECT current_reading, billing_month 
        FROM billings 
        WHERE consumer_id = ? 
        ORDER BY billing_month DESC, id DESC 
        LIMIT 1
      `, args: [c.id] })).rows[0];

      const existing = (await db.execute({ sql: 'SELECT id FROM billings WHERE consumer_id = ? AND billing_month = ?', args: [c.id, month] })).rows[0];

      return {
        id: c.id,
        name: c.name,
        meter_number: c.meter_number,
        address: c.address || '',
        last_reading: lastBill ? lastBill.current_reading : 0,
        already_billed: !!existing
      };
    })).filter(c => !c.already_billed);

    const consumersWithReadings = await Promise.all(consumersWithReadingsUnfiltered.map(async c => {
      const qrSvg = await QRCode.toString('WBP-' + c.id, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#ffffff' } });
      return { ...c, qrSvg };
    }));

    const tenant = (await db.execute('SELECT * FROM tenants LIMIT 1')).rows[0];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Offline Meter Reading - ${month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 0; }
  .header { background: linear-gradient(135deg, #1e293b, #334155); padding: 1rem; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #475569; }
  .header h1 { font-size: 1.1rem; margin-bottom: 0.25rem; }
  .header .meta { font-size: 0.8rem; color: #94a3b8; }
  .stats-bar { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; background: #1e293b; border-bottom: 1px solid #334155; overflow-x: auto; }
  .stat { background: #334155; padding: 0.5rem 0.75rem; border-radius: 0.5rem; min-width: 80px; text-align: center; }
  .stat .label { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; }
  .stat .value { font-size: 1rem; font-weight: 700; color: #60a5fa; }
  .search-wrap { padding: 0.75rem 1rem; position: sticky; top: 62px; z-index: 9; background: #0f172a; }
  .search-wrap input { width: 100%; padding: 0.6rem 1rem; border-radius: 0.5rem; border: 1px solid #475569; background: #1e293b; color: #e2e8f0; font-size: 0.9rem; }
  .consumer-list { padding: 0 0.5rem 6rem; }
  .consumer-card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 0.75rem; margin-bottom: 0.5rem; transition: border-color 0.2s; }
  .consumer-card.has-reading { border-color: #10b981; background: rgba(16,185,129,0.05); }
  .consumer-card.invalid { border-color: #f43f5e; background: rgba(244,63,94,0.05); }
  .c-name { font-weight: 600; font-size: 0.95rem; }
  .c-details { font-size: 0.75rem; color: #94a3b8; margin-top: 0.15rem; }
  .reading-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
  .prev-reading { font-size: 0.8rem; color: #94a3b8; min-width: 80px; }
  .reading-input { flex: 1; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 1rem; font-family: monospace; }
  .reading-input:focus { outline: none; border-color: #60a5fa; }
  .consumption-badge { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem; background: rgba(16,185,129,0.15); color: #10b981; font-weight: 600; min-width: 60px; text-align: center; }
  .consumption-badge.invalid { background: rgba(244,63,94,0.15); color: #f43f5e; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1e293b; border-top: 1px solid #475569; padding: 0.75rem 1rem; display: flex; gap: 0.5rem; z-index: 10; }
  .btn { flex: 1; padding: 0.7rem; border: none; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-export { background: #10b981; color: #fff; }
  .btn-clear { background: #475569; color: #e2e8f0; }
  .btn:disabled { opacity: 0.4; }
  .saved-indicator { position: fixed; top: 4px; right: 8px; font-size: 0.65rem; color: #10b981; opacity: 0; transition: opacity 0.3s; z-index: 20; }
  .saved-indicator.show { opacity: 1; }
  
  @media print {
    body { background: white; color: black; margin: 0; padding: 0; }
    .header, .stats-bar, .search-wrap, .consumer-list, .bottom-bar, .saved-indicator { display: none !important; }
    #modalOverlay { position: absolute !important; background: transparent !important; display: block !important; padding: 0 !important; }
    .modal-content { background: white !important; box-shadow: none !important; border-radius: 0 !important; }
    .modal-header, .modal-footer { display: none !important; }
    .modal-body { background: white !important; padding: 0 !important; overflow: visible !important; }
    #receiptArea { width: 100% !important; margin: 0 !important; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>ðŸ“‹ Offline Meter Reading</h1>
  <div class="meta">${tenant.name || 'Water District'} â€¢ Billing Month: <strong>${month}</strong> â€¢ ${consumersWithReadings.length} consumers</div>
</div>

<div class="stats-bar">
  <div class="stat"><div class="label">Entered</div><div class="value" id="stat-entered">0</div></div>
  <div class="stat"><div class="label">Remaining</div><div class="value" id="stat-remaining">${consumersWithReadings.length}</div></div>
  <div class="stat"><div class="label">Total mÂ³</div><div class="value" id="stat-consumption">0</div></div>
</div>

<div class="search-wrap">
  <input type="text" id="searchInput" placeholder="Search consumer name or meter..." oninput="filterList()">
</div>

<div class="saved-indicator" id="savedIndicator">âœ“ Auto-saved</div>

<div class="consumer-list" id="consumerList"></div>

<div id="modalOverlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.9); z-index:50; flex-direction:column; align-items:center; justify-content:center; padding: 1rem;">
  <div class="modal-content" style="background:#1e293b; border-radius:0.75rem; width: 100%; max-width: 380px; max-height: 100%; display:flex; flex-direction:column; overflow:hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div class="modal-header" style="padding: 1rem; border-bottom: 1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
      <h2 style="font-size: 1.1rem; margin:0; font-weight: 600; color: white;">Water Bill Notice</h2>
      <button onclick="document.getElementById('modalOverlay').style.display='none'" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer; line-height: 1;">&times;</button>
    </div>
    <div class="modal-body" style="padding: 1.5rem; overflow-y:auto; background:#0f172a; display:flex; justify-content:center;">
      <div id="receiptArea"></div>
    </div>
    <div class="modal-footer" style="padding: 1rem; border-top: 1px solid #334155; display:flex; gap: 0.75rem; justify-content:flex-end; background: #1e293b;">
      <button onclick="document.getElementById('modalOverlay').style.display='none'" class="btn" style="background:transparent; border:1px solid #475569; color:#e2e8f0; padding: 0.6rem 1rem;">Close</button>
      <button onclick="window.print()" class="btn" style="background:#6366f1; color:white; padding: 0.6rem 1.2rem; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Print Bill
      </button>
    </div>
  </div>
</div>

<div class="bottom-bar">
  <button class="btn btn-clear" onclick="clearAll()">Clear All</button>
  <button class="btn btn-export" id="exportBtn" onclick="exportReadings()">Export Readings</button>
</div>

<script>
const STORAGE_KEY = 'offline_readings_${month}';
const CONSUMERS = ${JSON.stringify(consumersWithReadings)};
const TENANT = ${JSON.stringify(tenant)};
const BILLING_MONTH = '${month}';

let readings = {};

// Load saved readings from localStorage
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) readings = JSON.parse(saved);
} catch(e) {}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  const indicator = document.getElementById('savedIndicator');
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 1500);
}

function updateStats() {
  let entered = 0, totalConsumption = 0;
  for (const c of CONSUMERS) {
    const val = readings[c.id];
    if (val !== undefined && val !== '') {
      const curr = parseFloat(val);
      if (!isNaN(curr) && curr >= c.last_reading) {
        entered++;
        totalConsumption += (curr - c.last_reading);
      }
    }
  }
  document.getElementById('stat-entered').textContent = entered;
  document.getElementById('stat-remaining').textContent = CONSUMERS.length - entered;
  document.getElementById('stat-consumption').textContent = totalConsumption.toFixed(1);
  document.getElementById('exportBtn').disabled = entered === 0;
}

function handleInput(consumerId, value, lastReading) {
  readings[consumerId] = value;
  save();
  updateStats();

  const card = document.getElementById('card-' + consumerId);
  const badge = document.getElementById('badge-' + consumerId);
  const printBtn = document.getElementById('print-btn-' + consumerId);
  
  if (value === '') {
    card.className = 'consumer-card';
    badge.textContent = '';
    badge.className = 'consumption-badge';
    if(printBtn) printBtn.disabled = true;
    return;
  }

  const curr = parseFloat(value);
  if (isNaN(curr) || curr < lastReading) {
    card.className = 'consumer-card invalid';
    badge.textContent = 'Invalid';
    badge.className = 'consumption-badge invalid';
    if(printBtn) printBtn.disabled = true;
  } else {
    card.className = 'consumer-card has-reading';
    const consumption = curr - lastReading;
    badge.textContent = consumption.toFixed(1) + ' mÂ³';
    badge.className = 'consumption-badge';
    if(printBtn) printBtn.disabled = false;
  }
}

function printBill(id) {
  const c = CONSUMERS.find(x => x.id === id);
  const val = readings[id];
  if (val === undefined || val === '') { alert('Please enter a reading first.'); return; }
  const curr = parseFloat(val);
  if (isNaN(curr) || curr < c.last_reading) { alert('Invalid reading.'); return; }
  
  const consumption = curr - c.last_reading;
  let amountDue = 0;
  
  let breakdownHtml = '';
  if (TENANT.billing_type === 'METERED') {
    const minCubic = TENANT.minimum_cubic_meters || 10;
    const minCharge = TENANT.minimum_charge || 0;
    if (consumption <= minCubic) {
      amountDue = minCharge;
    } else {
      const excess = consumption - minCubic;
      amountDue = minCharge + (excess * TENANT.rate_per_cubic_meter);
    }
    
    breakdownHtml += \`
      <div style="display: flex; justify-content: space-between;">
        <span>Min. (\${minCubic} mÂ³):</span><span>â‚± \${minCharge.toFixed(2)}</span>
      </div>\`;
      
    if (consumption > minCubic) {
      const excess = consumption - minCubic;
      const excessCharge = excess * TENANT.rate_per_cubic_meter;
      breakdownHtml += \`
      <div style="display: flex; justify-content: space-between;">
        <span>Excess \${excess.toFixed(1)} mÂ³:</span><span>â‚± \${excessCharge.toFixed(2)}</span>
      </div>\`;
    }
    breakdownHtml += \`<div style="text-align: center; letter-spacing: -1px;">--------------------------------</div>\`;
  } else {
    amountDue = TENANT.flat_rate;
    breakdownHtml += \`
      <div style="display: flex; justify-content: space-between;">
        <span>Flat Rate:</span><span>â‚± \${amountDue.toFixed(2)}</span>
      </div>
      <div style="text-align: center; letter-spacing: -1px;">--------------------------------</div>\`;
  }

  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const [y, m] = BILLING_MONTH.split('-');
  const billingMonthStr = monthNames[parseInt(m)-1] + ' ' + y;

  const d = new Date();
  d.setDate(d.getDate() + 14);
  const dueDateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const receiptHtml = \`
    <div style="font-family: 'Courier New', Courier, monospace; width: 300px; color: black; background: white; padding: 16px; box-sizing: border-box; line-height: 1.2; margin: 0 auto; font-size: 0.95rem;">
      
      <!-- Header -->
      <div style="text-align: center; font-weight: bold;">\${(TENANT.name || 'WATER SYSTEM').toUpperCase()}</div>
      <div style="text-align: center;">WATER BILLING NOTICE</div>
      <div style="text-align: center; letter-spacing: -1px;">================================</div>
      
      <!-- Consumer Details -->
      <div style="font-weight: bold;">\${c.name}</div>
      <div>\${c.address || 'N/A'}</div>
      <div>Meter #: \${c.meter_number || 'N/A'}</div>
      <div style="text-align: center; letter-spacing: -1px;">================================</div>

      <!-- Billing Month -->
      <div style="text-align: center; font-weight: bold;">BILLING FOR \${billingMonthStr}</div>
      <div style="text-align: center; letter-spacing: -1px;">--------------------------------</div>
      
      <!-- Readings -->
      <div style="display: flex; justify-content: space-between;">
        <span>Previous Reading:</span><span>\${c.last_reading.toFixed(1)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Current Reading:</span><span>\${curr.toFixed(1)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-weight: bold;">
        <span>Consumption:</span><span>\${consumption.toFixed(1)} mÂ³</span>
      </div>
      <div style="text-align: center; letter-spacing: -1px;">--------------------------------</div>
      
      <!-- Breakdown -->
      \${breakdownHtml}
      
      <!-- Amount Due -->
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1rem;">
        <span>AMOUNT DUE:</span><span>â‚± \${amountDue.toFixed(2)}</span>
      </div>
      <div style="text-align: center; letter-spacing: -1px;">================================</div>
      
      <!-- Due Date -->
      <div style="display: flex; justify-content: space-between; font-weight: bold;">
        <span>DUE DATE:</span><span>\${dueDateStr}</span>
      </div>
      <div style="text-align: center; letter-spacing: -1px;">--------------------------------</div>
      
      <!-- QR Code -->
      <div style="text-align: center; margin-top: 8px;">
        <div style="width: 120px; height: 120px; margin: 0 auto;">
          \${c.qrSvg}
        </div>
        <div style="font-size: 0.8rem; margin-top: 4px;">Scan to pay</div>
      </div>
      <div style="text-align: center; letter-spacing: -1px; margin-top: 8px;">================================</div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 8px;">
        <div>Please pay on or before</div>
        <div style="font-weight: bold;">\${dueDateStr}</div>
        <div>Thank you!</div>
      </div>
    </div>
  \`;
  
  document.getElementById('receiptArea').innerHTML = receiptHtml;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function renderList(list) {
  const container = document.getElementById('consumerList');
  container.innerHTML = '';
  for (const c of list) {
    const val = readings[c.id] || '';
    const curr = parseFloat(val);
    let cardClass = 'consumer-card';
    let badgeText = '';
    let badgeClass = 'consumption-badge';
    
    if (val !== '') {
      if (isNaN(curr) || curr < c.last_reading) {
        cardClass = 'consumer-card invalid';
        badgeText = 'Invalid';
        badgeClass = 'consumption-badge invalid';
      } else {
        cardClass = 'consumer-card has-reading';
        badgeText = (curr - c.last_reading).toFixed(1) + ' mÂ³';
      }
    }

    container.innerHTML += 
      '<div class="' + cardClass + '" id="card-' + c.id + '">' +
        '<div class="c-name">' + c.name + '</div>' +
        '<div class="c-details">Meter: ' + (c.meter_number || 'N/A') + (c.address ? ' â€¢ ' + c.address : '') + '</div>' +
        '<div class="reading-row">' +
          '<div class="prev-reading">Prev: <strong>' + c.last_reading + '</strong></div>' +
          '<input type="number" step="0.01" id="input-' + c.id + '" class="reading-input" placeholder="Current reading" value="' + val + '" ' +
            'oninput="handleInput(' + c.id + ', this.value, ' + c.last_reading + ')" inputmode="decimal">' +
          '<div class="' + badgeClass + '" id="badge-' + c.id + '">' + badgeText + '</div>' +
          '<button id="print-btn-' + c.id + '" class="btn" style="padding: 0.3rem 0.5rem; margin-left: 0.25rem; font-size: 1rem; background: #3b82f6; color: white;" onclick="printBill(' + c.id + ')" ' + (val === '' || isNaN(curr) || curr < c.last_reading ? 'disabled' : '') + '>ðŸ–¨ï¸</button>' +
        '</div>' +
      '</div>';
  }
}

function filterList() {
  const term = document.getElementById('searchInput').value.toLowerCase();
  if (!term) { renderList(CONSUMERS); return; }
  
  if (term.startsWith('wbp-')) {
    const idStr = term.replace('wbp-', '');
    const filtered = CONSUMERS.filter(c => String(c.id) === idStr);
    renderList(filtered);
    if (filtered.length === 1) {
      setTimeout(() => {
        const input = document.getElementById('input-' + filtered[0].id);
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    }
    return;
  }

  const filtered = CONSUMERS.filter(c => 
    c.name.toLowerCase().includes(term) || 
    (c.meter_number && c.meter_number.toLowerCase().includes(term))
  );
  renderList(filtered);
}

function clearAll() {
  if (!confirm('Clear all readings? This cannot be undone.')) return;
  readings = {};
  save();
  renderList(CONSUMERS);
  updateStats();
}

function exportReadings() {
  const data = [];
  for (const c of CONSUMERS) {
    const val = readings[c.id];
    if (val !== undefined && val !== '') {
      const curr = parseFloat(val);
      if (!isNaN(curr) && curr >= c.last_reading) {
        data.push({
          consumer_id: c.id,
          consumer_name: c.name,
          previous_reading: c.last_reading,
          current_reading: curr
        });
      }
    }
  }

  if (data.length === 0) { alert('No valid readings to export.'); return; }

  const exportObj = {
    billing_month: BILLING_MONTH,
    exported_at: new Date().toISOString(),
    readings: data
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'readings_' + BILLING_MONTH + '.json';
  a.click();
  URL.revokeObjectURL(url);
  
  alert('Exported ' + data.length + ' readings!\\nFile: readings_' + BILLING_MONTH + '.json\\n\\nBring this file back to the office and import it into the system.');
}

// Initial render
renderList(CONSUMERS);
updateStats();
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="reading_sheet_${month}.html"`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Import Offline Readings ---
app.post('/api/readings/import', async (req, res) => {
  const { billing_month, readings } = req.body;
  
  if (!billing_month) return res.status(400).json({ error: 'billing_month is required' });
  if (!Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'readings must be a non-empty array' });
  }

  try {
    // Return the readings in the format the frontend expects (to populate the reading inputs)
    const result = readings.map(r => ({
      consumer_id: r.consumer_id,
      current_reading: r.current_reading
    }));

    logAudit(req.user.username, 'METER_READING', `Imported ${readings.length} offline readings for ${billing_month}`);
    res.json({ imported: result.length, readings: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static frontend files in production
const frontendPath = path.join(__dirname, '../dist');
app.use(express.static(frontendPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
