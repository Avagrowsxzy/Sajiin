import { InputHTMLAttributes } from 'react';
import { UiInput } from './ui/Input';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, ...props }: InputProps) {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return <UiInput label={label} error={error} id={inputId} {...props} />;
}
