import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'a', label: 'Onglet A', panel: <p>Panneau A</p> },
  { id: 'b', label: 'Onglet B', panel: <p>Panneau B</p> },
  { id: 'c', label: 'Onglet C', panel: <p>Panneau C</p>, disabled: true },
];

describe('Tabs', () => {
  it('switches panels on click', async () => {
    render(<Tabs tabs={tabs} aria-label="Sections" />);
    expect(screen.getByText('Panneau A')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Onglet B' }));
    expect(screen.getByText('Panneau B')).toBeInTheDocument();
    expect(screen.queryByText('Panneau A')).not.toBeInTheDocument();
  });

  it('supports arrow-key navigation and skips disabled tabs', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} aria-label="Sections" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Onglet A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Onglet B' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});
