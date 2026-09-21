/**
 * Fase 3 — investimentos e empréstimos do banco entram sozinhos na Carteira e
 * em Dívidas.
 *
 * Regras:
 *  - o espelho (bank_investments / bank_loans) guarda a posição como o provedor
 *    devolve; a Carteira/Dívidas continuam a fonte de valor;
 *  - cada posição é importada UMA vez (importStatus) e fica vinculada; nas
 *    sincronizações seguintes só o espelho e o "valor atual" dos ativos
 *    manuais são atualizados;
 *  - ativo listado (ação/FII/ETF/BDR) usa o catálogo por ticker; se o usuário
 *    JÁ tem o ativo, só vincula (não duplica a posição);
 *  - renda fixa bancária vira Asset 'bond' + FixedIncomeAsset (marcação na
 *    curva pela taxa/indexador contratados, como o wizard);
 *  - fundo/previdência: pelo CNPJ no catálogo CVM quando existir; senão ativo
 *    manual cujo "valor atual" segue o saldo do banco;
 *  - empréstimo vira Dívida (financiamento) com espelho no fluxo de caixa;
 *  - COE, Tesouro e o que não der para mapear ficam 'sem-suporte' para o
 *    usuário cadastrar pelo wizard;
 *  - posição sintética (renda fixa, fundo/previdência sem catálogo) e dívida
 *    guardam uma ORIGEM estável (PluggyImportacaoOrigem): ao conectar o mesmo
 *    banco de novo — os ids do Pluggy mudam e o espelho antigo sumiu com a
 *    desconexão — o importador VINCULA à posição/dívida que já existe em vez
 *    de duplicar (bug 21/09/2026).
 */
import { createHash } from 'crypto';
import type { Investment, Loan } from 'pluggy-sdk';
import type { BankInvestment, BankLoan, FixedIncomeType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { syncDividaRecordToCashflow } from '@/services/dividas/dividaCashflowSync';
import { gerarCronograma } from '@/services/dividas/amortizacao';

export const NOTA_IMPORTACAO = 'Importado do banco (Open Finance)';

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dt = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ---------------------------------------------------------------------------
// Espelhos (chamados pelo sync)
// ---------------------------------------------------------------------------

export function mapInvestment(i: Investment, connectionId: string, userId: string) {
  const x = i as Investment & Record<string, unknown>;
  return {
    connectionId,
    userId,
    providerInvestmentId: i.id,
    type: String(i.type),
    subtype: i.subtype ? String(i.subtype) : null,
    name: i.name,
    code: (x.code as string | undefined) ?? null,
    isin: (x.isin as string | undefined) ?? null,
    number: (x.number as string | undefined) ?? null,
    balance: num(i.balance) ?? 0,
    quantity: num(x.quantity),
    unitValue: num(x.value),
    amountOriginal: num(x.amountOriginal),
    amountProfit: num(x.amountProfit),
    rate: num(x.rate),
    rateType: (x.rateType as string | undefined) ?? null,
    fixedAnnualRate: num(x.fixedAnnualRate),
    issueDate: dt(x.issueDate),
    dueDate: dt(x.dueDate),
    issuer: (x.issuer as string | undefined) ?? null,
    status: (x.status as string | undefined) ?? null,
    providerDate: dt(x.date),
    ativo: true,
  };
}

export function mapLoan(l: Loan, connectionId: string, userId: string) {
  const x = l as Loan & Record<string, unknown>;
  const rates = (x.interestRates as Array<Record<string, unknown>> | undefined) ?? [];
  const r0 = rates[0];
  const inst = (x.installments as Record<string, unknown> | undefined) ?? {};
  const taxa =
    r0 && (r0.referentialRateIndexerType === 'PRE_FIXADO' || r0.postFixedRate == null)
      ? num(r0.preFixedRate)
      : (num(r0?.postFixedRate) ?? num(r0?.preFixedRate));
  return {
    connectionId,
    userId,
    providerLoanId: l.id,
    contractNumber: (x.contractNumber as string | undefined) ?? null,
    productName: (x.productName as string | undefined) || 'Empréstimo',
    type: (x.type as string | undefined) ?? null,
    contractAmount: num(x.contractAmount),
    outstanding: num(x.totalRemainingAmount) ?? num(x.contractOutstandingBalance),
    nextInstallmentAmount: num(x.nextInstallmentAmount),
    cet: num(x.CET),
    annualRate: taxa,
    indexer: (r0?.referentialRateIndexerType as string | undefined) ?? null,
    amortization: (x.amortizationScheduled as string | undefined) ?? null,
    periodicity: (x.installmentPeriodicity as string | undefined) ?? null,
    totalInstallments: num(inst.totalNumberOfInstallments),
    paidInstallments: num(inst.paidInstallments),
    dueInstallments: num(inst.dueInstallments),
    pastDueInstallments: num(inst.pastDueInstallments),
    contractDate: dt(x.contractDate),
    firstInstallmentDueDate: dt(x.firstInstallmentDueDate),
    dueDate: dt(x.dueDate),
    ativo: true,
  };
}

// ---------------------------------------------------------------------------
// Mapeamentos de domínio
// ---------------------------------------------------------------------------

const LISTADOS = new Set(['EQUITY', 'ETF']);
const RF_BANCARIA = new Set([
  'CDB',
  'LCI',
  'LCA',
  'RDB',
  'LC',
  'LF',
  'CRI',
  'CRA',
  'DEBENTURE',
  'LIG',
]);
const ISENTOS = new Set(['LCI', 'LCA', 'CRI', 'CRA', 'LIG']);

export function tipoRendaFixa(subtype: string | null, rateType: string | null): FixedIncomeType {
  const base = subtype && RF_BANCARIA.has(subtype) && subtype !== 'DEBENTURE' ? subtype : 'CDB';
  const hib = rateType === 'IPCA';
  return `${base}_${hib ? 'HIB' : 'PRE'}` as FixedIncomeType;
}

export function indexadorRendaFixa(
  rateType: string | null,
  rate: number | null,
  fixedAnnualRate: number | null,
): { indexer: 'PRE' | 'CDI' | 'IPCA'; indexerPercent: number | null; annualRate: number } {
  const t = (rateType ?? '').toUpperCase();
  if (t.includes('IPCA'))
    return { indexer: 'IPCA', indexerPercent: 100, annualRate: fixedAnnualRate ?? 0 };
  if (t.includes('CDI') || t.includes('SELIC')) {
    return { indexer: 'CDI', indexerPercent: rate && rate > 0 ? rate : 100, annualRate: 0 };
  }
  return { indexer: 'PRE', indexerPercent: null, annualRate: rate ?? fixedAnnualRate ?? 0 };
}

export function tipoDivida(tipoProvedor: string | null): string {
  const t = (tipoProvedor ?? '').toUpperCase();
  if (t.includes('CONSIGN')) return 'consignado';
  if (t.includes('IMOBIL') || t.includes('HABITAC')) return 'financiamento_imobiliario';
  if (t.includes('VEIC')) return 'financiamento_veiculo';
  if (t.includes('CHEQUE') || t.includes('ADIANTAMENTO')) return 'cheque_especial';
  if (t.includes('CARTAO')) return 'cartao_credito';
  if (t.includes('PESSOAL')) return 'emprestimo_pessoal';
  return 'outro';
}

/** Taxa efetiva a.a. (fração) → a.m. (fração), limitada ao domínio da dívida (0..1). */
export function taxaAaParaAm(taxaAa: number | null): number {
  if (taxaAa == null || !Number.isFinite(taxaAa) || taxaAa <= 0) return 0;
  const am = Math.pow(1 + taxaAa, 1 / 12) - 1;
  return Math.min(1, Math.max(0, Math.round(am * 1_000_000) / 1_000_000));
}

function mesesEntre(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function prazoMesesDivida(
  loan: Pick<
    BankLoan,
    'totalInstallments' | 'periodicity' | 'firstInstallmentDueDate' | 'dueDate' | 'contractDate'
  >,
): number {
  const n = loan.totalInstallments;
  if (n && n >= 1 && n <= 480 && (loan.periodicity ?? 'MONTHLY') === 'MONTHLY') return n;
  const inicio = loan.firstInstallmentDueDate ?? loan.contractDate;
  if (inicio && loan.dueDate) {
    const m = mesesEntre(inicio, loan.dueDate) + 1;
    if (m >= 1 && m <= 480) return m;
  }
  return 12;
}

export function indexadorDivida(indexer: string | null): 'PREFIXADO' | 'TR' | 'IPCA' | 'CDI' {
  const t = (indexer ?? '').toUpperCase();
  if (t.includes('TR')) return 'TR';
  if (t.includes('IPCA')) return 'IPCA';
  if (t.includes('CDI')) return 'CDI';
  return 'PREFIXADO';
}

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Origem estável (não duplicar ao reconectar)
// ---------------------------------------------------------------------------

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const norm = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
const hash = (partes: Array<string | number | null | undefined>) =>
  createHash('sha256')
    .update(partes.map((p) => String(p ?? '')).join('|'))
    .digest('hex')
    .slice(0, 40);

/**
 * Identifica a MESMA aplicação vinda por outra conexão: instituição + tipo +
 * código (ISIN/código/número) + nome + emissor + datas. Nada de id do Pluggy
 * nem de saldo (mudam).
 */
export function chaveInvestimento(
  inv: Pick<
    BankInvestment,
    'type' | 'subtype' | 'isin' | 'code' | 'number' | 'name' | 'issuer' | 'issueDate' | 'dueDate'
  >,
  connectorId: number | null | undefined,
): string {
  return hash([
    'inv',
    connectorId,
    inv.type,
    inv.subtype,
    norm(inv.isin ?? inv.code ?? inv.number),
    norm(inv.name),
    norm(inv.issuer),
    dia(inv.issueDate),
    dia(inv.dueDate),
  ]);
}

/** Contrato do empréstimo; sem número, produto + data e valor contratados. */
export function chaveEmprestimo(
  loan: Pick<BankLoan, 'contractNumber' | 'productName' | 'contractDate' | 'contractAmount'>,
  connectorId: number | null | undefined,
): string {
  return loan.contractNumber
    ? hash(['loan', connectorId, norm(loan.contractNumber)])
    : hash([
        'loan',
        connectorId,
        norm(loan.productName),
        dia(loan.contractDate),
        loan.contractAmount != null ? Number(loan.contractAmount).toFixed(2) : '',
      ]);
}

/**
 * Posição já importada antes com a mesma origem e que ainda existe — e que
 * não está ligada a OUTRA aplicação desta sincronização (duas aplicações
 * idênticas no mesmo banco continuam sendo duas).
 */
async function origemInvestimento(userId: string, chave: string, invId: string) {
  const origem = await prisma.pluggyImportacaoOrigem.findUnique({
    where: { userId_chave: { userId, chave } },
  });
  if (!origem?.portfolioId) return null;
  const port = await prisma.portfolio.findFirst({
    where: { id: origem.portfolioId, userId },
    select: { id: true },
  });
  if (!port) return null;
  const ocupada = await prisma.bankInvestment.count({
    where: { portfolioId: port.id, ativo: true, id: { not: invId } },
  });
  return ocupada > 0 ? null : origem;
}

async function gravarOrigem(
  userId: string,
  chave: string,
  tipo: 'investimento' | 'emprestimo',
  alvo: { assetId?: string; portfolioId?: string; fixedIncomeAssetId?: string; dividaId?: string },
) {
  const data = {
    tipo,
    assetId: alvo.assetId ?? null,
    portfolioId: alvo.portfolioId ?? null,
    fixedIncomeAssetId: alvo.fixedIncomeAssetId ?? null,
    dividaId: alvo.dividaId ?? null,
  };
  await prisma.pluggyImportacaoOrigem.upsert({
    where: { userId_chave: { userId, chave } },
    create: { userId, chave, ...data },
    update: data,
  });
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

export interface ImportacaoResultado {
  importados: number;
  vinculados: number;
  semSuporte: number;
  ignorados: number;
  erros: number;
}

async function marcar(
  tabela: 'bankInvestment' | 'bankLoan',
  id: string,
  data: Record<string, unknown>,
) {
  if (tabela === 'bankInvestment') await prisma.bankInvestment.update({ where: { id }, data });
  else await prisma.bankLoan.update({ where: { id }, data });
}

/** Importa uma posição de investimento pendente. Devolve o status final. */
export async function importarInvestimento(
  inv: BankInvestment,
  connectorId?: number | null,
): Promise<string> {
  if (inv.importStatus !== 'pendente') return inv.importStatus;
  const balance = Number(inv.balance);
  const encerrada =
    inv.status === 'TOTAL_WITHDRAWAL' || (balance <= 0 && !(inv.quantity && inv.quantity > 0));
  if (encerrada) {
    await marcar('bankInvestment', inv.id, {
      importStatus: 'ignorado',
      importError: 'posição encerrada no banco',
    });
    return 'ignorado';
  }
  const agora = new Date();
  const dataPosicao = inv.issueDate ?? inv.providerDate ?? agora;
  const investido = Number(inv.amountOriginal ?? inv.balance);

  try {
    // 1) Ativo listado no catálogo (ticker)
    if (LISTADOS.has(inv.type) && inv.code && /^[A-Z0-9]{4,7}$/.test(inv.code)) {
      const asset = await prisma.asset.findFirst({
        where: { symbol: inv.code, type: { in: ['stock', 'fii', 'etf', 'bdr'] } },
      });
      if (!asset) {
        await marcar('bankInvestment', inv.id, {
          importStatus: 'sem-suporte',
          importError: `ticker ${inv.code} não está no catálogo`,
        });
        return 'sem-suporte';
      }
      const existente = await prisma.portfolio.findFirst({
        where: { userId: inv.userId, assetId: asset.id },
      });
      if (existente) {
        await marcar('bankInvestment', inv.id, {
          importStatus: 'vinculado',
          assetId: asset.id,
          portfolioId: existente.id,
          importedAt: agora,
        });
        return 'vinculado';
      }
      const quantidade = inv.quantity && inv.quantity > 0 ? inv.quantity : 1;
      const preco = Math.round((investido / quantidade) * 1_000_000) / 1_000_000;
      const port = await prisma.$transaction(async (tx) => {
        await tx.stockTransaction.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            type: 'compra',
            quantity: quantidade,
            price: preco,
            total: investido,
            date: dataPosicao,
            fees: 0,
            notes: NOTA_IMPORTACAO,
          },
        });
        return tx.portfolio.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            quantity: quantidade,
            avgPrice: preco,
            totalInvested: investido,
            lastUpdate: agora,
          },
        });
      });
      await recalculatePortfolioFromTransactions({
        targetUserId: inv.userId,
        assetId: asset.id,
        portfolioId: port.id,
        recomputeSnapshotsFrom: dataPosicao,
      });
      await marcar('bankInvestment', inv.id, {
        importStatus: 'importado',
        assetId: asset.id,
        portfolioId: port.id,
        importedAt: agora,
      });
      return 'importado';
    }

    // 2) Renda fixa bancária → Asset 'bond' + FixedIncomeAsset (curva)
    if (inv.type === 'FIXED_INCOME' && inv.subtype && RF_BANCARIA.has(inv.subtype)) {
      const { indexer, indexerPercent, annualRate } = indexadorRendaFixa(
        inv.rateType,
        inv.rate,
        inv.fixedAnnualRate,
      );
      const start = inv.issueDate ?? inv.providerDate ?? agora;
      let maturity = inv.dueDate;
      if (!maturity || maturity <= start) {
        maturity = new Date(start);
        maturity.setFullYear(maturity.getFullYear() + 10);
      }
      const chave = chaveInvestimento(inv, connectorId);
      const ja = await origemInvestimento(inv.userId, chave, inv.id);
      if (ja) {
        await marcar('bankInvestment', inv.id, {
          importStatus: 'vinculado',
          assetId: ja.assetId,
          portfolioId: ja.portfolioId,
          fixedIncomeAssetId: ja.fixedIncomeAssetId,
          importedAt: agora,
        });
        return 'vinculado';
      }
      const nome = inv.issuer ? `${inv.name} - ${inv.issuer}` : inv.name;
      const symbol = `PLUGGY-RF-${inv.providerInvestmentId.slice(0, 8).toUpperCase()}`;
      const r = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: { symbol, name: nome, type: 'bond', currency: 'BRL', source: 'pluggy' },
        });
        await tx.stockTransaction.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            type: 'compra',
            quantity: 1,
            price: investido,
            total: investido,
            date: start,
            fees: 0,
            notes: NOTA_IMPORTACAO,
          },
        });
        const port = await tx.portfolio.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            quantity: 1,
            avgPrice: investido,
            totalInvested: investido,
            lastUpdate: agora,
          },
        });
        const fi = await tx.fixedIncomeAsset.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            type: tipoRendaFixa(inv.subtype, inv.rateType),
            description: inv.name,
            startDate: start,
            maturityDate: maturity,
            investedAmount: investido,
            annualRate,
            indexer,
            indexerPercent,
            liquidityType: null,
            taxExempt: ISENTOS.has(inv.subtype ?? ''),
          },
        });
        return { asset, port, fi };
      });
      await gravarOrigem(inv.userId, chave, 'investimento', {
        assetId: r.asset.id,
        portfolioId: r.port.id,
        fixedIncomeAssetId: r.fi.id,
      });
      await marcar('bankInvestment', inv.id, {
        importStatus: 'importado',
        assetId: r.asset.id,
        portfolioId: r.port.id,
        fixedIncomeAssetId: r.fi.id,
        importedAt: agora,
      });
      return 'importado';
    }

    // 3) Fundos e previdência: catálogo CVM pelo CNPJ, senão ativo manual que segue o saldo
    if (inv.type === 'MUTUAL_FUND' || inv.type === 'SECURITY') {
      const cnpj = (inv.code ?? '').replace(/\D/g, '');
      const catalogo =
        cnpj.length === 14 ? await prisma.asset.findFirst({ where: { cnpj } }) : null;
      const previdencia = inv.type === 'SECURITY';
      // Sem catálogo o ativo é sintético (id do Pluggy no símbolo): reusa a origem.
      const chave = catalogo ? null : chaveInvestimento(inv, connectorId);
      const ja = chave ? await origemInvestimento(inv.userId, chave, inv.id) : null;
      if (ja) {
        await marcar('bankInvestment', inv.id, {
          importStatus: 'vinculado',
          assetId: ja.assetId,
          portfolioId: ja.portfolioId,
          importedAt: agora,
        });
        return 'vinculado';
      }
      const quantidade = inv.quantity && inv.quantity > 0 ? inv.quantity : 1;
      const preco = Math.round((investido / quantidade) * 1_000_000) / 1_000_000;
      const r = await prisma.$transaction(async (tx) => {
        const asset =
          catalogo ??
          (await tx.asset.create({
            data: {
              symbol: `PLUGGY-${previdencia ? 'PREV' : 'FUNDO'}-${inv.providerInvestmentId.slice(0, 8).toUpperCase()}`,
              name: inv.issuer ? `${inv.name} - ${inv.issuer}` : inv.name,
              type: previdencia ? 'previdencia' : 'fund',
              currency: 'BRL',
              source: 'pluggy',
              currentPrice: balance / quantidade,
              priceUpdatedAt: agora,
            },
          }));
        const existente = catalogo
          ? await tx.portfolio.findFirst({ where: { userId: inv.userId, assetId: asset.id } })
          : null;
        if (existente) return { asset, port: existente, vinculado: true };
        await tx.stockTransaction.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            type: 'compra',
            quantity: quantidade,
            price: preco,
            total: investido,
            date: dataPosicao,
            fees: 0,
            notes: NOTA_IMPORTACAO,
          },
        });
        const port = await tx.portfolio.create({
          data: {
            userId: inv.userId,
            assetId: asset.id,
            quantity: quantidade,
            avgPrice: preco,
            totalInvested: investido,
            lastUpdate: agora,
          },
        });
        return { asset, port, vinculado: false };
      });
      const status = r.vinculado ? 'vinculado' : 'importado';
      if (chave && !r.vinculado) {
        await gravarOrigem(inv.userId, chave, 'investimento', {
          assetId: r.asset.id,
          portfolioId: r.port.id,
        });
      }
      await marcar('bankInvestment', inv.id, {
        importStatus: status,
        assetId: r.asset.id,
        portfolioId: r.port.id,
        importedAt: agora,
      });
      return status;
    }

    await marcar('bankInvestment', inv.id, {
      importStatus: 'sem-suporte',
      importError: `tipo ${inv.type}/${inv.subtype ?? '-'} ainda não importa sozinho`,
    });
    return 'sem-suporte';
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : 'erro').slice(0, 300);
    logger.error('[pluggy carteira] importação de investimento falhou', { id: inv.id, msg });
    await marcar('bankInvestment', inv.id, { importStatus: 'erro', importError: msg });
    return 'erro';
  }
}

/** Importa um empréstimo pendente como Dívida (financiamento). */
export async function importarEmprestimo(
  loan: BankLoan,
  instituicao: string | null,
  connectorId?: number | null,
): Promise<string> {
  if (loan.importStatus !== 'pendente') return loan.importStatus;
  const principal = Number(loan.contractAmount ?? loan.outstanding ?? 0);
  if (!(principal > 0)) {
    await marcar('bankLoan', loan.id, {
      importStatus: 'sem-suporte',
      importError: 'sem valor contratado',
    });
    return 'sem-suporte';
  }
  try {
    // Mesmo contrato já importado por uma conexão anterior: vincula.
    const chave = chaveEmprestimo(loan, connectorId);
    const origem = await prisma.pluggyImportacaoOrigem.findUnique({
      where: { userId_chave: { userId: loan.userId, chave } },
    });
    const existente = origem?.dividaId
      ? await prisma.divida.findFirst({
          where: { id: origem.dividaId, userId: loan.userId },
          select: { id: true },
        })
      : null;
    if (existente) {
      await marcar('bankLoan', loan.id, {
        importStatus: 'vinculado',
        dividaId: existente.id,
        importedAt: new Date(),
      });
      return 'vinculado';
    }
    const primeiro =
      loan.firstInstallmentDueDate ??
      (loan.contractDate ? new Date(loan.contractDate.getTime() + 30 * 86_400_000) : new Date());
    const quitada = loan.outstanding != null && Number(loan.outstanding) <= 0;
    const taxaAa = loan.annualRate ?? loan.cet;
    const divida = await prisma.divida.create({
      data: {
        userId: loan.userId,
        nome: loan.productName,
        instituicao,
        tipo: tipoDivida(loan.type),
        modalidade: 'financiamento',
        status: quitada ? 'quitada' : 'ativa',
        notes: `${NOTA_IMPORTACAO}${loan.contractNumber ? ` · contrato ${loan.contractNumber}` : ''}`,
        principal,
        taxaAm: taxaAaParaAm(taxaAa),
        taxaUnidadeEntrada: 'aa',
        prazoMeses: prazoMesesDivida(loan),
        sistema: loan.amortization === 'SAC' ? 'SAC' : 'PRICE',
        indexador: indexadorDivida(loan.indexer),
        primeiroVencimento: ym(primeiro),
      },
    });
    // Parcelas que o banco diz já pagas entram como pagamentos (valores do
    // cronograma SAC/Price), para o saldo devedor partir de onde o contrato está.
    const pagas = Math.max(0, Math.floor(loan.paidInstallments ?? 0));
    if (!quitada && pagas > 0) {
      const cronograma = gerarCronograma({
        principal,
        taxaAm: Number(divida.taxaAm ?? 0),
        prazoMeses: divida.prazoMeses ?? 1,
        primeiroVencimento: divida.primeiroVencimento ?? ym(primeiro),
        sistema: (divida.sistema as 'SAC' | 'PRICE') ?? 'PRICE',
      });
      const parcelas = cronograma.slice(0, Math.min(pagas, cronograma.length));
      if (parcelas.length > 0) {
        await prisma.dividaPagamento.createMany({
          data: parcelas.map((p) => ({
            dividaId: divida.id,
            month: p.mes,
            valor: Math.round(p.parcela * 100) / 100,
            parcelaNumero: p.numero,
            tipo: 'pagamento',
            notes: NOTA_IMPORTACAO,
          })),
        });
      }
    }
    await syncDividaRecordToCashflow(loan.userId, divida);
    deleteTtlCacheKeyPrefix('carteiraResumo', `${loan.userId}:`);
    await gravarOrigem(loan.userId, chave, 'emprestimo', { dividaId: divida.id });
    await marcar('bankLoan', loan.id, {
      importStatus: 'importado',
      dividaId: divida.id,
      importedAt: new Date(),
    });
    return 'importado';
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : 'erro').slice(0, 300);
    logger.error('[pluggy carteira] importação de empréstimo falhou', { id: loan.id, msg });
    await marcar('bankLoan', loan.id, { importStatus: 'erro', importError: msg });
    return 'erro';
  }
}

/** Importa tudo que está pendente para o usuário (chamado após cada sync e pelo botão). */
export async function importarPendentes(userId: string): Promise<ImportacaoResultado> {
  const r: ImportacaoResultado = {
    importados: 0,
    vinculados: 0,
    semSuporte: 0,
    ignorados: 0,
    erros: 0,
  };
  const conta = (s: string) => {
    if (s === 'importado') r.importados += 1;
    else if (s === 'vinculado') r.vinculados += 1;
    else if (s === 'sem-suporte') r.semSuporte += 1;
    else if (s === 'ignorado') r.ignorados += 1;
    else if (s === 'erro') r.erros += 1;
  };
  const invs = await prisma.bankInvestment.findMany({
    where: { userId, importStatus: 'pendente', ativo: true },
    include: { connection: { select: { connectorId: true } } },
  });
  for (const { connection, ...inv } of invs) {
    conta(await importarInvestimento(inv, connection?.connectorId));
  }
  const loans = await prisma.bankLoan.findMany({
    where: { userId, importStatus: 'pendente', ativo: true },
    include: { connection: { select: { connectorName: true, connectorId: true } } },
  });
  for (const { connection, ...loan } of loans) {
    conta(await importarEmprestimo(loan, connection.connectorName, connection.connectorId));
  }
  return r;
}

/**
 * Pós-sync: mantém o que já foi importado alinhado ao banco —
 * ativos manuais (fundo/previdência sem catálogo) seguem o saldo;
 * empréstimo quitado no banco quita a dívida.
 */
export async function atualizarImportados(userId: string): Promise<void> {
  const invs = await prisma.bankInvestment.findMany({
    where: {
      userId,
      // vinculado também: reconexão que reusou a posição continua seguindo o saldo.
      importStatus: { in: ['importado', 'vinculado'] },
      assetId: { not: null },
      type: { in: ['MUTUAL_FUND', 'SECURITY'] },
    },
    select: { assetId: true, balance: true, quantity: true },
  });
  for (const inv of invs) {
    const q = inv.quantity && inv.quantity > 0 ? inv.quantity : 1;
    await prisma.asset.updateMany({
      where: { id: inv.assetId!, source: 'pluggy' },
      data: { currentPrice: Number(inv.balance) / q, priceUpdatedAt: new Date() },
    });
  }
  const loans = await prisma.bankLoan.findMany({
    where: {
      userId,
      importStatus: { in: ['importado', 'vinculado'] },
      dividaId: { not: null },
      outstanding: { lte: 0 },
    },
    select: { dividaId: true },
  });
  for (const loan of loans) {
    const d = await prisma.divida.findFirst({
      where: { id: loan.dividaId!, userId, status: 'ativa' },
    });
    if (!d) continue;
    const atualizada = await prisma.divida.update({
      where: { id: d.id },
      data: { status: 'quitada' },
    });
    await syncDividaRecordToCashflow(userId, atualizada);
  }
}

export async function ignorarInvestimento(userId: string, id: string): Promise<boolean> {
  const r = await prisma.bankInvestment.updateMany({
    where: { id, userId, importStatus: { in: ['pendente', 'sem-suporte', 'erro'] } },
    data: { importStatus: 'ignorado', importError: null },
  });
  return r.count > 0;
}
