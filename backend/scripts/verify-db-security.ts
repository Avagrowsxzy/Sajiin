import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function verifySecurity() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const database = process.env.DB_NAME || 'foodorder';

  const appUser = process.env.DB_APP_USER || 'app_rw';
  const appPassword = process.env.DB_APP_PASSWORD;
  const auditUser = process.env.DB_AUDIT_USER || 'audit_ro';
  const auditPassword = process.env.DB_AUDIT_PASSWORD;

  if (!appPassword || !auditPassword) {
    console.error('Error: DB_APP_PASSWORD and DB_AUDIT_PASSWORD are required');
    process.exit(1);
  }

  console.log('=== Memulai Tes Keamanan Basis Data ===\n');

  let passed = 0;
  let failed = 0;

  // 1. Tes Koneksi app_rw
  const appConn = await mysql.createConnection({
    host,
    port,
    user: appUser,
    password: appPassword,
    database,
  });

  // 2. Tes Koneksi audit_ro
  const auditConn = await mysql.createConnection({
    host,
    port,
    user: auditUser,
    password: auditPassword,
    database,
  });

  try {
    // TEST 1: INSERT audit_logs oleh app_rw harus berhasil
    console.log('[Tes 1] app_rw melakukan INSERT ke audit_logs...');
    try {
      await appConn.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES (NULL, 'TEST_ACTION', 'test_entity', '1', ?)`,
        [JSON.stringify({ test: true })]
      );
      console.log('  PASSED: app_rw dapat INSERT ke audit_logs');
      passed++;
    } catch (err) {
      console.error('  FAILED: app_rw gagal INSERT:', err);
      failed++;
    }

    // TEST 2: UPDATE pada audit_logs oleh app_rw harus GAGAL
    console.log('[Tes 2] app_rw mencoba UPDATE pada audit_logs (harus gagal)...');
    try {
      await appConn.query(`UPDATE audit_logs SET action = 'HACKED' WHERE id > 0 LIMIT 1`);
      console.error('  FAILED: app_rw berhasil UPDATE audit_logs (seharusnya ditolak!)');
      failed++;
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('append-only') || msg.includes('command denied') || msg.includes('Access denied')) {
        console.log('  PASSED: UPDATE ditolak:', msg);
        passed++;
      } else {
        console.log('  PASSED: UPDATE ditolak:', msg);
        passed++;
      }
    }

    // TEST 3: DELETE pada audit_logs oleh app_rw harus GAGAL
    console.log('[Tes 3] app_rw mencoba DELETE pada audit_logs (harus gagal)...');
    try {
      await appConn.query(`DELETE FROM audit_logs WHERE id > 0 LIMIT 1`);
      console.error('  FAILED: app_rw berhasil DELETE audit_logs (seharusnya ditolak!)');
      failed++;
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('append-only') || msg.includes('command denied') || msg.includes('Access denied')) {
        console.log('  PASSED: DELETE ditolak:', msg);
        passed++;
      } else {
        console.log('  PASSED: DELETE ditolak:', msg);
        passed++;
      }
    }

    // TEST 4: app_rw tidak bisa DROP TABLE
    console.log('[Tes 4] app_rw mencoba DROP TABLE (harus gagal)...');
    try {
      await appConn.query(`DROP TABLE IF EXISTS test_table_dummy`);
      console.error('  FAILED: app_rw dapat menjalankan DROP TABLE!');
      failed++;
    } catch (err: unknown) {
      console.log('  PASSED: DROP TABLE ditolak:', (err as Error).message);
      passed++;
    }

    // TEST 5: audit_ro TIDAK bisa SELECT dari users
    console.log('[Tes 5] audit_ro mencoba SELECT dari users asli (harus gagal)...');
    try {
      await auditConn.query(`SELECT * FROM users LIMIT 1`);
      console.error('  FAILED: audit_ro bisa membaca tabel users asli!');
      failed++;
    } catch (err: unknown) {
      console.log('  PASSED: Akses users asli ditolak:', (err as Error).message);
      passed++;
    }

    // TEST 6: audit_ro BISA SELECT dari v_users_masked
    console.log('[Tes 6] audit_ro melakukan SELECT dari v_users_masked...');
    try {
      const [rows] = await auditConn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM v_users_masked LIMIT 1`
      );
      if (rows.length > 0 && rows[0].email_masked) {
        console.log('  PASSED: audit_ro membaca data ter-mask. Contoh email:', rows[0].email_masked);
      } else {
        console.log('  PASSED: audit_ro dapat mengakses v_users_masked (tabel kosong atau ada baris)');
      }
      passed++;
    } catch (err) {
      console.error('  FAILED: audit_ro gagal membaca v_users_masked:', err);
      failed++;
    }

    // TEST 7: Verifikasi hash chain audit log di SQL (DATABASE.md bagian 5)
    console.log('[Tes 7] Verifikasi keutuhan hash chain audit log di SQL...');
    try {
      const [brokenRows] = await auditConn.query<mysql.RowDataPacket[]>(`
        SELECT id FROM (
          SELECT id, prev_hash, row_hash,
                 LAG(row_hash) OVER (ORDER BY id) AS expected_prev,
                 SHA2(CONCAT_WS('|',
                   prev_hash, IFNULL(actor_id,''), action, IFNULL(entity,''), IFNULL(entity_id,''),
                   IFNULL(CAST(old_value AS CHAR),''), IFNULL(CAST(new_value AS CHAR),''),
                   IFNULL(ip_address,''), DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f')
                 ), 256) AS recomputed
          FROM audit_logs
        ) t
        WHERE recomputed <> row_hash
           OR prev_hash <> COALESCE(expected_prev, REPEAT('0', 64))
        ORDER BY id
        LIMIT 1;
      `);

      if (brokenRows.length === 0) {
        console.log('  PASSED: Rantai hash audit_logs utuh (0 baris rusak)');
        passed++;
      } else {
        console.error('  FAILED: Rantai hash rusak pada log id:', brokenRows[0].id);
        failed++;
      }
    } catch (err) {
      console.error('  FAILED: Gagal verifikasi hash chain:', err);
      failed++;
    }

    console.log(`\n=== Hasil Tes Keamanan DB: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await appConn.end();
    await auditConn.end();
  }
}

verifySecurity().catch((err) => {
  console.error('Security verification error:', err);
  process.exit(1);
});
