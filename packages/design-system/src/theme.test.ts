import { describe, expect, it } from 'vitest';
import { applyTenantBranding, resetTenantBranding } from './theme';

describe('applyTenantBranding', () => {
  it('applies valid hex colors to the allowlisted properties', () => {
    const el = document.createElement('div');
    applyTenantBranding({ primaryColor: '#123456', accentColor: '#abcdef' }, el);
    expect(el.style.getPropertyValue('--od-color-primary')).toBe('#123456');
    expect(el.style.getPropertyValue('--od-color-accent')).toBe('#abcdef');
  });

  it('rejects invalid or unsafe values', () => {
    const el = document.createElement('div');
    applyTenantBranding(
      { primaryColor: 'red; } body { display:none', accentColor: 'url(evil)' },
      el,
    );
    expect(el.style.getPropertyValue('--od-color-primary')).toBe('');
    expect(el.style.getPropertyValue('--od-color-accent')).toBe('');
  });

  it('reset removes overrides', () => {
    const el = document.createElement('div');
    applyTenantBranding({ primaryColor: '#123456' }, el);
    resetTenantBranding(el);
    expect(el.style.getPropertyValue('--od-color-primary')).toBe('');
  });
});
