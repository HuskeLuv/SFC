import { test, expect } from '@playwright/test';

// These tests do NOT use saved auth state — they test the login flow itself
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('shows login form with email and password fields', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByPlaceholder('Digite seu email')).toBeVisible();
    await expect(page.getByPlaceholder('Digite sua senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });

  test('shows validation error on empty form submission', async ({ page }) => {
    await page.goto('/signin');

    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('Preencha todos os campos obrigatórios')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/signin');

    await page.getByPlaceholder('Digite seu email').fill('wrong@email.com');
    await page.getByPlaceholder('Digite sua senha').fill('wrongpassword');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText(/erro|inválid|incorret/i)).toBeVisible({ timeout: 10000 });
  });

  test('successful login redirects to /carteira', async ({ page }) => {
    await page.goto('/signin');

    await page.getByPlaceholder('Digite seu email').fill('usuario.demo@finapp.local');
    await page.getByPlaceholder('Digite sua senha').fill('123456');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await page.waitForURL('**/carteira', { timeout: 15000 });
    await expect(page).toHaveURL(/carteira/);
  });

  test('unauthenticated access to /carteira redirects to /signin', async ({ page }) => {
    await page.goto('/carteira');

    await page.waitForURL('**/signin', { timeout: 15000 });
    await expect(page).toHaveURL(/signin/);
  });
});
