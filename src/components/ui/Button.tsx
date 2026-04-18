import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-display uppercase tracking-widest rounded-sharp border cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-np-green focus-visible:ring-offset-1 focus-visible:ring-offset-np-bg';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-np-green text-np-bg border-np-green',
    ghost: 'bg-transparent text-np-fg border-[rgba(255,255,255,0.12)] hover:border-np-fg',
    danger: 'bg-np-magenta text-np-bg border-np-magenta',
  };

  const machinedShadow =
    variant === 'primary' || variant === 'danger'
      ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
      : '';

  return (
    <button
      className={`${base} ${variants[variant]} ${sizeStyles[size]} ${machinedShadow} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
