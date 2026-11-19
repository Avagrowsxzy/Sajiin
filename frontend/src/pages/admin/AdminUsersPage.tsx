import { useState, useEffect, useCallback, FormEvent } from 'react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { Modal, ConfirmModal } from '../../components/Modal';
import type { AdminUser, PaginatedResponse } from '../../types';
import { SectionHeading } from '../../components/ui/SectionHeading';

const ROLE_OPTIONS = [
  { value: 1, label: 'admin' },
  { value: 2, label: 'user' },
  { value: 4, label: 'kasir' },
];

export function AdminUsersPage() {
  const toast = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;
  const [includeInactive, setIncludeInactive] = useState(false);

  const [statusTarget, setStatusTarget] = useState<{ user: AdminUser; activate: boolean } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState<number>(2);
  const [roleLoading, setRoleLoading] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleCriteria, setRoleCriteria] = useState<{
    has_mfa_pin: boolean;
    has_security_answers: boolean;
    password_admin_compliant: boolean;
    can_be_promoted: boolean;
  } | null>(null);
  const [criteriaLoading, setCriteriaLoading] = useState(false);

  const [unlockTarget, setUnlockTarget] = useState<AdminUser | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    username: '',
    phone: '',
  });
  const [createdUserSuccess, setCreatedUserSuccess] = useState<{ username: string; tempPass: string } | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.get<PaginatedResponse<AdminUser>>(
        `/admin/users?page=${page}&limit=${limit}&include_inactive=${includeInactive}`
      );
      setUsers(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna');
    } finally {
      setLoading(false);
    }
  }, [page, includeInactive]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    try {
      setStatusLoading(true);
      await apiClient.patch(`/admin/users/${statusTarget.user.id}`, {
        is_active: statusTarget.activate,
      });
      toast.success(statusTarget.activate ? 'Akun diaktifkan' : 'Akun dinonaktifkan');
      setStatusTarget(null);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status akun');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockTarget) return;
    try {
      setUnlockLoading(true);
      await apiClient.patch(`/admin/users/${unlockTarget.id}`, { unlock: true });
      toast.success('Kunci akun berhasil dibuka');
      setUnlockTarget(null);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuka kunci akun');
    } finally {
      setUnlockLoading(false);
    }
  };

  const openRoleModal = async (u: AdminUser) => {
    setRoleTarget(u);
    setNewRole(u.role_id);
    setShowRoleModal(true);
    
    // Fetch role criteria
    try {
      setCriteriaLoading(true);
      const res = await apiClient.get<{
        data: {
          criteria: {
            has_mfa_pin: boolean;
            has_security_answers: boolean;
            password_admin_compliant: boolean;
            can_be_promoted: boolean;
          };
          can_be_promoted: boolean;
        };
      }>(`/admin/users/${u.id}/role-criteria`);
      setRoleCriteria(res.data.criteria);
    } catch (err) {
      console.error('Gagal fetch criteria:', err);
      setRoleCriteria(null);
    } finally {
      setCriteriaLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    try {
      setRoleLoading(true);
      await apiClient.patch(`/admin/users/${roleTarget.id}/role`, { role_id: newRole });
      toast.success(`Role ${roleTarget.full_name} berhasil diubah & semua token dicabut`);
      setShowRoleModal(false);
      setRoleTarget(null);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah role');
    } finally {
      setRoleLoading(false);
    }
  };

  const isLocked = (u: AdminUser) => u.locked_until && new Date(u.locked_until) > new Date();

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setCreateLoading(true);
      const res = await apiClient.post<{ data: { user: { username: string }; temporary_password?: string } }>(
        '/admin/customers',
        createForm
      );
      toast.success('Akun pengguna berhasil dibuat');
      setCreatedUserSuccess({ username: res.data.user.username, tempPass: res.data.temporary_password || '' });
      setCreateForm({ full_name: '', username: '', phone: '' });
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat akun pengguna');
    } finally {
      setCreateLoading(false);
    }
  };

  const requiresAdminCompliance = newRole === 1 || newRole === 4;
  const meetsAdminCompliance = roleCriteria?.can_be_promoted ?? false;

  return (
    <div>
      <SectionHeading eyebrow="ACCESS CONTROL" title="Kelola Pengguna" description="Atur akun aktif, role, dan akses operasional sistem." />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <label className="admin-users-filter" style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              setPage(1);
            }}
          />
          Tampilkan akun nonaktif
        </label>

        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          + Tambah Pengguna
        </Button>
      </div>

      {loading ? (
        <Spinner center size="lg" />
      ) : error ? (
        <ErrorState message={error} retry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState title="Belum Ada Pengguna" description="Daftar pengguna terdaftar akan tampil di sini." />
      ) : (
        <Card>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Terdaftar</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name}</strong>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>@{u.username}</td>
                    <td>
                      <span className={`role-label role-${u.role_name}`}>
                        {u.role_name === 'admin' ? 'Admin' : u.role_name === 'kasir' ? 'Kasir' : 'User'}
                      </span>
                    </td>
                    <td>
                      <div className="account-status">
                        <span className={`account-status-dot ${u.is_active ? 'active' : 'inactive'}`} />
                        <span>{u.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        {isLocked(u) && <span className="account-locked">Terkunci</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDate(u.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {u.username.endsWith('@removed.local') ? (
                          <span className="account-anonymized">Dianonimkan</span>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => setStatusTarget({ user: u, activate: !u.is_active })}
                          >
                            {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}

                        {isLocked(u) && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => setUnlockTarget(u)}
                          >
                            Buka Kunci
                          </button>
                        )}

                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => openRoleModal(u)}
                        >
                          Ubah Role
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
        </Card>
      )}

      {/* Konfirmasi aktif/nonaktif */}
      <ConfirmModal
        isOpen={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        title={statusTarget?.activate ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
        message={
          statusTarget?.activate
            ? `Aktifkan kembali akun ${statusTarget?.user.full_name} (@${statusTarget?.user.username})?`
            : `Nonaktifkan akun ${statusTarget?.user.full_name} (@${statusTarget?.user.username})? Pengguna tidak akan bisa login sampai diaktifkan kembali.`
        }
        confirmText={statusTarget?.activate ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'}
        confirmVariant={statusTarget?.activate ? 'primary' : 'danger'}
        loading={statusLoading}
      />

      {/* Konfirmasi buka kunci */}
      <ConfirmModal
        isOpen={!!unlockTarget}
        onClose={() => setUnlockTarget(null)}
        onConfirm={handleUnlock}
        title="Buka Kunci Akun"
        message={`Buka kunci akun ${unlockTarget?.full_name}? Pengguna akan bisa mencoba login kembali.`}
        confirmText="Ya, Buka Kunci"
        loading={unlockLoading}
      />

      {/* Modal tambah pengguna baru */}
      {showCreateModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCreateModal(false);
            setCreatedUserSuccess(null);
          }}
          title={createdUserSuccess ? 'Akun Berhasil Dibuat' : 'Tambah Pengguna Baru'}
          footer={null}
        >
          {createdUserSuccess ? (
            <div>
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #22c55e',
                  borderRadius: 'var(--radius)',
                  marginBottom: '16px',
                }}
              >
                <p style={{ margin: '0 0 6px 0', fontSize: '0.9rem' }}>
                  Username: <strong>{createdUserSuccess.username}</strong>
                </p>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                  Password Sementara:{' '}
                  <strong style={{ fontSize: '1.25rem', color: '#15803d', letterSpacing: '0.5px' }}>
                    {createdUserSuccess.tempPass}
                  </strong>
                </p>
                <small style={{ color: 'var(--muted)', display: 'block' }}>
                  Beritahukan password sementara ini ke pengguna. Pengguna dapat mengubahnya di menu profil setelah login.
                </small>
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setCreatedUserSuccess(null);
                    setShowCreateModal(false);
                  }}
                >
                  Selesai
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateUser} className="auth-modal-form">
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '12px' }}>
                Akun baru dibuat dengan role <strong>user</strong>. Password sementara akan dibuatkan otomatis oleh sistem.
              </p>
              <Input
                label="Nama Lengkap"
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                placeholder="Contoh: Budi Santoso"
                required
              />
              <Input
                label="Username"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="Contoh: budi99"
                required
              />
              <Input
                label="Nomor Telepon"
                value={createForm.phone}
                inputMode="numeric"
                maxLength={14}
                pattern="^(08[0-9]{8,11}|628[0-9]{8,11})$"
                title="Nomor telepon harus angka diawali 08 atau 628 (10-13 digit, tanpa tanda +)"
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="Contoh: 081234567890 (tanpa tanda +)"
              />
              <div className="flex justify-end gap-1 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createLoading}
                >
                  Batal
                </Button>
                <Button type="submit" variant="primary" loading={createLoading}>
                  Buat Pengguna
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Modal ubah role */}
      {showRoleModal && roleTarget && (
        <Modal
          isOpen={true}
           onClose={() => {
             setShowRoleModal(false);
             setRoleCriteria(null);
           }}
          title={`Ubah Role: ${roleTarget.full_name}`}
          footer={
            <div className="flex justify-end gap-1">
              <Button variant="secondary" onClick={() => setShowRoleModal(false)} disabled={roleLoading}>
                Batal
              </Button>
              <Button
                variant="primary"
                onClick={handleRoleChange}
                loading={roleLoading}
                disabled={newRole === roleTarget.role_id || (requiresAdminCompliance && !meetsAdminCompliance)}
              >
                Simpan Role
              </Button>
            </div>
          }
        >
          <p style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--muted)' }}>
            Mengubah role akan langsung <strong>mencabut semua refresh token</strong> pengguna tersebut,
            sehingga sesi aktif mereka berakhir dan peran baru berlaku segera.
          </p>

          <div className="form-group">
            <label className="form-label">Role Baru</label>
            <select
              className="form-select"
              value={newRole}
              onChange={(e) => setNewRole(Number(e.target.value))}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {requiresAdminCompliance && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px',
                borderRadius: 'var(--radius)',
                background: meetsAdminCompliance ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${meetsAdminCompliance ? '#a7f3d0' : '#fecaca'}`,
                fontSize: '0.82rem',
              }}
            >
              <strong style={{ display: 'block', marginBottom: '6px', color: meetsAdminCompliance ? '#065f46' : '#991b1b' }}>
                Pengecekan Standar Akun Kasir / Admin:
              </strong>
              {criteriaLoading ? (
                <div style={{ color: '#666' }}>Memuat kriteria...</div>
              ) : roleCriteria ? (
                <>
                  <div style={{ color: roleCriteria.has_mfa_pin ? '#15803d' : '#b91c1c', marginBottom: '4px' }}>
                    {roleCriteria.has_mfa_pin ? '✓' : '✗'} PIN MFA 6 digit aktif
                  </div>
                  <div style={{ color: roleCriteria.has_security_answers ? '#15803d' : '#b91c1c', marginBottom: '4px' }}>
                    {roleCriteria.has_security_answers ? '✓' : '✗'} Pertanyaan keamanan sudah dijawab
                  </div>
                  <div style={{ color: roleCriteria.password_admin_compliant ? '#15803d' : '#b91c1c' }}>
                    {roleCriteria.password_admin_compliant ? '✓' : '✗'} Password minimal 15 karakter (huruf besar, kecil, angka, simbol)
                  </div>
                  {!meetsAdminCompliance && (
                    <p style={{ margin: '8px 0 0', color: '#991b1b', fontSize: '0.78rem' }}>
                      Pengguna harus login ke akunnya dan memenuhi semua kriteria di atas melalui menu Profil sebelum dapat diberi role Kasir atau Admin.
                    </p>
                  )}
                </>
              ) : (
                <div style={{ color: '#666' }}>Gagal memuat kriteria</div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
