import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('opens as a modal and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirmer">
        <p>Contenu</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirmer' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays closed when open=false', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Confirmer">
        <p>Contenu</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog', { name: 'Confirmer' })).not.toBeInTheDocument();
  });
});
