import { test, expect } from '@playwright/test';

// These tests use saved auth state from auth.setup.ts

test.describe('Carteira Dashboard', () => {
  test('loads /carteira and shows portfolio content', async ({ page }) => {
    await page.goto('/carteira');

    await expect(page).toHaveURL(/carteira/);
    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });
  });

  test('shows Resumo and Análise tabs', async ({ page }) => {
    await page.goto('/carteira');

    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Análise' })).toBeVisible();
  });

  test('clicking Análise tab switches content', async ({ page }) => {
    await page.goto('/carteira');

    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Análise' }).click();

    await expect(page.getByRole('button', { name: 'Rentabilidade Geral' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('Resumo tab shows portfolio data', async ({ page }) => {
    await page.goto('/carteira');

    await expect(page.getByRole('button', { name: 'Resumo' })).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole('heading', { name: 'Carteira de Investimentos' })).toBeVisible({
      timeout: 15000,
    });
  });
});
