import { useNavigate } from 'react-router-dom';
import { SECURITY_QUESTIONS } from '../../types';
import { Button } from '../Button';
import { Input } from '../Input';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import type { AuthFlow } from '../../hooks/useAuthFlow';

interface AuthFlowContentProps {
  flow: AuthFlow;
  variant?: 'customer' | 'staff';
}

/**
 * Isi form autentikasi yang dipakai bersama modal pelanggan dan halaman portal staff.
 * Perbedaan antar varian hanya pada teks judul/eyebrow, bukan alur.
 */
export function AuthFlowContent({ flow, variant = 'customer' }: AuthFlowContentProps) {
  const navigate = useNavigate();
  const {
    mode,
    setMode,
    loading,
    error,
    setError,
    mfaCode,
    setMfaCode,
    setupAnswers,
    setSetupAnswers,
    showPassword,
    setShowPassword,
    loginForm,
    setLoginForm,
    forgotUsername,
    setForgotUsername,
    forgotRole,
    recoveryMethod,
    setRecoveryMethod,
    recoveryPin,
    setRecoveryPin,
    recoveryAnswers,
    setRecoveryAnswers,
    newPassword,
    setNewPassword,
    confirmNewPassword,
    setConfirmNewPassword,
    goToLogin,
    handleLogin,
    handleMfa,
    handleMfaSetup,
    handleForgotCheck,
    handleForgotReset,
  } = flow;

  const minResetLen = forgotRole === 'admin' || forgotRole === 'kasir' ? 15 : 8;

  return (
    <>
      <div className="auth-modal-mark">S</div>
      <span className="ui-eyebrow">{variant === 'staff' ? 'PORTAL STAFF' : 'SAJIIN ACCOUNT'}</span>

      {mode === 'mfa' && (
        <>
          <h2>Verifikasi keamanan</h2>
          <p className="auth-modal-subtitle">Masukkan PIN keamanan 6 digit Anda.</p>
          <form onSubmit={handleMfa} className="auth-modal-form">
            <Input
              label="PIN Keamanan (6 Digit)"
              type="password"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              placeholder="••••••"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              autoFocus
            />
            {error && <div className="auth-modal-error">{error}</div>}
            <Button type="submit" loading={loading} style={{ width: '100%' }}>Verifikasi</Button>
            <button type="button" className="auth-modal-text-button" onClick={goToLogin}>
              Kembali ke login
            </button>
          </form>
        </>
      )}

      {mode === 'mfa-setup' && (
        <>
          <h2>Wajib Aktifkan PIN MFA</h2>
          <p className="auth-modal-subtitle">
            Akun Administrasi (Admin & Kasir) wajib mengaktifkan PIN 6 digit dan menjawab 3 pertanyaan pemulihan.
          </p>
          <form onSubmit={handleMfaSetup} className="auth-modal-form">
            <Input
              label="Buat PIN Keamanan (6 Digit Angka)"
              type="password"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              autoFocus
            />
            {SECURITY_QUESTIONS.map((q, idx) => (
              <Input
                key={q}
                label={`${idx + 1}. ${q}`}
                value={setupAnswers[idx]}
                onChange={(event) => {
                  const next: [string, string, string] = [...setupAnswers] as [string, string, string];
                  next[idx] = event.target.value;
                  setSetupAnswers(next);
                }}
                placeholder="Jawaban rahasia Anda"
                required
              />
            ))}
            {error && <div className="auth-modal-error">{error}</div>}
            <Button type="submit" loading={loading} style={{ width: '100%' }}>
              Simpan PIN & Masuk
            </Button>
            <button type="button" className="auth-modal-text-button" onClick={goToLogin}>
              Batal
            </button>
          </form>
        </>
      )}

      {mode === 'forgot-check' && (
        <>
          <h2>Lupa Password</h2>
          <p className="auth-modal-subtitle">
            Masukkan username Anda. Pemulihan hanya bisa dilakukan jika akun telah mengaktifkan PIN Keamanan.
          </p>
          <form onSubmit={handleForgotCheck} className="auth-modal-form">
            <Input
              label="Username"
              type="text"
              value={forgotUsername}
              onChange={(event) => setForgotUsername(event.target.value)}
              placeholder="Masukkan username akun"
              required
              autoFocus
            />
            {error && <div className="auth-modal-error">{error}</div>}
            <Button type="submit" loading={loading} style={{ width: '100%' }}>
              Lanjutkan Pemulihan
            </Button>
            <button type="button" className="auth-modal-text-button" onClick={goToLogin}>
              Kembali ke login
            </button>
          </form>
        </>
      )}

      {mode === 'forgot-reset' && (
        <>
          <h2>Reset Password</h2>
          <p className="auth-modal-subtitle">
            {recoveryMethod === 'pin'
              ? 'Masukkan PIN Keamanan 6 digit Anda untuk membuat password baru.'
              : 'Jawab ke-3 pertanyaan keamanan di bawah sesuai saat Anda mengaktifkan PIN.'}
          </p>
          <form onSubmit={handleForgotReset} className="auth-modal-form">
            {recoveryMethod === 'pin' ? (
              <>
                <Input
                  label="PIN Keamanan (6 Digit)"
                  type="password"
                  value={recoveryPin}
                  onChange={(event) => setRecoveryPin(event.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  className="auth-modal-text-button"
                  style={{ marginTop: '-4px', marginBottom: '8px', textAlign: 'left' }}
                  onClick={() => {
                    setError('');
                    setRecoveryMethod('questions');
                  }}
                >
                  Lupa PIN? Gunakan 3 Pertanyaan Keamanan
                </button>
              </>
            ) : (
              <>
                {SECURITY_QUESTIONS.map((q, idx) => (
                  <Input
                    key={q}
                    label={`${idx + 1}. ${q}`}
                    value={recoveryAnswers[idx]}
                    onChange={(event) => {
                      const next: [string, string, string] = [...recoveryAnswers] as [string, string, string];
                      next[idx] = event.target.value;
                      setRecoveryAnswers(next);
                    }}
                    placeholder="Jawaban Anda"
                    required
                  />
                ))}
                <button
                  type="button"
                  className="auth-modal-text-button"
                  style={{ marginTop: '-4px', marginBottom: '8px', textAlign: 'left' }}
                  onClick={() => {
                    setError('');
                    setRecoveryMethod('pin');
                  }}
                >
                  Ingat PIN? Gunakan PIN 6 Digit
                </button>
              </>
            )}

            <Input
              label={`Password Baru (Min. ${minResetLen} karakter, Huruf Besar/Kecil, Angka & Simbol)`}
              type="password"
              minLength={minResetLen}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={`Minimal ${minResetLen} karakter & tidak sama dengan password lama`}
              required
            />
            <PasswordStrengthMeter password={newPassword} minLength={minResetLen} />
            <Input
              label="Konfirmasi Password Baru"
              type="password"
              minLength={minResetLen}
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder="Ulangi password baru"
              required
            />

            {error && <div className="auth-modal-error">{error}</div>}
            <Button type="submit" loading={loading} style={{ width: '100%' }}>
              Simpan Password Baru
            </Button>
            <button type="button" className="auth-modal-text-button" onClick={goToLogin}>
              Batal & kembali ke login
            </button>
          </form>
        </>
      )}

      {mode === 'login' && (
        <>
          {variant === 'staff' ? (
            <>
              <h2>Masuk Portal Staff</h2>
              <p className="auth-modal-subtitle">Area khusus Kasir &amp; Administrator Sajiin.</p>
            </>
          ) : (
            <>
              <h2>Selamat datang kembali</h2>
              <p className="auth-modal-subtitle">Masuk untuk melanjutkan pesananmu.</p>
            </>
          )}
          <form onSubmit={handleLogin} className="auth-modal-form">
            <Input
              label="Username"
              type="text"
              value={loginForm.username}
              onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
              placeholder="Masukkan username"
              required
              autoFocus
            />
            <div className="auth-password-field">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px' }}>
              <button
                type="button"
                className="auth-modal-text-button"
                onClick={() => {
                  setError('');
                  setForgotUsername(loginForm.username);
                  setMode('forgot-check');
                }}
              >
                Lupa password?
              </button>
            </div>
            {error && <div className="auth-modal-error">{error}</div>}
            <Button type="submit" loading={loading} style={{ width: '100%' }}>
              Masuk <ArrowRight size={15} />
            </Button>
            {variant === 'staff' && (
              <button
                type="button"
                className="auth-modal-text-button"
                onClick={() => navigate('/')}
              >
                Kembali ke beranda
              </button>
            )}
          </form>
        </>
      )}
    </>
  );
}
