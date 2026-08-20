import type { ReactNode } from 'react';

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="od-empty-state">
      <p>{title}</p>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: (() => void) | undefined;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Une erreur est survenue',
  message,
  onRetry,
  retryLabel = 'Réessayer',
}: ErrorStateProps) {
  return (
    <div className="od-error-state" role="alert">
      <p>
        <strong>{title}</strong>
      </p>
      {message ? <p>{message}</p> : null}
      {onRetry ? (
        <button type="button" className="od-btn od-btn--secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
