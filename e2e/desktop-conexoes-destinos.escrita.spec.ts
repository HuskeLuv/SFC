import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiDelete, apiPost, writesAllowed } from './helpers/api';

/**
 * Escolher o destino na importação Open Finance (fatia D) que GRAVA — projeto `escrita`, 1280.
 *
 * Contra o servidor de verdade (sem mocks): só com E2E_ALLOW_WRITES=1 E as chaves
 * PLUGGY_HABILITADO=true, PLUGGY_DESTINOS_HABILITADO=true e MOVER_CAIXA_RF_HABILITADO=true no
 * servidor e no ambiente do teste (as chaves são do servidor, lidas em runtime; o Playwright lê a
 * MESMA variável — ver e2e/helpers/moverRf.ts). O CI não liga as chaves: este arquivo pula.
 *
 * O teste cria, direto no banco (Prisma), uma conexão de teste do usuário demo com um CDB 102% CDI
 * pendente, roda a importação real (POST /api/pluggy/carteira/importar), confere em Conexões o
 * aviso "para conferir", o selo e a coluna "Na Carteira em", escolhe Reserva Emergência pela rota
 * de destinos, confere o Desfazer (volta à Renda Fixa e à fila) e APAGA tudo o que criou: a
 * posição (rota do "Excluir"), a origem da importação, o Asset sintético, o histórico do teste e a
 * conexão (que leva o BankInvestment junto). Afirma só sobre o que criou.
 */

const SUFIXO = Date.now();
const ITEM = `e2e-destinos-${SUFIXO}`;
const NOME = `CDB E2E destinos ${SUFIXO}`;
const DEMO = 'usuario.demo@finapp.local';

const chavesLigadas = () =>
  process.env.PLUGGY_HABILITADO === 'true' &&
  process.env.PLUGGY_DESTINOS_HABILITADO === 'true' &&
  process.env.MOVER_CAIXA_RF_HABILITADO === 'true';

test.describe.configure({ mode: 'serial' });

test('CDB importado: para conferir → Reserva Emergência → Desfazer volta à fila', async ({
  page,
}) => {
  test.skip(!writesAllowed(), 'E2E_ALLOW_WRITES desligado');
  test.skip(!chavesLigadas(), 'chaves PLUGGY_HABILITADO/PLUGGY_DESTINOS_HABILITADO desligadas');
  test.setTimeout(240_000);

  const prisma = new PrismaClient();
  const criado = {
    conexaoId: null as string | null,
    investimentoId: null as string | null,
    portfolioId: null as string | null,
    assetId: null as string | null,
  };
  try {
    const demo = await prisma.user.findUnique({ where: { email: DEMO }, select: { id: true } });
    expect(demo, 'usuário demo do seed').not.toBeNull();
    const conexao = await prisma.bankConnection.create({
      data: {
        userId: demo!.id,
        providerItemId: ITEM,
        connectorId: 999001,
        connectorName: 'Banco E2E destinos',
        isSandbox: true,
        status: 'UPDATED',
        lastSyncAt: new Date(),
      },
    });
    criado.conexaoId = conexao.id;
    const agora = new Date();
    const inv = await prisma.bankInvestment.create({
      data: {
        connectionId: conexao.id,
        userId: demo!.id,
        providerInvestmentId: `${ITEM}-cdb`,
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        name: NOME,
        balance: 15000,
        amountOriginal: 14500,
        rate: 102,
        rateType: 'CDI',
        issueDate: new Date('2026-01-15T00:00:00.000Z'),
        dueDate: new Date('2030-01-15T00:00:00.000Z'),
        issuer: 'Banco E2E',
        status: 'ACTIVE',
        providerDate: agora,
        importStatus: 'pendente',
      },
    });
    criado.investimentoId = inv.id;

    // Importação real: o CDB entra na Renda Fixa (lugar sugerido) e fica para conferir.
    const imp = await apiPost<{ importados: number; paraRevisar?: number }>(
      page,
      '/api/pluggy/carteira/importar',
      {},
    );
    expect(imp.importados).toBeGreaterThanOrEqual(1);
    expect(imp.paraRevisar ?? 0).toBeGreaterThanOrEqual(1);
    const depois = await prisma.bankInvestment.findUniqueOrThrow({ where: { id: inv.id } });
    expect(depois.importStatus).toBe('importado');
    expect(depois.destinoConfirmadoEm).toBeNull();
    criado.portfolioId = depois.portfolioId;
    criado.assetId = depois.assetId;

    // Conexões: aviso, selo e coluna.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/conexoes-bancarias', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-destinos-aviso]')).toBeVisible({ timeout: 60_000 });
    const tabela = page.getByRole('table', { name: 'Investimentos importados' });
    const linha = tabela.getByRole('row').filter({ hasText: NOME });
    await expect(linha.getByText('Novo · conferir')).toBeVisible();
    await expect(linha.getByRole('link', { name: /^Ver Renda Fixa/ })).toHaveAttribute(
      'href',
      '/carteira?aba=renda-fixa',
    );

    // Escolhe Reserva Emergência (mesma rota que a revisão chama).
    const r = await apiPost<{ aplicados: number; historicoIds: string[] }>(
      page,
      '/api/pluggy/carteira/destinos',
      { itens: [{ id: inv.id, categoria: 'reservaEmergencia' }], confirmarIds: [inv.id] },
    );
    expect(r.aplicados).toBe(1);
    expect(r.historicoIds).toHaveLength(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(linha.getByRole('link', { name: /^Ver Reserva Emergência/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(linha.getByText('Novo · conferir')).toHaveCount(0);

    // Desfazer: volta à sugestão (Renda Fixa) e à fila.
    await apiPost(page, `/api/historico-alteracoes/${r.historicoIds[0]}/undo`, {});
    const desfeito = await prisma.bankInvestment.findUniqueOrThrow({ where: { id: inv.id } });
    expect(desfeito.destinoConfirmadoEm).toBeNull();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(linha.getByRole('link', { name: /^Ver Renda Fixa/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(linha.getByText('Novo · conferir')).toBeVisible();
  } finally {
    // Limpeza: só o que este teste criou.
    if (criado.portfolioId) {
      await apiDelete(page, `/api/ativos/${criado.portfolioId}/portfolio`).catch((e: unknown) =>
        test.info().annotations.push({ type: 'limpeza', description: String(e) }),
      );
      await prisma.userChangeLog.deleteMany({ where: { entityId: criado.portfolioId } });
      await prisma.portfolio.deleteMany({ where: { id: criado.portfolioId } });
    }
    if (criado.assetId) {
      await prisma.pluggyImportacaoOrigem.deleteMany({ where: { assetId: criado.assetId } });
      await prisma.fixedIncomeAsset.deleteMany({ where: { assetId: criado.assetId } });
      await prisma.stockTransaction.deleteMany({ where: { assetId: criado.assetId } });
      await prisma.asset.deleteMany({ where: { id: criado.assetId, source: 'pluggy' } });
    }
    if (criado.conexaoId) {
      await prisma.bankConnection.deleteMany({ where: { id: criado.conexaoId } });
    }
    await prisma.$disconnect();
  }
});
