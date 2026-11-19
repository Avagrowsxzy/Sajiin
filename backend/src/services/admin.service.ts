import { appPool } from '../config/database.js';
import { AdminRepository } from '../repositories/admin.repository.js';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import { RequestContext, PaginationParams, ROLES } from '../types/index.js';
import { writeAudit } from './audit.service.js';

const adminRepo = new AdminRepository();
const refreshTokenRepo = new RefreshTokenRepository();

export class AdminService {
  /**
   * Ambil semua user (untuk admin)
   */
  async getAllUsers(pagination: PaginationParams, includeInactive = false) {
    return adminRepo.getAllUsers(pagination, includeInactive);
  }

  /**
   * Update status user (aktif/nonaktif, unlock)
   */
  async updateUserStatus(
    ctx: RequestContext,
    targetUserId: string,
    data: { is_active?: boolean; unlock?: boolean },
    ipAddress?: string
  ) {
    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      // Ambil data user target
      const isTargetAdmin = await adminRepo.isUserAdmin(targetUserId, conn);

      // Jika mencoba menonaktifkan admin
      if (data.is_active === false && isTargetAdmin) {
        const activeAdminCount = await adminRepo.countActiveAdmins(conn);

        // Cek apakah ini admin terakhir
        if (activeAdminCount <= 1) {
          throw new Error('Tidak dapat menonaktifkan admin terakhir');
        }

        // Cek apakah admin mencoba menonaktifkan dirinya sendiri
        if (ctx.userId === targetUserId) {
          throw new Error('Tidak dapat menonaktifkan akun sendiri');
        }
      }

      const updateData: { is_active?: boolean; locked_until?: Date | null } = {};

      if (data.is_active !== undefined) {
        updateData.is_active = data.is_active;
      }

      if (data.unlock === true) {
        updateData.locked_until = null;
      }

      await adminRepo.updateUserStatus(targetUserId, updateData, conn);

      // Tulis audit log
      await writeAudit(
        {
          actorId: ctx.userId,
          action: 'USER_STATUS_CHANGE',
          entity: 'users',
          entity_id: targetUserId,
          new_value: updateData,
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Update role user dan cabut semua refresh token
   */
  async updateUserRole(
    ctx: RequestContext,
    targetUserId: string,
    newRoleId: number,
    ipAddress?: string
  ) {
    // Validasi role ID
    const validRoles = [ROLES.ADMIN, ROLES.USER, ROLES.KASIR];
    if (!validRoles.includes(newRoleId as typeof validRoles[number])) {
      throw new Error('Role tidak valid');
    }

    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      // Ambil data user target
      const isTargetAdmin = await adminRepo.isUserAdmin(targetUserId, conn);

      // Jika mencoba menurunkan role admin
      if (isTargetAdmin && newRoleId !== ROLES.ADMIN) {
        const activeAdminCount = await adminRepo.countActiveAdmins(conn);

        // Cek apakah ini admin terakhir
        if (activeAdminCount <= 1) {
          throw new Error('Tidak dapat menurunkan role admin terakhir');
        }

        // Cek apakah admin mencoba menurunkan dirinya sendiri
        if (ctx.userId === targetUserId) {
          throw new Error('Tidak dapat menurunkan role sendiri');
        }
      }

      // Jika memberi role Kasir atau Admin, validasi criteria keamanan
      if (newRoleId === ROLES.ADMIN || newRoleId === ROLES.KASIR) {
        const compliance = await adminRepo.getUserRoleCompliance(targetUserId, conn);
        if (!compliance) {
          throw { status: 404, code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' };
        }

        const missing: string[] = [];
        if (!compliance.has_mfa_pin) {
          missing.push('PIN MFA belum diaktifkan');
        }
        if (!compliance.has_security_answers) {
          missing.push('Pertanyaan keamanan belum dijawab');
        }
        if (!compliance.password_admin_compliant) {
          missing.push('Password belum sesuai ketentuan (minimal 15 karakter, kombinasi lengkap)');
        }

        if (missing.length > 0) {
          throw {
            status: 400,
            code: 'ROLE_CRITERIA_NOT_MET',
            message: `Akun belum memenuhi kriteria keamanan: ${missing.join(', ')}.`,
          };
        }
      }

      // Update role
      await adminRepo.updateUserRole(targetUserId, newRoleId, conn);

      // Cabut semua refresh token user tersebut agar role baru berlaku segera
      await refreshTokenRepo.revokeAllByUserId(targetUserId, conn);

      // Tulis audit log
      await writeAudit(
        {
          actorId: ctx.userId,
          action: 'USER_ROLE_CHANGE',
          entity: 'users',
          entity_id: targetUserId,
          new_value: { role_id: newRoleId },
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Ambil dashboard summary
   */
  async getDashboardSummary(filters?: { date_from?: string; date_to?: string }) {
    return adminRepo.getDashboardSummary(filters);
  }
}
