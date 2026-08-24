const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Replace backup endpoint
code = code.replace(
  "await db.backup(tempBackupPath);",
  `const dbPath = path.resolve(__dirname, 'water_billing.db');
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.startsWith('libsql://')) {
      return res.status(400).json({ error: 'Direct file backup is not supported for remote Turso databases. Please use the Turso dashboard.' });
    }
    fs.copyFileSync(dbPath, tempBackupPath);`
);

// Add check to restore endpoint
code = code.replace(
  "// Close existing connection",
  `if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.startsWith('libsql://')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Direct file restore is not supported for remote Turso databases.' });
    }
    // Close existing connection`
);

fs.writeFileSync('server.js', code);
console.log('done backup fix');
