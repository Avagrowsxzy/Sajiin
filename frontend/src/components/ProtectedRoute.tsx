import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/Spinner';
import { NotFoundPage } from '../pages/ErrorPages';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('user' | 'kasir' | 'admin')[];
  /**
   * Bila true, area ini "disembunyikan": pengguna yang belum login atau tidak
   * berhak akan melihat halaman 404 (bukan redirect ke login atau 403),
   * sehingga keberadaan area staff tidak mudah ditemukan dari luar.
   */
  concealed?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, concealed = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner center />;
  }

  if (!user) {
    if (concealed) {
      return <NotFoundPage />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role_name)) {
    if (concealed) {
      return <NotFoundPage />;
    }
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}

interface PublicOnlyRouteProps {
  children: React.ReactNode;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spinner center />;
  }

  if (user) {
    // Redirect based on role
    if (user.role_name === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    } else if (user.role_name === 'kasir') {
      return <Navigate to="/kasir/dashboard" replace />;
    } else {
      return <Navigate to="/menu" replace />;
    }
  }

  return <>{children}</>;
}
