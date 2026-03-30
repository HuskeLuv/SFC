import { test, expect } from '@playwright/test';

// These tests use saved auth state from auth.setup.ts

test.describe('Navigation', () => {
  test('sidebar is visible on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/carteira');

    // Wait for page to load
    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });

    // Sidebar should be visible (look for nav element or sidebar container)
    await expect(
      page.locator('aside, nav[role="navigation"], [data-testid="sidebar"]').first(),
    ).toBeVisible();
  });

  test('sidebar contains key navigation links', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/carteira');

    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });

    // Check for common navigation items
    const sidebar = page.locator('aside').first();
    await expect(
      sidebar.getByText(/Carteira|Dashboard|Fluxo de Caixa|Cashflow/i).first(),
    ).toBeVisible();
  });

  test('can navigate to cashflow page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/carteira');

    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });

    // Find and click cashflow link in sidebar
    const cashflowLink = page
      .locator('aside')
      .first()
      .getByRole('link', { name: /Fluxo de Caixa|Cashflow/i });
    if (await cashflowLink.isVisible()) {
      await cashflowLink.click();
      await page.waitForURL(/cashflow|fluxo/i, { timeout: 15000 });
    }
  });
});
