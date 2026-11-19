import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';

export interface AuditLogInput {
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

// Field-field sensitif yang wajib dibuang dari audit log (SECURITY.md & DATABASE.md)
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'old_password',
  'new_password',
  'token',
  'token_hash',
  'mfa_secret',
  'security_pin_hash',
  'security_answers',
  'security_answers_hash',
  'pin',
  'secret',
  'key',
  'authorization',
]);

function sanitizeJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJson);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeJson(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Menulis catatan ke audit_logs (append-only).
 * Dapat menerima connection (dalam transaksi yang sama) atau menggunakan default appPool.
 * CATATAN PENTING: Panggil fungsi ini sebagai LANGKAH TERAKHIR dalam transaksi!
 */
export async function writeAudit(
  input: AuditLogInput,
  executor: mysql.Connection | mysql.Pool = appPool
): Promise<void> {
  const sanitizedOld = input.old_value ? JSON.stringify(sanitizeJson(input.old_value)) : null;
  const sanitizedNew = input.new_value ? JSON.stringify(sanitizeJson(input.new_value)) : null;

  await executor.query(
    `INSERT INTO audit_logs (actor_id, action, entity, entity_id, old_value, new_value, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actorId ?? null,
      input.action,
      input.entity ?? null,
      input.entity_id ?? null,
      sanitizedOld,
      sanitizedNew,
      input.ipAddress ?? null,
    ]
  );
}
