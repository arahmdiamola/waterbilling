const { createClient } = require('@libsql/client');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:water_billing.db',
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Create Tables
const initDb = async () => {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      billing_type TEXT NOT NULL DEFAULT 'METERED', -- METERED or FLAT
      flat_rate REAL,
      minimum_cubic_meters REAL DEFAULT 10,
      minimum_charge REAL DEFAULT 150,
      rate_per_cubic_meter REAL,
      currency TEXT DEFAULT 'PHP',
      disconnect_months INTEGER DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'ADMIN', -- ADMIN, SUPER_ADMIN, or STAFF
      assigned_purok TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meter_number TEXT UNIQUE,
      address TEXT,
      contact_number TEXT,
      purok TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS billings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL,
      billing_month TEXT NOT NULL, -- YYYY-MM format
      previous_reading REAL,
      current_reading REAL,
      consumption REAL,
      amount_due REAL NOT NULL,
      status TEXT DEFAULT 'PENDING', -- PENDING, PAID, PARTIAL
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (consumer_id) REFERENCES consumers (id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_id INTEGER NOT NULL,
      amount_paid REAL NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT,
      receipt_number TEXT,
      FOREIGN KEY (billing_id) REFERENCES billings (id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default tenant if not exists
  const tenantRes = await db.execute('SELECT * FROM tenants LIMIT 1');
  if (tenantRes.rows.length === 0) {
    await db.execute({
      sql: 'INSERT INTO tenants (name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter, currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: ['Default Water System', 'METERED', 0, 10, 150, 25.00, 'PHP']
    });
  }

  // Insert default user if not exists
  const userRes = await db.execute('SELECT * FROM users LIMIT 1');
  if (userRes.rows.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('password123', salt);
    await db.execute({
      sql: 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      args: ['admin', hash, 'SUPER_ADMIN']
    });
  }

  // Migrate: add new columns if they don't exist (for existing databases)
  try {
    await db.execute("SELECT minimum_cubic_meters FROM tenants LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE tenants ADD COLUMN minimum_cubic_meters REAL DEFAULT 10");
    await db.execute("ALTER TABLE tenants ADD COLUMN minimum_charge REAL DEFAULT 150");
    await db.execute("UPDATE tenants SET minimum_cubic_meters = 10, minimum_charge = 150");
  }

  try {
    await db.execute("SELECT role FROM users LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'ADMIN'");
    await db.execute("UPDATE users SET role = 'SUPER_ADMIN' WHERE username = 'admin'");
  }

  // Migrate: add purok column to consumers
  try {
    await db.execute("SELECT purok FROM consumers LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE consumers ADD COLUMN purok TEXT");
  }

  // Migrate: add assigned_purok column to users
  try {
    await db.execute("SELECT assigned_purok FROM users LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE users ADD COLUMN assigned_purok TEXT");
  }

  // Migrate: add disconnect_months to tenants
  try {
    await db.execute("SELECT disconnect_months FROM tenants LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE tenants ADD COLUMN disconnect_months INTEGER DEFAULT 3");
    await db.execute("UPDATE tenants SET disconnect_months = 3");
  }

  // Migrate: add status column to consumers
  try {
    await db.execute("SELECT status FROM consumers LIMIT 1");
  } catch (e) {
    await db.execute("ALTER TABLE consumers ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
    await db.execute("UPDATE consumers SET status = 'ACTIVE'");
  }
};

initDb().catch(console.error);

module.exports = db;
