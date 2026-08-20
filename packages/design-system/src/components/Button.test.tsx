import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enregistrer
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
