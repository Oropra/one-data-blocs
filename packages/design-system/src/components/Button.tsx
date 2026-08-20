import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  const classes = [
    'od-btn',
    `od-btn--${variant}`,
    size !== 'md' ? `od-btn--${size}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
});
