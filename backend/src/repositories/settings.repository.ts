import { appPool } from '../config/database.js';

export class SettingsRepository {
  /**
   * Ambil nilai setting berdasarkan key
   */
  async get(key: string): Promise<string | null> {
    const [rows] = await appPool.query<import('mysql2').RowDataPacket[]>(
      'SELECT `value` FROM system_settings WHERE `key` = ?',
      [key]
    );
    return rows.length > 0 ? String(rows[0].value) : null;
  }

  /**
   * Simpan/upsert nilai setting
   */
  async set(key: string, value: string): Promise<void> {
    await appPool.query(
      'INSERT INTO system_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, value]
    );
  }
}
