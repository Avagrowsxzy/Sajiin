import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

export function NotFoundPage() {
  return (
    <div style={{ maxWidth: '500px', margin: '64px auto', textAlign: 'center' }}>
      <Card>
        <h1 style={{ fontSize: '4rem', marginBottom: '16px', color: 'var(--muted)' }}>404</h1>
        <h2 style={{ marginBottom: '16px' }}>Halaman Tidak Ditemukan</h2>
        <p style={{ marginBottom: '24px', color: 'var(--muted)' }}>
          Halaman yang Anda cari tidak tersedia.
        </p>
        <Link to="/" className="btn btn-primary">
          Kembali ke Beranda
        </Link>
      </Card>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div style={{ maxWidth: '500px', margin: '64px auto', textAlign: 'center' }}>
      <Card>
        <h1 style={{ fontSize: '4rem', marginBottom: '16px', color: 'var(--danger)' }}>403</h1>
        <h2 style={{ marginBottom: '16px' }}>Akses Ditolak</h2>
        <p style={{ marginBottom: '24px', color: 'var(--muted)' }}>
          Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
        <Link to="/" className="btn btn-primary">
          Kembali ke Beranda
        </Link>
      </Card>
    </div>
  );
}
