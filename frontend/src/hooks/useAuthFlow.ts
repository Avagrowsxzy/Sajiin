import { FormEvent, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { apiClient } from '../lib/api-client';

export type AuthMode = 'login' | 'mfa' | 'mfa-setup' | 'forgot-check' | 'forgot-reset';

export function redirectForRole(role: string): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'kasir') return '/kasir/dashboard';
  return '/menu';
}

interface UseAuthFlowOptions {
  /** Dipanggil setelah login/MFA berhasil, sebelum navigasi (mis. menutup modal). */
  onSuccess?: () => void;
  /** Portal yang dipakai: pelanggan (customer) atau staff. Ditegakkan juga di server. */
  portal?: 'customer' | 'staff';
  /**
   * Cara berpindah setelah autentikasi berhasil. Default: navigasi SPA ke dashboard sesuai role.
   * Portal staff memakai entri build terpisah, jadi ia mengeset ini ke muat-ulang penuh (full reload)
   * agar berpindah dari berkas staff ke aplikasi utama.
   */
  redirect?: (role: string) => void;
}

/**
 * Logika alur autentikasi (login, MFA, setup PIN, lupa password) yang dipakai bersama
 * oleh modal pelanggan (AuthModal) dan halaman portal staff (StaffLoginPage).
 */
export function useAuthFlow({ onSuccess, portal = 'customer', redirect }: UseAuthFlowOptions = {}) {
  const { login, verifyMfa, completeMfaSetup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const goToRole = useCallback(
    (role: string) => {
      if (redirect) redirect(role);
      else navigate(redirectForRole(role));
    },
    [redirect, navigate]
  );

  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [setupAnswers, setSetupAnswers] = useState<[string, string, string]>(['', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  // Lupa password
  const [forgotUsername, setForgotUsername] = useState('');
  const [minResetLen, setMinResetLen] = useState<number>(8);
  const [recoveryMethod, setRecoveryMethod] = useState<'pin' | 'questions'>('pin');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [recoveryAnswers, setRecoveryAnswers] = useState<[string, string, string]>(['', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const reset = useCallback(() => {
    setError('');
    setMfaCode('');
    setSetupAnswers(['', '', '']);
  }, []);

  const goToLogin = useCallback(() => {
    setError('');
    setMode('login');
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await login(loginForm.username, loginForm.password, portal);
      if ('mfa_required' in result && result.mfa_required) {
        setMfaToken(result.mfa_token);
        if (result.mfa_setup_required) {
          setMode('mfa-setup');
          toast.info('Akun Admin/Kasir wajib mengatur PIN Keamanan & 3 pertanyaan pemulihan');
        } else {
          setMode('mfa');
          toast.info('Masukkan PIN keamanan 6 digit Anda');
        }
        return;
      }
      if ('user' in result) {
        toast.success('Login berhasil');
        onSuccess?.();
        goToRole(result.user.role_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await verifyMfa(mfaToken, mfaCode);
      toast.success('Login berhasil');
      onSuccess?.();
      goToRole(result.user.role_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verifikasi MFA gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSetup = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await completeMfaSetup(mfaToken, mfaCode.trim(), setupAnswers);
      toast.success('PIN Keamanan aktif & login berhasil');
      onSuccess?.();
      goToRole(result.user.role_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengaktifkan PIN MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotCheck = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.post<{
        data: { min_password_length: number };
      }>('/auth/password/forgot/check', { username: forgotUsername.trim(), portal }, { skipAuth: true });
      setMinResetLen(res.data.min_password_length || 8);
      setRecoveryMethod('pin');
      setRecoveryPin('');
      setRecoveryAnswers(['', '', '']);
      setNewPassword('');
      setConfirmNewPassword('');
      setMode('forgot-reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa akun');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setError('Konfirmasi password baru tidak cocok');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post(
        '/auth/password/forgot/reset',
        {
          username: forgotUsername.trim(),
          method: recoveryMethod,
          pin: recoveryMethod === 'pin' ? recoveryPin.trim() : undefined,
          security_answers: recoveryMethod === 'questions' ? recoveryAnswers : undefined,
          new_password: newPassword,
          portal,
        },
        { skipAuth: true }
      );
      toast.success('Password berhasil direset! Silakan login dengan password baru.');
      setLoginForm({ username: forgotUsername.trim(), password: '' });
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset password');
    } finally {
      setLoading(false);
    }
  };

  return {
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
    minResetLen,
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
    reset,
    goToLogin,
    handleLogin,
    handleMfa,
    handleMfaSetup,
    handleForgotCheck,
    handleForgotReset,
  };
}

export type AuthFlow = ReturnType<typeof useAuthFlow>;
