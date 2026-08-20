/**
 * Tenant branding: maps validated tenant configuration onto a safe allowlist of
 * CSS custom properties. Arbitrary CSS injection is impossible by construction:
 * only these keys may be set, and values must pass the hex-color guard.
 */
export interface TenantBranding {
  logoUrl?: string | undefined;
  groupName?: string | undefined;
  primaryColor?: string | undefined;
  accentColor?: string | undefined;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const BRAND_PROPERTY_MAP = {
  primaryColor: '--od-color-primary',
  accentColor: '--od-color-accent',
} as const;

/**
 * Applies tenant brand overrides to the given element (defaults to <html>).
 * Invalid colors are ignored so a malformed control-plane payload can never
 * break rendering or inject CSS.
 */
export function applyTenantBranding(
  branding: TenantBranding,
  target: HTMLElement = document.documentElement,
): void {
  for (const [key, property] of Object.entries(BRAND_PROPERTY_MAP)) {
    const value = branding[key as keyof typeof BRAND_PROPERTY_MAP];
    if (typeof value === 'string' && HEX_COLOR.test(value.trim())) {
      target.style.setProperty(property, value.trim());
    }
  }
}

export function resetTenantBranding(target: HTMLElement = document.documentElement): void {
  for (const property of Object.values(BRAND_PROPERTY_MAP)) {
    target.style.removeProperty(property);
  }
}
