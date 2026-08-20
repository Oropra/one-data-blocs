import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('application bootstraps', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'One Data' })).toBeVisible();
  });
});
