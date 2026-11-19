import { SelectHTMLAttributes, ReactNode } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Select({ label, error, id, children, ...props }: SelectProps) {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="form-group">
      <label htmlFor={selectId} className="form-label">
        {label}
      </label>
      <select
        id={selectId}
        className="form-select"
        {...props}
      >
        {children}
      </select>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
