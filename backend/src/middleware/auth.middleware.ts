import { Request, Response, NextFunction } from 'express';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { RequestContext, ROLE_NAMES, RoleId } from '../types/index.js';
import { appPool } from '../config/database.js';
import { writeAudit } from '../services/audit.service.js';
import { verifyToken } from '../utils/crypto.js';

/* eslint-disable @typescript-eslint/no-namespace */
// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: RequestContext & { username: string };
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export type PermissionKey =
  | 'menu:read'
  | 'menu:write'
  | 'category:write'
  | 'cart:manage:own'
  | 'order:create'
  | 'order:read:own'
  | 'order:read:all'
  | 'order:cancel:own'
  | 'order:update_status'
  | 'payment:create:own'
  | 'payment:read:own'
  | 'payment:read:all'
  | 'payment:refund'
  | 'profile:manage:own'
  | 'user:read:all'
  | 'user:read:masked'
  | 'user:manage'
  | 'role:assign'
  | 'notification:manage:own'
  | 'audit:read'
  | 'system:config';

// Matriks Permission sesuai RBAC.md bagian 2
const ROLE_PERMISSIONS: Record<'user' | 'admin' | 'kasir', Set<PermissionKey>> = {
  user: new Set<PermissionKey>([
    'menu:read',
    'cart:manage:own',
    'order:create',
    'order:read:own',
    'order:cancel:own',
    'payment:create:own',
    'payment:read:own',
    'profile:manage:own',
    'notification:manage:own',
  ]),
  admin: new Set<PermissionKey>([
    'menu:read',
    'menu:write',
    'category:write',
    'order:read:all',
    'order:update_status',
    'payment:read:all',
    'payment:refund',
    'profile:manage:own',
    'user:read:all',
    'user:manage',
    'role:assign',
    'system:config',
    'notification:manage:own',
    'audit:read',
  ]),
  kasir: new Set<PermissionKey>([
    'order:read:all',
    'order:update_status',
    'payment:read:all',
    'payment:refund',
    'notification:manage:own',
    'profile:manage:own',
    'user:manage',
  ]),
};

export interface TokenPayload {
  userId: string;
  role: 'user' | 'admin' | 'kasir';
  username: string;
  type?: 'access' | 'mfa';
}

/**
 * Middleware untuk memverifikasi access token JWT
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Token otentikasi tidak disediakan' },
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const decoded = verifyToken<TokenPayload>(token, env.JWT_SECRET);

    if (decoded.type && decoded.type !== 'access') {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Jenis token tidak valid' },
      });
      return;
    }

    // Verifikasi user masih aktif dan belum terkunci di database
    const [rows] = await appPool.query<mysql.RowDataPacket[]>(
      'SELECT is_active, role_id, locked_until FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Akun tidak aktif atau tidak ditemukan' },
      });
      return;
    }

    const userRow = rows[0];
    if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Akun terkunci sementara' },
      });
      return;
    }

    const currentRole = ROLE_NAMES[userRow.role_id as RoleId] as 'user' | 'admin' | 'kasir' | undefined;
    if (!currentRole) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Akun tidak aktif atau tidak ditemukan' },
      });
      return;
    }

    req.user = {
      userId: decoded.userId,
      role: currentRole,
      username: decoded.username,
    };

    next();
  } catch (err: unknown) {
    if ((err as Error).name === 'TokenExpiredError') {
      res.status(401).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Token telah kedaluwarsa' },
      });
      return;
    }
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Token tidak valid' },
    });
  }
}

/**
 * Middleware untuk otorisasi berdasarkan permission key (RBAC.md)
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
      });
      return;
    }

    const allowed = ROLE_PERMISSIONS[req.user.role]?.has(permission);

    if (!allowed) {
      // Catat ACCESS_DENIED ke audit log
      writeAudit({
        actorId: req.user.userId,
        action: 'ACCESS_DENIED',
        entity: (req.baseUrl + req.path).slice(0, 50),
        new_value: { required_permission: permission, current_role: req.user.role },
        ipAddress: req.ip,
      }).catch((logErr) => console.error('Failed to log ACCESS_DENIED:', logErr));

      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Akses ditolak' },
      });
      return;
    }

    next();
  };
}
