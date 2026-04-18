import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-mono uppercase tracking-wider text-np-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`rounded-sharp border px-3 py-2 text-sm font-mono text-np-fg placeholder-np-muted bg-[var(--np-input-bg,rgba(0,0,0,0.4))] border-[rgba(255,255,255,0.12)] outline-none focus:border-np-green focus:ring-1 focus:ring-np-green transition-colors disabled:opacity-50 ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-np-magenta">{error}</span>}
    </div>
  );
}
