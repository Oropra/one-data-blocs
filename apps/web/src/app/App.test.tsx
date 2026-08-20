import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App bootstrap', () => {
  it('renders the application root', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'One Data' })).toBeInTheDocument();
  });
});
