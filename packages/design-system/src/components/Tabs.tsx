import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled active tab id. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  'aria-label': string;
}

/** Tabs with arrow-key navigation per the WAI-ARIA tabs pattern. */
export function Tabs({ tabs, value, defaultValue, onChange, 'aria-label': ariaLabel }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id);
  const activeId = value ?? internal;

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const index = enabled.findIndex((t) => t.id === activeId);
    if (index === -1) return;
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabled.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      const tab = enabled[next];
      if (tab) {
        select(tab.id);
        document.getElementById(`${baseId}-trigger-${tab.id}`)?.focus();
      }
    }
  };

  const active = tabs.find((t) => t.id === activeId);

  return (
    <div className="od-tabs">
      <div className="od-tabs__list" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${baseId}-trigger-${tab.id}`}
            type="button"
            role="tab"
            className="od-tabs__trigger"
            aria-selected={tab.id === activeId}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={tab.id === activeId ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => {
              select(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-trigger-${active.id}`}
          className="od-tabs__panel"
          tabIndex={0}
        >
          {active.panel}
        </div>
      ) : null}
    </div>
  );
}
