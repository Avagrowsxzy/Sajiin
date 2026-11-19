interface PasswordStrengthMeterProps {
  password: string;
  minLength?: number;
}

export function PasswordStrengthMeter({ password, minLength = 8 }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const hasMinLen = password.length >= minLength;
  const hasAdminLen = password.length >= 15;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);

  const charTypesCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

  let level: 'weak' | 'medium' | 'strong' = 'weak';
  let label = 'Lemah';
  let color = '#dc2626';
  let activeBars = 1;

  if (hasMinLen && charTypesCount === 4) {
    level = 'strong';
    label = hasAdminLen ? 'Kuat (Memenuhi Standar Kasir/Admin)' : 'Kuat';
    color = '#16a34a';
    activeBars = 3;
  } else if (hasMinLen && charTypesCount >= 3) {
    level = 'medium';
    label = 'Sedang';
    color = '#d97706';
    activeBars = 2;
  }

  const items = [
    { ok: hasMinLen, text: `Minimal ${minLength} karakter (${password.length}/${minLength})` },
    { ok: hasUpper && hasLower, text: 'Huruf besar (A-Z) & huruf kecil (a-z)' },
    { ok: hasDigit, text: 'Angka (0-9)' },
    { ok: hasSymbol, text: 'Simbol (!@#$%^&* dll)' },
  ];

  return (
    <div style={{ marginTop: '-6px', marginBottom: '12px' }} data-strength={level}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            style={{
              flex: 1,
              height: '6px',
              borderRadius: '999px',
              background: bar <= activeBars ? color : '#e5e7eb',
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
        <span style={{ color: 'var(--muted)' }}>Parameter Password:</span>
        <strong style={{ color }}>{label}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: '0.75rem' }}>
        {items.map((item) => (
          <div key={item.text} style={{ color: item.ok ? '#15803d' : 'var(--muted)' }}>
            {item.ok ? '✓' : '○'} {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
