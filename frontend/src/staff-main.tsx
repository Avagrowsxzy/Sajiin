import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { StaffLoginPage } from './pages/StaffLoginPage';
import './styles.css';

/**
 * Entri build terpisah untuk portal login staff (Kasir & Admin).
 * Dipisahkan dari `main.tsx` supaya kode/halaman portal staff tidak masuk ke bundel publik
 * (Finding N11). Tidak membutuhkan CartProvider karena tidak ada alur belanja di sini.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <StaffLoginPage />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
