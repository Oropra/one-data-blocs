import type { ReactNode, TableHTMLAttributes } from 'react';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

/** Styled table wrapper; compose with native thead/tbody/tr/th/td. */
export function Table({ children, className, ...rest }: TableProps) {
  return (
    <table className={['od-table', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </table>
  );
}
