import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const database = process.env.DB_NAME || 'foodorder_test';
if (!/^foodorder_test$/.test(database)) {
  throw new Error('setup-test-db hanya boleh memakai DB_NAME=foodorder_test');
}

async function executeMigration(connection: mysql.Connection, sql: string): Promise<void> {
  // Hak akses test database sudah diberikan saat bootstrap root.
  // Migrator tidak memiliki GRANT OPTION dan tidak perlu mengulang GRANT.
  const normalized = sql
    .replaceAll('foodorder', database)
    .split('\n')
    .filter((line) => !line.trim().toUpperCase().startsWith('GRANT '))
    .join('\n');

  if (!normalized.includes('DELIMITER')) {
    await connection.query(normalized);
    return;
  }

  const delimiterRegex = /DELIMITER\s+(\S+)([\s\S]*?)DELIMITER\s*;/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = delimiterRegex.exec(normalized)) !== null) {
    const before = normalized.substring(lastIndex, match.index).trim();
    if (before) blocks.push(before);
    blocks.push(
      ...match[2]
        .split(match[1])
        .map((part) => part.trim())
        .filter(Boolean)
    );
    lastIndex = delimiterRegex.lastIndex;
  }

  const remaining = normalized.substring(lastIndex).trim();
  if (remaining) blocks.push(remaining);

  for (const block of blocks) {
    await connection.query(block);
  }
}

async function main(): Promise<void> {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_MIGRATOR_USER || 'migrator',
    password: process.env.DB_MIGRATOR_PASSWORD,
  };

  if (!config.password) throw new Error('DB_MIGRATOR_PASSWORD wajib diisi');

  const server = await mysql.createConnection(config);
  try {
    await server.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code !== 'ER_DB_CREATE_EXISTS') throw error;
  }
  await server.end();

  const connection = await mysql.createConnection({ ...config, database, multipleStatements: true });
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    const [views] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?",
      [database]
    );
    for (const view of views) {
      await connection.query(`DROP VIEW IF EXISTS \`${view.TABLE_NAME}\``);
    }
    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [database]
    );
    for (const table of tables) {
      await connection.query(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.query(`
      CREATE TABLE _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB;
    `);

    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      await executeMigration(connection, fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      await connection.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('[TEST_DB_SETUP_FAILED]', error);
  process.exit(1);
});
