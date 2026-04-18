import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';

export function Table({
  className = '',
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-sm font-mono border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`border-b border-[rgba(255,255,255,0.12)] ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-[rgba(255,255,255,0.06)] ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-[rgba(255,255,255,0.02)] transition-colors ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function TableHeader({
  className = '',
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-2 text-left text-xs uppercase tracking-wider text-np-muted ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className = '',
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-np-fg ${className}`} {...props}>
      {children}
    </td>
  );
}
