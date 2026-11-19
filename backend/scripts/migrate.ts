import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function runMigrations() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_MIGRATOR_USER || 'migrator';
  const password = process.env.DB_MIGRATOR_PASSWORD;
  const database = process.env.DB_NAME || 'foodorder';

  if (!password) {
    console.error('Error: DB_MIGRATOR_PASSWORD is not set in environment or .env');
    process.exit(1);
  }

  console.log(`Connecting to ${database} as ${user}@${host}:${port}...`);

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  try {
    // 1. Pastikan tabel _migrations ada
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB;
    `);

    // 2. Ambil migrasi yang sudah pernah diaplikasikan
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT filename FROM _migrations ORDER BY id ASC'
    );
    const appliedSet = new Set(rows.map((r) => r.filename));

    // 3. Baca file migrasi dari db/migrations/
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[SKIP] ${file} (already applied)`);
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      let sql = fs.readFileSync(filePath, 'utf-8');

      // Bersihkan DELIMITER jika ada untuk eksekusi via mysql2
      if (sql.includes('DELIMITER')) {
        // Parse triggers manually or strip DELIMITER
        // DELIMITER $$ ... END$$ DELIMITER ;
        const delimiterRegex = /DELIMITER\s+(\S+)([\s\S]*?)DELIMITER\s*;/gi;
        let match;
        const blocks: string[] = [];
        let lastIndex = 0;

        while ((match = delimiterRegex.exec(sql)) !== null) {
          const before = sql.substring(lastIndex, match.index).trim();
          if (before) blocks.push(before);

          const customDelim = match[1]; // e.g. $$
          const body = match[2];
          // split by custom delimiter
          const parts = body
            .split(customDelim)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
          blocks.push(...parts);

          lastIndex = delimiterRegex.lastIndex;
        }

        const remaining = sql.substring(lastIndex).trim();
        if (remaining) blocks.push(remaining);

        for (const block of blocks) {
          if (block) {
            await connection.query(block);
          }
        }
      } else {
        await connection.query(sql);
      }

      // Catat di _migrations
      await connection.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
      console.log(`[APPLIED] ${file}`);
    }

    console.log('All migrations completed successfully.');
  } finally {
    await connection.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
