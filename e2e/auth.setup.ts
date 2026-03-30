import { test as setup, expect } from '@playwright/test';

setup('authenticate as demo user', async ({ page }) => {
  await page.goto('/signin');

  await page.getByPlaceholder('Digite seu email').fill('usuario.demo@finapp.local');
  await page.getByPlaceholder('Digite sua senha').fill('123456');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  // Wait for redirect to /carteira
  await page.waitForURL('**/carteira', { timeout: 15000 });
  await expect(page).toHaveURL(/carteira/);

  // Save signed-in state
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
