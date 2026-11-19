import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', loading = false, disabled, children, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn', `btn-${variant === 'ghost' ? 'secondary' : variant}`, 'ui-button', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
