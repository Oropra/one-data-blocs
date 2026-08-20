import type { ReactNode } from 'react';

export interface PageShellProps {
  header?: ReactNode;
  children: ReactNode;
}

/** Responsive application page shell with a sticky header slot. */
export function PageShell({ header, children }: PageShellProps) {
  return (
    <div className="od-page-shell">
      {header ? <div className="od-page-shell__header">{header}</div> : null}
      <main className="od-page-shell__main">{children}</main>
    </div>
  );
}
