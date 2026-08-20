import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Modal dialog built on the native <dialog> element: focus trap, Escape
 * handling and top-layer rendering come from the platform.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Guard: jsdom and very old browsers lack showModal; fall back to the open attribute.
    const canModal = typeof el.showModal === 'function';
    if (open && !el.open) {
      if (canModal) el.showModal();
      else el.setAttribute('open', '');
    }
    if (!open && el.open) {
      if (canModal) el.close();
      else el.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', handleCancel);
    // Fallback environments (jsdom, old browsers) have no modal Escape behavior;
    // listen at document level because focus may be on <body>.
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && typeof el.showModal !== 'function') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('cancel', handleCancel);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <dialog ref={ref} className="od-dialog" aria-labelledby="od-dialog-title">
      <h2 className="od-dialog__title" id="od-dialog-title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
