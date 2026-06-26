import { test, expect } from '@playwright/test';

/**
 * Verifica a mudança de UI do Gap #1: a linha-espelho de um sonho (🎯) no fluxo
 * de caixa, que era read-only, agora ENTRA no modo de edição com valores
 * editáveis (mas nome/rank travados). É o que permite o cliente lançar o
 * realizado e pintar de verde.
 */
test('linha 🎯 de objetivo vira editável (valores) no modo de edição do grupo', async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Login (igual ao auth.setup)
  await page.goto('/signin');
  await page.getByPlaceholder('Digite seu email').fill('usuario.demo@finapp.local');
  await page.getByPlaceholder('Digite sua senha').fill('123456');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/carteira', { timeout: 60_000 });

  // Garante que os 6 sonhos padrão (+ linhas-espelho 🎯) estão provisionados.
  await page.request.get('/api/planejamento-sonhos');

  await page.goto('/fluxodecaixa');

  // Acha a linha-cabeçalho do grupo "Planejamento Financeiro".
  const groupRow = page.locator('tr', { hasText: 'Planejamento Financeiro' }).first();
  await expect(groupRow).toBeVisible({ timeout: 60_000 });

  // Se o grupo estiver recolhido, expande (clica no cabeçalho).
  let objetivoRow = page.locator('tr', { hasText: '🎯' }).first();
  if (!(await objetivoRow.isVisible().catch(() => false))) {
    await groupRow.click();
  }
  await expect(objetivoRow).toBeVisible({ timeout: 15_000 });

  // Fora do modo de edição: a linha 🎯 NÃO tem input (é read-only).
  await expect(objetivoRow.locator('input')).toHaveCount(0);

  // Entra no modo de edição do grupo.
  await groupRow.getByRole('button', { name: 'Editar grupo' }).click();

  // Agora a linha 🎯 deve ter inputs (células de valor editáveis).
  objetivoRow = page.locator('tr', { hasText: '🎯' }).first();
  await expect(objetivoRow).toBeVisible();
  const inputs = objetivoRow.locator('input');
  await expect(inputs.first()).toBeVisible({ timeout: 15_000 });
  const count = await inputs.count();
  expect(count, 'a linha 🎯 deve ter células de valor editáveis').toBeGreaterThan(0);
  console.log(`OK: linha 🎯 ficou editável com ${count} input(s) de valor.`);
});
