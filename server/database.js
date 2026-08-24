const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'water_billing.db');
const db = new Database(dbPath, { verbose: console.log });

// Create Tables
const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      billing_type TEXT NOT NULL DEFAULT 'METERED', -- METERED or FLAT
      flat_rate REAL,
      minimum_cubic_meters REAL DEFAULT 10,
      minimum_charge REAL DEFAULT 150,
      rate_per_cubic_meter REAL,
      currency TEXT DEFAULT 'PHP'
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'ADMIN', -- ADMIN or SUPER_ADMIN
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meter_number TEXT UNIQUE,
      address TEXT,
      contact_number TEXT,
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
  const tenant = db.prepare('SELECT * FROM tenants LIMIT 1').get();
  if (!tenant) {
    db.prepare(`
      INSERT INTO tenants (name, billing_type, flat_rate, minimum_cubic_meters, minimum_charge, rate_per_cubic_meter, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('Default Water System', 'METERED', 0, 10, 150, 25.00, 'PHP');
  }

  // Insert default user if not exists
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('password123', salt);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'SUPER_ADMIN');
  }
};

initDb();

// Migrate: add new columns if they don't exist (for existing databases)
try {
  db.prepare("SELECT minimum_cubic_meters FROM tenants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE tenants ADD COLUMN minimum_cubic_meters REAL DEFAULT 10");
  db.exec("ALTER TABLE tenants ADD COLUMN minimum_charge REAL DEFAULT 150");
  db.prepare("UPDATE tenants SET minimum_cubic_meters = 10, minimum_charge = 150").run();
}

try {
  db.prepare("SELECT role FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'ADMIN'");
  db.prepare("UPDATE users SET role = 'SUPER_ADMIN' WHERE username = 'admin'").run();
}

module.exports = db;
