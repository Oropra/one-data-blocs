import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('associates label, hint and error with the control', () => {
    render(<Input label="Email" hint="Format attendu" error="Email invalide" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/format attendu/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Email invalide');
  });
});
