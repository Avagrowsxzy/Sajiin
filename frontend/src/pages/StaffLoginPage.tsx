import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuthFlow, redirectForRole } from '../hooks/useAuthFlow';
import { AuthFlowContent } from '../components/ui/AuthFlowContent';
import { Spinner } from '../components/Spinner';

/**
 * Portal login khusus Kasir & Admin.
 * Hanya dapat diakses lewat URL rahasia (VITE_STAFF_LOGIN_PATH) — tidak ada tautan publik.
 */
export function StaffLoginPage() {
  const { user, loading } = useAuth();
  const flow = useAuthFlow({ portal: 'staff' });

  if (loading) return <Spinner center />;
  if (user) return <Navigate to={redirectForRole(user.role_name)} replace />;

  return (
    <div className="staff-login-shell">
      <div className="auth-modal-card staff-login-card">
        <AuthFlowContent flow={flow} variant="staff" />
      </div>
    </div>
  );
}
