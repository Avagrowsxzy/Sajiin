import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter';
import { SECURITY_QUESTIONS, type User } from '../../types';

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  // Profile Form state
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Security Form state
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  // MFA Setup state
  const [mfaData, setMfaData] = useState<{ secret: string; uri: string; qr_code_url?: string } | null>(null);
  const [currentMfaPin, setCurrentMfaPin] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [securityAnswers, setSecurityAnswers] = useState<[string, string, string]>(['', '', '']);
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);
  const [mfaConfirmLoading, setMfaConfirmLoading] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false);

  // Populate profile info
  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  // 1. Update Profile Submit
  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setProfileLoading(true);
      await apiClient.patch<{ data: User }>('/me', {
        full_name: profileForm.full_name,
        phone: profileForm.phone || null,
      });
      await refreshUser();
      toast.success('Profil berhasil diperbarui');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui profil');
    } finally {
      setProfileLoading(false);
    }
  };

  // 2. Change Password Submit
  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.warning('Konfirmasi password baru tidak cocok');
      return;
    }

    try {
      setPasswordLoading(true);
      await apiClient.post('/auth/password/change', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      toast.success('Password berhasil diubah');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengganti password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 3. Initiate MFA Setup
  const handleStartMfaSetup = async () => {
    try {
      setMfaSetupLoading(true);
      const res = await apiClient.post<{ data: { secret: string; uri: string; qr_code_url?: string } }>(
        '/auth/mfa/setup'
      );
      setMfaData(res.data);
      setShowMfaModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memulai setup MFA');
    } finally {
      setMfaSetupLoading(false);
    }
  };

  // 4. Confirm MFA Setup with Code + 3 Security Answers
  const handleConfirmMfa = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setMfaConfirmLoading(true);
      await apiClient.post('/auth/mfa/confirm', {
        current_pin: user?.has_mfa ? currentMfaPin.trim() : undefined,
        code: mfaCode.trim(),
        security_answers: user?.has_mfa ? undefined : securityAnswers,
      });
      await refreshUser();
      setShowMfaModal(false);
      setCurrentMfaPin('');
      setMfaCode('');
      setSecurityAnswers(['', '', '']);
      setMfaData(null);
      toast.success(
        user?.has_mfa
          ? 'PIN Keamanan & 3 Pertanyaan Pemulihan berhasil diperbarui!'
          : 'PIN Keamanan & 3 Pertanyaan Pemulihan berhasil diaktifkan!'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kode MFA atau jawaban tidak valid');
    } finally {
      setMfaConfirmLoading(false);
    }
  };

  return (
    <div className="flow-page">
      <span className="ui-eyebrow">AKUN SAJIIN</span>
      <h1 className="page-title">Profil & Pengaturan Akun</h1>
      <p style={{ color: 'var(--muted)', marginTop: '-16px', marginBottom: '24px' }}>Kelola identitas dan keamanan akunmu dengan aman.</p>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Data Pribadi
        </button>
        <button
          className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Keamanan & MFA
        </button>
      </div>

      {/* TAB 1: Profile Form */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: '540px' }}>
          <Card>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>
              Ubah Data Pribadi
            </h2>
            <form onSubmit={handleProfileSubmit}>
              <Input
                label="Username (Tidak dapat diubah)"
                value={user?.username || ''}
                disabled
              />

              <Input
                label="Nama Lengkap"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                required
              />

              <Input
                label="Nomor Telepon"
                value={profileForm.phone}
                inputMode="numeric"
                maxLength={14}
                pattern="^(08[0-9]{8,11}|628[0-9]{8,11})$"
                title="Nomor telepon harus angka diawali 08 atau 628 (10-13 digit, tanpa tanda +)"
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="Contoh: 081234567890 (tanpa tanda +)"
              />

              <Button type="submit" variant="primary" loading={profileLoading} style={{ marginTop: '8px' }}>
                Simpan Perubahan
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* TAB 2: Security & Password & MFA */}
      {activeTab === 'security' && (
        <div className="grid-2">
          {/* Change Password Card */}
          <Card>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
              Ganti Password
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              {user?.role_name === 'admin' || user?.role_name === 'kasir'
                ? 'Kebijakan Administrasi (Admin/Kasir): Minimal 15 karakter, wajib kombinasi huruf besar, huruf kecil, angka, dan simbol, tidak boleh menggunakan password lama, serta wajib diganti minimal 1 tahun sekali.'
                : 'Kebijakan Pengguna: Minimal 8 karakter, wajib kombinasi huruf besar, huruf kecil, angka, dan simbol, serta tidak boleh menggunakan password lama.'}
            </p>
            <form onSubmit={handlePasswordSubmit}>
              <Input
                label="Password Saat Ini"
                type="password"
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                required
              />

              <Input
                label="Password Baru"
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder={
                  user?.role_name === 'admin' || user?.role_name === 'kasir'
                    ? 'Minimal 15 karakter (Huruf besar, kecil, angka, simbol)'
                    : 'Minimal 8 karakter (Huruf besar, kecil, angka, simbol)'
                }
                minLength={user?.role_name === 'admin' || user?.role_name === 'kasir' ? 15 : 8}
                required
              />
              <PasswordStrengthMeter
                password={passwordForm.new_password}
                minLength={user?.role_name === 'admin' || user?.role_name === 'kasir' ? 15 : 8}
              />

              <Input
                label="Konfirmasi Password Baru"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                required
              />

              <Button type="submit" variant="primary" loading={passwordLoading} style={{ marginTop: '8px' }}>
                Perbarui Password
              </Button>
            </form>
          </Card>

          {/* MFA PIN & Recovery Questions Security Card */}
          <Card>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '12px' }}>
              PIN Keamanan (MFA) & Pemulihan Akun
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              Lindungi akun Anda dengan PIN 6 digit dan 3 pertanyaan rahasia.{' '}
              <strong>Penting:</strong> Jika Anda lupa password namun belum mengaktifkan PIN ini, akun dinyatakan hilang dan tidak dapat dipulihkan.
            </p>

            <div
              style={{
                padding: '16px',
                background: user?.has_mfa ? '#d4edda' : 'var(--bg)',
                borderRadius: 'var(--radius)',
                marginBottom: '20px',
              }}
            >
              <div className="flex items-center gap-1">
                {user?.has_mfa ? <ShieldCheck size={24} color="#155724" /> : <AlertTriangle size={24} color="#b45309" />}
                <div>
                  <strong style={{ fontSize: '0.95rem', color: user?.has_mfa ? '#155724' : 'var(--text)' }}>
                    {user?.has_mfa ? 'PIN MFA & Pertanyaan Pemulihan Aktif' : 'PIN MFA Belum Aktif'}
                  </strong>
                  <p style={{ fontSize: '0.8rem', color: user?.has_mfa ? '#155724' : 'var(--muted)', margin: 0 }}>
                    {user?.has_mfa
                      ? 'Akun Anda terlindungi PIN 6 digit saat login dan dapat dipulihkan jika lupa password.'
                      : 'Segera aktifkan PIN dan 3 pertanyaan keamanan agar akun tidak hilang saat lupa password.'}
                  </p>
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleStartMfaSetup}
              loading={mfaSetupLoading}
            >
              {user?.has_mfa ? 'Perbarui PIN & Jawaban Keamanan' : 'Atur PIN & Pertanyaan Keamanan Sekarang'}
            </Button>
          </Card>
        </div>
      )}

      <Card className="profile-logout-card">
        <div>
          <strong>Keluar dari akun?</strong>
          <p>Token sesi akan dihapus dan kamu akan kembali ke halaman awal Sajiin.</p>
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          Keluar
        </Button>
      </Card>

      {/* MFA Setup Modal */}
      {showMfaModal && mfaData && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowMfaModal(false);
            setCurrentMfaPin('');
            setMfaCode('');
          }}
          title={user?.has_mfa ? 'Perbarui PIN Keamanan & Pertanyaan Pemulihan' : 'Atur PIN Keamanan & 3 Pertanyaan Pemulihan'}
          footer={null}
        >
          <form onSubmit={handleConfirmMfa}>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '16px' }}>
              {user?.has_mfa
                ? 'Masukkan PIN saat ini, lalu buat PIN baru 6 digit.'
                : 'Buat PIN 6 digit dan isi 3 pertanyaan di bawah ini. Jika Anda lupa password dan lupa PIN, 3 pertanyaan ini akan menjadi satu-satunya cara memulihkan akun Anda.'}
            </p>

            {user?.has_mfa && (
              <Input
                label="PIN Keamanan Saat Ini (6 Digit Angka)"
                type="password"
                placeholder="••••••"
                maxLength={6}
                value={currentMfaPin}
                onChange={(e) => setCurrentMfaPin(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            )}

            <Input
              label={user?.has_mfa ? 'PIN Keamanan Baru (6 Digit Angka)' : 'PIN Keamanan (6 Digit Angka)'}
              type="password"
              placeholder="••••••"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus={!user?.has_mfa}
            />

            {!user?.has_mfa && SECURITY_QUESTIONS.map((question, idx) => (
              <Input
                key={question}
                label={`${idx + 1}. ${question}`}
                value={securityAnswers[idx]}
                onChange={(e) => {
                  const next: [string, string, string] = [...securityAnswers] as [string, string, string];
                  next[idx] = e.target.value;
                  setSecurityAnswers(next);
                }}
                placeholder="Jawaban yang hanya Anda ketahui"
                required
              />
            ))}

            <div className="flex justify-end gap-1 mt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setShowMfaModal(false);
                  setCurrentMfaPin('');
                  setMfaCode('');
                }}
                disabled={mfaConfirmLoading}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={mfaConfirmLoading}
                disabled={
                  (Boolean(user?.has_mfa) && currentMfaPin.length !== 6) ||
                  mfaCode.length !== 6 ||
                  (!user?.has_mfa && securityAnswers.some((a) => a.trim().length < 2))
                }
              >
                {user?.has_mfa ? 'Simpan Perubahan' : 'Konfirmasi & Aktifkan'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
