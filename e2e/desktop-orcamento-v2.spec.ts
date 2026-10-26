import { test, expect, type Page } from '@playwright/test';
import { writesAllowed } from './helpers/api';
import {
  ORCAMENTO_V2_STORAGE,
  brl,
  exigirOrcamentoV2,
  gotoOrcamentoV2,
  isPutOrcado,
  payloadV2,
  prepararPagina,
  valorDaSub,
  valorNovo,
} from './helpers/orcamentoV2';

/**
 * Orçamento v2 no desktop (projeto `chromium`, 1280 px) — e2e mínimos da E1 (desenho técnico §9,
 * PR 13). Usuário próprio do seed (orcamento.v2@finapp.local, ativado e no beta); pula sem a flag
 * ORCAMENTO_V2_HABILITADO (e2e/helpers/orcamentoV2.ts). Sem snapshots visuais.
 *
 * Os que gravam (orçado, copiar, excluir) só rodam com E2E_ALLOW_WRITES=1 e só no que o seed
 * deixou para eles: Restaurantes (Lazer) sem orçado para editar; Supermercado (Habitação) com
 * orçado diferente em cada mês para o copiar; a subcategoria excluída é criada pelo próprio teste.
 */

test.use({ storageState: ORCAMENTO_V2_STORAGE, viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await exigirOrcamentoV2(page);
});

/** Tabela carregada (o esqueleto some e as linhas de categoria aparecem). */
async function esperarTabela(page: Page) {
  await expect(page.locator('[data-mf-orcamento-v2-rolagem]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('tr[data-mf-linha="categoria"]').first()).toBeVisible();
}

test('aba Orçamento abre o v2 (tabela por categoria), não a tela antiga', async ({ page }) => {
  await page.goto('/fluxodecaixa', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Orçamento', exact: true }).click();

  await expect(page.locator('[data-mf-orcamento-v2]')).toBeVisible({ timeout: 60_000 });
  await esperarTabela(page);
  await expect(page.getByRole('columnheader', { name: 'Orçado (R$)' })).toBeVisible();
  await expect(page.locator('[data-mf-orcamento-nivel]')).toHaveCount(0);
  await expect(page.locator('tr[data-mf-linha="sub"]').first()).toBeVisible();
  // A Geral de cada categoria vem marcada como "padrão".
  await expect(page.locator('tr[data-mf-linha="sub"]', { hasText: 'Geral' }).first()).toBeVisible();
});

test.describe('gravação', () => {
  test.beforeEach(() => {
    test.skip(!writesAllowed(), 'grava no banco: só com E2E_ALLOW_WRITES=1');
  });

  test('editar o orçado de uma subcategoria persiste depois do reload', async ({ page }) => {
    const valor = valorNovo();
    await gotoOrcamentoV2(page);
    await esperarTabela(page);

    const campo = page.getByRole('textbox', { name: 'Orçado de Restaurantes em Lazer' });
    await campo.fill(String(valor));
    const salvo = page.waitForResponse(isPutOrcado);
    await campo.press('Enter');
    expect((await salvo).ok(), 'PUT do orçado').toBeTruthy();
    await expect(campo).toHaveValue(brl(valor));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mf-orcamento-v2]')).toBeVisible({ timeout: 60_000 });
    await esperarTabela(page);
    await expect(
      page.getByRole('textbox', { name: 'Orçado de Restaurantes em Lazer' }),
    ).toHaveValue(brl(valor));
  });

  test('copiar o mês anterior substitui o orçado do mês aberto', async ({ page }) => {
    const aberto = await payloadV2(page);
    const origem = await payloadV2(page, aberto.copiarDe);
    expect(aberto.copiarDe.temOrcado, 'o seed orça o mês anterior').toBeTruthy();
    const esperado = valorDaSub(origem, 'Habitação', 'Supermercado');
    expect(esperado, 'Supermercado orçado no mês anterior').not.toBeNull();

    await gotoOrcamentoV2(page);
    await esperarTabela(page);

    // O mês aberto já tem orçado: o botão pergunta (Q8) — "Substituir tudo".
    await page.getByRole('button', { name: /^Copiar de / }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('já tem orçados')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Substituir tudo' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText(/^Orçado de .+ copiado/)).toBeVisible();

    await expect(
      page.getByRole('textbox', { name: 'Orçado de Supermercado em Habitação' }),
    ).toHaveValue(brl(esperado!));
    const depois = await payloadV2(page, { ano: aberto.ano, mes: aberto.mes });
    expect(valorDaSub(depois, 'Habitação', 'Supermercado')).toBe(esperado);
  });

  test('excluir uma subcategoria pede confirmação e a remove', async ({ page }) => {
    const nome = `E2E v2 ${Date.now()}`;
    await gotoOrcamentoV2(page);
    await esperarTabela(page);

    // Cria a própria subcategoria (nada do seed é excluído: o teste pode rodar de novo).
    await page.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }).click();
    const novo = page.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    await novo.fill(nome);
    await novo.press('Enter');
    const linha = page.locator('tr[data-mf-linha="sub"]', { hasText: nome });
    await expect(linha).toBeVisible();

    await linha.getByRole('button', { name: `Mais ações de ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Excluir subcategoria' }).click();

    const confirmacao = page.locator('[data-mf-confirmar-exclusao]');
    await expect(confirmacao.getByText(`Excluir “${nome}”?`)).toBeVisible();
    await expect(confirmacao.getByText('não tem lançamentos no Fluxo de Caixa')).toBeVisible();
    // Cancelar não exclui.
    await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmacao).toBeHidden();
    await expect(linha).toBeVisible();

    await linha.getByRole('button', { name: `Mais ações de ${nome}` }).click();
    await page.getByRole('menuitem', { name: 'Excluir subcategoria' }).click();
    const excluir = confirmacao.getByRole('button', { name: 'Excluir', exact: true });
    await expect(excluir).toBeEnabled();
    await excluir.click();

    await expect(confirmacao).toBeHidden();
    await expect(linha).toHaveCount(0);
    await expect(page.getByText('Subcategoria excluída')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await esperarTabela(page);
    await expect(page.locator('tr[data-mf-linha="sub"]', { hasText: nome })).toHaveCount(0);
  });
});
