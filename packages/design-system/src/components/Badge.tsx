import type { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children, className, ...rest }: BadgeProps) {
  const classes = [
    'od-badge',
    variant !== 'neutral' ? `od-badge--${variant}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
