import { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function UiInput({ label, error, id, className, ...props }: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="form-group ui-field">
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      <input id={inputId} className={cn('form-input', className)} aria-invalid={!!error} {...props} />
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
