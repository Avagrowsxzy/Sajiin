import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAuthFlow, redirectForRole } from '../hooks/useAuthFlow';
import { AuthFlowContent } from '../components/ui/AuthFlowContent';
import { Spinner } from '../components/Spinner';

/**
 * Portal login khusus Kasir & Admin.
 * Dirender oleh entri build terpisah (`staff.html`), sehingga jalur/kode portal staff tidak ikut
 * dalam bundel publik (Finding N11). Tidak ada tautan publik menuju halaman ini.
 *
 * Karena ini entri terpisah dari aplikasi utama, setelah autentikasi berhasil kita lakukan muat
 * ulang penuh (full reload) ke dashboard sesuai role, alih-alih navigasi SPA.
 */
export function StaffLoginPage() {
  const { user, loading } = useAuth();
  const flow = useAuthFlow({
    portal: 'staff',
    redirect: (role) => {
      window.location.assign(redirectForRole(role));
    },
  });

  useEffect(() => {
    if (!loading && user) {
      window.location.replace(redirectForRole(user.role_name));
    }
  }, [loading, user]);

  if (loading || user) return <Spinner center />;

  return (
    <div className="staff-login-shell">
      <div className="auth-modal-card staff-login-card">
        <AuthFlowContent flow={flow} variant="staff" />
      </div>
    </div>
  );
}
