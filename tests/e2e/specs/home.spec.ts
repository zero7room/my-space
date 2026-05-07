import { test, expect } from '@playwright/test';

/**
 * v1 smoke E2E. Expects bot-runtime + web to be running locally.
 *
 * Set WEB_BASE_URL and BEARER for CI runs.
 */
test('home renders top-level navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('AI Workflow')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Threads' })).toBeVisible();
});
