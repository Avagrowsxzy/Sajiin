import { FormEvent, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { Save } from 'lucide-react';

interface PaymentSettings {
  payment_instructions: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}

export function AdminPaymentSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<PaymentSettings>({ payment_instructions: '', bank_name: '', account_number: '', account_name: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ data: PaymentSettings }>('/settings/payment')
      .then((response) => setForm(response.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan pembayaran'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      await apiClient.patch('/settings/payment', form);
      toast.success('Pengaturan pembayaran berhasil disimpan dan dicatat ke audit log');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan pembayaran');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner center size="lg" />;
  if (error) return <ErrorState message={error} retry={() => window.location.reload()} />;

  return <div>
    <SectionHeading eyebrow="SYSTEM CONFIGURATION" title="Pengaturan Pembayaran" description="Atur rekening transfer yang ditampilkan kepada pelanggan. Setiap perubahan dicatat ke log aktivitas." />
    <Card style={{ maxWidth: 680 }}>
      <form onSubmit={handleSubmit} className="auth-modal-form">
        <Input label="Nama Bank" value={form.bank_name} required onChange={(event) => setForm({ ...form, bank_name: event.target.value })} placeholder="Contoh: BCA" />
        <Input label="Nomor Rekening" value={form.account_number} required onChange={(event) => setForm({ ...form, account_number: event.target.value })} placeholder="Contoh: 1234567890" inputMode="numeric" />
        <Input label="Atas Nama" value={form.account_name} required onChange={(event) => setForm({ ...form, account_name: event.target.value })} placeholder="Nama pemilik rekening" />
        <div className="form-group">
          <label className="form-label" htmlFor="payment-instructions">Instruksi Pembayaran</label>
          <textarea id="payment-instructions" className="form-textarea" rows={5} value={form.payment_instructions} required onChange={(event) => setForm({ ...form, payment_instructions: event.target.value })} />
        </div>
        <Button type="submit" loading={saving}><Save size={16} /> Simpan Pengaturan</Button>
      </form>
    </Card>
  </div>;
}
