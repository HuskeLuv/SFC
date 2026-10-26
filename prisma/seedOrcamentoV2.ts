/**
 * Usuário de e2e do Orçamento v2 (ticket 86e3v8p3u, desenho técnico §8/§9 PR 13):
 * orcamento.v2@finapp.local / 123456. O usuário demo NÃO entra no beta (os snapshots atuais de
 * orcamento-* e planilha-* não mudam); este usuário existe só para e2e/{desktop,mobile}-orcamento-v2.
 *
 * Idempotente: cada execução zera o Fluxo de Caixa e o orçamento DESTE usuário e monta de novo
 * (as specs de e2e gravam orçados, copiam mês e criam/excluem subcategorias).
 *
 *  1. Personaliza Entradas e Despesas (`personalizeGroup`, o mesmo caminho do app) e lança
 *     valores sintéticos no ano anterior e no corrente.
 *  2. Uma meta da tela antiga (Habitação) que a ativação copia para a Geral.
 *  3. Ativa pela função de produção (`ativarOrcamentoV2`, a mesma do script ativar.ts) e inclui no
 *     beta pela mesma `gravarBeta` do script beta.ts (só depois de ativado e verificado).
 *  4. Orçados por subcategoria em todos os meses dos dois anos: Supermercado muda mês a mês (a
 *     spec de copiar confere que o mês aberto recebe o valor do anterior); Restaurantes e Uber
 *     ficam SEM orçado (as specs de edição gravam neles; "copiar" não toca sub sem orçado na
 *     origem, então desktop e celular podem rodar juntos).
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { gravarBeta } from '../scripts/orcamento-v2/beta';

export const EMAIL_ORCAMENTO_V2 = 'orcamento.v2@finapp.local';
const SENHA = '123456';

/** Orçado de Supermercado no mês (0–11): muda todo mês, para o "copiar" ter efeito visível. */
export const orcadoSupermercado = (mes0: number) => 1000 + 10 * mes0;

const RECEITAS: Record<string, number> = { Salário: 12000 };

/** Valores mensais por subcategoria (nomes únicos nos templates de Despesas). */
const DESPESAS: Record<string, number[]> = {
  'Aluguel / Prestação': Array(12).fill(2500),
  Supermercado: [980, 1010, 1040, 990, 1060, 1020, 1100, 1080, 1050, 1070, 1030, 1120],
  'Conta de energia': [190, 185, 200, 195, 210, 205, 220, 215, 200, 195, 190, 185],
  Internet: Array(12).fill(120),
  Combustível: [380, 420, 400, 410, 390, 430, 450, 440, 420, 410, 400, 460],
  Uber: [90, 110, 100, 120, 115, 130, 125, 135, 110, 100, 105, 120],
  'Plano de Saúde': Array(12).fill(720),
  Restaurantes: [350, 420, 380, 450, 470, 430, 460, 480, 420, 410, 430, 440],
};

/** Orçados fixos por subcategoria (todos os meses). Supermercado varia (orcadoSupermercado). */
const ORCADOS_FIXOS: Record<string, number> = {
  'Aluguel / Prestação': 2500,
  'Conta de energia': 210,
  Combustível: 420,
  'Plano de Saúde': 720,
};

/** Meta mensal da tela antiga para a categoria Habitação (vai para a Geral na ativação). */
const META_HABITACAO = 4500;

async function idDoItem(prisma: PrismaClient, userId: string, nome: string): Promise<string> {
  const itens = await prisma.cashflowItem.findMany({
    where: { userId, name: nome, hidden: false },
    select: { id: true },
  });
  if (itens.length !== 1) {
    throw new Error(`Orçamento v2 (seed): esperava 1 item "${nome}", achou ${itens.length}`);
  }
  return itens[0].id;
}

/** Cria/recria o usuário de e2e do Orçamento v2, ativado e no beta. Idempotente. */
export async function seedOrcamentoV2(prisma: PrismaClient): Promise<{ status: string }> {
  const password = await bcrypt.hash(SENHA, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL_ORCAMENTO_V2 },
    update: { password, name: 'Usuário Orçamento v2', role: UserRole.user },
    create: {
      email: EMAIL_ORCAMENTO_V2,
      password,
      name: 'Usuário Orçamento v2',
      role: UserRole.user,
    },
  });
  const userId = user.id;

  // Zera o que as execuções anteriores (e os e2e) deixaram. Orçados antes dos itens (FK NoAction).
  await prisma.featureBetaUser.deleteMany({ where: { userId, recurso: 'orcamento-v2' } });
  await prisma.cashflowOrcamentoItem.deleteMany({ where: { userId } });
  await prisma.cashflowOrcamentoPrefs.deleteMany({ where: { userId } });
  await prisma.cashflowOrcamento.deleteMany({ where: { userId } });
  await prisma.cashflowValue.deleteMany({ where: { userId } });
  await prisma.cashflowItem.deleteMany({ where: { userId } });
  await prisma.cashflowGroup.deleteMany({ where: { userId } });

  // As funções de produção usam o prisma global de src/lib/prisma: import tardio (como o
  // seedAnaliseAtivos), depois de o seed ter montado os templates.
  const [{ personalizeGroup }, { ativarOrcamentoV2 }, { default: prismaApp }] = await Promise.all([
    import('../src/utils/cashflowPersonalization'),
    import('../src/services/cashflow/orcamentoV2/ativacao'),
    import('../src/lib/prisma'),
  ]);

  try {
    // 1. Estrutura do usuário (overrides dos templates) e valores sintéticos.
    for (const nome of ['Entradas', 'Despesas']) {
      const template = await prisma.cashflowGroup.findFirst({
        where: { userId: null, parentId: null, name: nome },
        select: { id: true },
      });
      if (!template) throw new Error(`Orçamento v2 (seed): template "${nome}" não encontrado`);
      await personalizeGroup(template.id, userId);
    }

    const anoAtual = new Date().getFullYear();
    const anos = [anoAtual - 1, anoAtual];
    const valores: {
      itemId: string;
      userId: string;
      year: number;
      month: number;
      value: number;
    }[] = [];
    const series: Record<string, number[]> = {
      ...Object.fromEntries(Object.entries(RECEITAS).map(([n, v]) => [n, Array(12).fill(v)])),
      ...DESPESAS,
    };
    const ids = new Map<string, string>();
    for (const nome of [...Object.keys(series), ...Object.keys(ORCADOS_FIXOS)]) {
      if (!ids.has(nome)) ids.set(nome, await idDoItem(prisma, userId, nome));
    }
    for (const [nome, serie] of Object.entries(series)) {
      for (const year of anos) {
        serie.forEach((value, month) =>
          valores.push({ itemId: ids.get(nome)!, userId, year, month, value }),
        );
      }
    }
    await prisma.cashflowValue.createMany({ data: valores, skipDuplicates: true });

    // 2. Meta da tela antiga na categoria Habitação (id do override do usuário).
    const habitacao = await prisma.cashflowGroup.findFirst({
      where: { userId, name: 'Habitação', hidden: false },
      select: { id: true },
    });
    if (!habitacao) throw new Error('Orçamento v2 (seed): categoria Habitação não encontrada');
    await prisma.cashflowOrcamento.createMany({
      data: anos.map((year) => ({
        userId,
        groupId: habitacao.id,
        tipo: 'grupo',
        year,
        tipoMeta: 'valor',
        valor: META_HABITACAO,
      })),
      skipDuplicates: true,
    });

    // 3. Ativação (fases A/B/C, com verificação) e beta, como `ativar.ts --aplicar --beta`.
    const relatorio = await ativarOrcamentoV2(userId, { dryRun: false });
    if (relatorio.status !== 'ativado' && relatorio.status !== 'ja_ativado') {
      throw new Error(
        `Orçamento v2 (seed): ativação ${relatorio.status}${relatorio.motivo ? ` (${relatorio.motivo})` : ''}`,
      );
    }
    await gravarBeta(prisma, 'adicionar', [{ id: userId, email: user.email }], 'seed', 'e2e');

    // 4. Orçados por subcategoria (os itens continuam os mesmos: a ativação só cria as Gerais).
    const orcados: { userId: string; itemId: string; ano: number; mes: number; valor: number }[] =
      [];
    for (const ano of anos) {
      for (let mes = 0; mes < 12; mes++) {
        orcados.push({
          userId,
          itemId: ids.get('Supermercado')!,
          ano,
          mes,
          valor: orcadoSupermercado(mes),
        });
        for (const [nome, valor] of Object.entries(ORCADOS_FIXOS)) {
          orcados.push({ userId, itemId: ids.get(nome)!, ano, mes, valor });
        }
      }
    }
    await prisma.cashflowOrcamentoItem.createMany({ data: orcados, skipDuplicates: true });

    return { status: relatorio.status };
  } finally {
    await prismaApp.$disconnect();
  }
}
