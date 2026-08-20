import { Input } from './Input';

export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  fromLabel?: string;
  toLabel?: string;
  disabled?: boolean;
}

/** Two native date inputs; native pickers keep mobile UX and accessibility. */
export function DateRangePicker({
  value,
  onChange,
  fromLabel = 'Du',
  toLabel = 'Au',
  disabled,
}: DateRangePickerProps) {
  return (
    <div style={{ display: 'flex', gap: 'var(--od-space-3)', flexWrap: 'wrap' }}>
      <Input
        label={fromLabel}
        type="date"
        value={value.from}
        max={value.to || undefined}
        disabled={disabled}
        onChange={(e) => {
          onChange({ ...value, from: e.target.value });
        }}
      />
      <Input
        label={toLabel}
        type="date"
        value={value.to}
        min={value.from || undefined}
        disabled={disabled}
        onChange={(e) => {
          onChange({ ...value, to: e.target.value });
        }}
      />
    </div>
  );
}
