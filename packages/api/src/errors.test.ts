import { describe, expect, it } from 'vitest';
import { AppError, normalizeError, unwrap } from './errors';

describe('normalizeError', () => {
  it('maps known Postgres codes to user-safe French messages', () => {
    const err = normalizeError({ code: '23505', message: 'duplicate key value' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('23505');
    expect(err.message).toBe('Un élément identique existe déjà.');
    expect(err.message).not.toContain('duplicate key');
  });

  it('maps permission errors', () => {
    expect(normalizeError({ code: '42501' }).message).toContain('droits');
  });

  it('maps network failures to a connectivity message', () => {
    const err = normalizeError({ message: 'Failed to fetch' });
    expect(err.code).toBe('NETWORK');
  });

  it('falls back to a generic message for unknown errors', () => {
    const err = normalizeError(new Error('select * from secret_table'));
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).not.toContain('secret_table');
  });

  it('passes AppError through unchanged', () => {
    const original = new AppError('X', 'Déjà normalisé');
    expect(normalizeError(original)).toBe(original);
  });
});

describe('unwrap', () => {
  it('returns data on success', () => {
    expect(unwrap({ data: 42, error: null })).toBe(42);
  });
  it('throws a normalized error on failure', () => {
    expect(() => unwrap({ data: null, error: { code: '23505' } })).toThrow(AppError);
  });
});
