import type { SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, id, className = '', children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-mono uppercase tracking-wider text-np-muted">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`rounded-sharp border px-3 py-2 text-sm font-mono text-np-fg bg-[var(--np-input-bg,rgba(0,0,0,0.4))] border-[rgba(255,255,255,0.12)] outline-none focus:border-np-green focus:ring-1 focus:ring-np-green transition-colors appearance-none disabled:opacity-50 cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-np-magenta">{error}</span>}
    </div>
  );
}
