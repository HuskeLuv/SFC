import { test as setup, expect } from '@playwright/test';
import { ORCAMENTO_V2_STORAGE } from './helpers/orcamentoV2';

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

/**
 * Orçamento v2 (PR 13): sessão do usuário próprio do seed (prisma/seedOrcamentoV2.ts), usada só
 * pelas specs *-orcamento-v2. Banco sem esse usuário (seed antigo): grava uma sessão vazia em vez
 * de falhar — o setup é dependência de todos os projetos e as specs do v2 pulam sem sessão.
 */
setup('authenticate as orçamento v2 user', async ({ page }) => {
  await page.goto('/signin');

  await page.getByPlaceholder('Digite seu email').fill('orcamento.v2@finapp.local');
  await page.getByPlaceholder('Digite sua senha').fill('123456');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  const entrou = await page
    .waitForURL('**/carteira', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!entrou) {
    setup.info().annotations.push({
      type: 'orçamento v2',
      description: 'orcamento.v2@finapp.local não entrou (rode o seed): sessão vazia',
    });
    await page.context().clearCookies();
  }

  await page.context().storageState({ path: ORCAMENTO_V2_STORAGE });
});
