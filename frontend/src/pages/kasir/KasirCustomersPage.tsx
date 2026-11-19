import { FormEvent, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { SectionHeading } from '../../components/ui/SectionHeading';

export function KasirCustomersPage() {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', username: '', phone: '' });
  const [createdInfo, setCreatedInfo] = useState<{ username: string; tempPass: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      const res = await apiClient.post<{ data: { user: { username: string }; temporary_password?: string } }>(
        '/admin/customers',
        form
      );
      toast.success('Akun pelanggan berhasil dibuat');
      setCreatedInfo({ username: res.data.user.username, tempPass: res.data.temporary_password || '' });
      setForm({ full_name: '', username: '', phone: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat akun pelanggan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SectionHeading
        eyebrow="PELANGGAN"
        title="Daftarkan Pelanggan"
        description="Buat akun member dengan username permintaan pelanggan. Password sementara akan dibuatkan otomatis oleh sistem."
      />
      <Card style={{ maxWidth: 560 }}>
        {createdInfo && (
          <div
            style={{
              padding: '16px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid #22c55e',
              borderRadius: 'var(--radius)',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>
              Akun Berhasil Dibuat
            </h3>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}>
              Username: <strong>{createdInfo.username}</strong>
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>
              Password Sementara:{' '}
              <strong style={{ fontSize: '1.25rem', color: '#15803d', letterSpacing: '0.5px' }}>
                {createdInfo.tempPass}
              </strong>
            </p>
            <small style={{ color: 'var(--muted)', display: 'block' }}>
              Beritahukan password ini ke pelanggan. Pelanggan dapat mengubah password di menu Profil setelah login.
            </small>
          </div>
        )}

        <form onSubmit={submit} className="auth-modal-form">
          <Input
            label="Nama Lengkap"
            value={form.full_name}
            required
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Contoh: Budi Santoso"
          />
          <Input
            label="Username"
            type="text"
            value={form.username}
            required
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="Contoh: budi99"
          />
          <Input
            label="Nomor Telepon"
            value={form.phone}
            inputMode="numeric"
            maxLength={14}
            pattern="^(08[0-9]{8,11}|628[0-9]{8,11})$"
            title="Nomor telepon harus angka diawali 08 atau 628 (10-13 digit, tanpa tanda +)"
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
            placeholder="Contoh: 081234567890 (tanpa tanda +)"
          />
          <Button type="submit" loading={loading}>
            Buat Akun Pelanggan
          </Button>
        </form>
      </Card>
    </div>
  );
}
