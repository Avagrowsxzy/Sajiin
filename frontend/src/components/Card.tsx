import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div className={cn('card', 'ui-card', className)} {...props}>
      {children}
    </div>
  );
}
