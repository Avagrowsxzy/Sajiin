import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { formatDate } from '../../utils/format';

interface AdminLog {
  id: number;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
}

export function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{
        data: AdminLog[];
        meta: { page: number; limit: number; total: number; database_log_available?: boolean };
      }>(`/admin/audit/logs?page=${page}&limit=20`);
      setLogs(response.data);
      setTotalPages(Math.max(1, Math.ceil(response.meta.total / response.meta.limit)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat log aktivitas');
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return <div>
    <SectionHeading eyebrow="SECURITY TRAIL" title="Log Aktivitas Sistem" description="Catatan tindakan penting pengguna dan sistem secara read-only." />
    <Card>
      {loading ? <Spinner center size="lg" /> : error ? <ErrorState message={error} retry={fetchLogs} /> : logs.length === 0 ? <EmptyState title="Belum Ada Log" description="Aktivitas sistem akan dicatat di sini." /> : <div className="table-wrapper">
        <table className="table">
           <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entitas</th><th>IP</th><th>Perubahan</th></tr></thead>
           <tbody>{logs.map((log) => <tr key={log.id}>
             <td style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>{formatDate(log.created_at)}</td>
             <td>{log.actor_name || 'System'}</td>
             <td><strong>{log.action}</strong></td>
             <td>{log.entity || '-'}{log.entity_id ? <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{log.entity_id}</div> : null}</td>
             <td>{log.ip_address || '-'}</td>
             <td><details><summary>Lihat JSON</summary><pre style={{ maxWidth: 280, whiteSpace: 'pre-wrap', fontSize: '.7rem' }}>{JSON.stringify({ old: log.old_value, new: log.new_value }, null, 2)}</pre></details></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
    </Card>
  </div>;
}
