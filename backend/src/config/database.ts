import mysql from 'mysql2/promise';
import fs from 'node:fs';
import { env } from './env.js';

// Pool utama untuk aplikasi (akun app_rw)
export const appPool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_APP_USER,
  password: env.DB_APP_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // MariaDB/system memakai WIB; gunakan timezone lokal agar timestamp tidak dikonversi dua kali.
  timezone: 'local',
  charset: 'utf8mb4',
  // Enforce prepared statements
  namedPlaceholders: false,
  // Enkripsi koneksi database (SSL/TLS): aktif bila DB_SSL=true & DB_SSL_CA diisi
  ...(env.DB_SSL && env.DB_SSL_CA
    ? { ssl: { ca: fs.readFileSync(env.DB_SSL_CA) } }
    : {}),
});

export async function testConnection(): Promise<void> {
  const conn = await appPool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
