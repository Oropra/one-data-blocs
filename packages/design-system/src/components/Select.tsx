import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className="od-field">
      <label className="od-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className="od-select"
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...rest}
      >
        {children}
      </select>
      {hint ? <p className="od-field__hint">{hint}</p> : null}
      {error ? (
        <p className="od-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
