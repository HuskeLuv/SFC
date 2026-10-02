/**
 * Fixture em memória para as rotas das abas Reservas + Renda Fixa (mover fase 2).
 * `criarPrismaEmMemoria` responde aos `where` usados pelas rotas (igualdade, in,
 * notIn, startsWith, not, OR, relação `asset`) — assim o MESMO cenário roda com
 * a chave ligada e desligada sem depender da ordem das chamadas.
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v);

function casaCampo(valor: unknown, cond: unknown): boolean {
  if (!isObj(cond)) return valor === cond;
  for (const [op, arg] of Object.entries(cond)) {
    switch (op) {
      case 'in':
        if (!(arg as unknown[]).includes(valor)) return false;
        break;
      case 'notIn':
        if ((arg as unknown[]).includes(valor)) return false;
        break;
      case 'startsWith':
        if (typeof valor !== 'string' || !valor.startsWith(arg as string)) return false;
        break;
      case 'not':
        if (arg === null ? valor == null : valor === arg) return false;
        break;
      default:
        throw new Error(`operador não suportado no mock: ${op}`);
    }
  }
  return true;
}

export function casaWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(cond as Row[]).some((w) => casaWhere(row, w))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(cond as Row[]).every((w) => casaWhere(row, w))) return false;
      continue;
    }
    const valor = row[k];
    if (isObj(valor) && isObj(cond) && !('in' in cond) && !('startsWith' in cond)) {
      if (!casaWhere(valor, cond)) return false;
      continue;
    }
    if (k === 'asset' && valor == null) return false;
    if (!casaCampo(valor ?? null, cond)) return false;
  }
  return true;
}

function ordenar(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const chaves = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, 'asc' | 'desc'>[];
  return [...rows].sort((a, b) => {
    for (const o of chaves) {
      const [k, dir] = Object.entries(o)[0];
      const va = a[k] instanceof Date ? (a[k] as Date).getTime() : (a[k] as number | string);
      const vb = b[k] instanceof Date ? (b[k] as Date).getTime() : (b[k] as number | string);
      if (va === vb) continue;
      const cmp = va < vb ? -1 : 1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

export interface Cenario {
  assets: Row[];
  portfolio: Row[];
  fixedIncome: Row[];
  transactions: Row[];
  changeLogs?: Row[];
}

export function criarPrismaEmMemoria(c: Cenario) {
  const assetById = new Map(c.assets.map((a) => [a.id as string, a]));
  const comAsset = (r: Row) => ({
    ...r,
    asset: r.assetId ? assetById.get(r.assetId as string) : null,
  });
  return {
    user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) },
    portfolio: {
      findMany: vi.fn(async (args: { where?: Row; orderBy?: unknown; include?: Row } = {}) => {
        const rows = c.portfolio.map(comAsset).filter((r) => casaWhere(r, args.where));
        return ordenar(rows, args.orderBy);
      }),
    },
    fixedIncomeAsset: {
      findMany: vi.fn(async (args: { where?: Row } = {}) =>
        c.fixedIncome.map(comAsset).filter((r) => casaWhere(r, args.where)),
      ),
    },
    stockTransaction: {
      findMany: vi.fn(async (args: { where?: Row; orderBy?: unknown } = {}) =>
        ordenar(
          c.transactions.filter((r) => casaWhere(r, args.where)),
          args.orderBy,
        ),
      ),
    },
    userChangeLog: {
      findMany: vi.fn(async (args: { where?: Row; orderBy?: unknown } = {}) =>
        ordenar(
          (c.changeLogs ?? []).filter((r) => casaWhere(r, args.where)),
          args.orderBy,
        ),
      ),
    },
    dashboardData: { findFirst: vi.fn(async () => null) },
    economicIndex: { findMany: vi.fn(async () => []) },
    tesouroDiretoPrice: { findMany: vi.fn(async () => []) },
  };
}

// ── Cenário com os tipos do grupo (e um de renda variável) ─────────────────────

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const asset = (id: string, symbol: string, type: string, name: string, extra: Row = {}): Row => ({
  id,
  symbol,
  type,
  name,
  currency: 'BRL',
  currentPrice: null,
  ...extra,
});

let ordem = 0;
const pos = (id: string, assetId: string, qty: number, avg: number, extra: Row = {}): Row => ({
  id,
  userId: 'user-1',
  assetId,
  quantity: qty,
  avgPrice: avg,
  totalInvested: qty * avg,
  objetivo: 0,
  categoriaOverride: null,
  lastUpdate: new Date(Date.UTC(2026, 8, 1) - ordem++ * 60_000),
  ...extra,
});

const fi = (id: string, assetId: string, extra: Row): Row => ({
  id,
  userId: 'user-1',
  assetId,
  type: 'CDB_PRE',
  description: `FI ${id}`,
  startDate: d('2025-01-02'),
  maturityDate: d('2030-01-02'),
  investedAmount: 1000,
  annualRate: 0,
  indexer: 'CDI',
  indexerPercent: 100,
  liquidityType: null,
  taxExempt: false,
  tesouroBondType: null,
  tesouroMaturity: null,
  ...extra,
});

let txn = 0;
const compra = (assetId: string, total: number, notes: Row | null, date = '2025-01-02'): Row => ({
  id: `tx-${txn++}`,
  userId: 'user-1',
  assetId,
  type: 'compra',
  quantity: 1,
  price: total,
  total,
  date: d(date),
  createdAt: d(date),
  notes: notes ? JSON.stringify(notes) : null,
});

/** 12 posições: saldos sem título, títulos com/sem FI, Tesouro de catálogo e 1 ação. */
export function cenarioCompleto(overrides: Record<string, string | null> = {}): Cenario {
  ordem = 0;
  txn = 0;
  const assets = [
    asset('a-emerg', 'RESERVA-EMERG-1', 'emergency', 'Conta reserva'),
    asset('a-cc-op', 'CONTA-CORRENTE-OPORT-1', 'opportunity', 'Conta corrente'),
    asset('a-poup', 'POUPANCA-EMERG-1', 'emergency', 'Poupança'),
    asset('a-cash', 'CASH-1', 'cash', 'Caixa'),
    asset('a-cdb', 'RENDA-FIXA-CDB-1', 'bond', 'CDB Banco X 110% CDI'),
    asset('a-legacy', 'RENDA-FIXA-LEG-1', 'bond', 'Debênture antiga'),
    asset('a-td-res', 'TD-SELIC-2031', 'tesouro-direto', 'Tesouro Selic 2031', {
      currentPrice: 17000,
    }),
    asset('a-td-pre', 'TD-PRE-2029', 'tesouro-direto', 'Tesouro Prefixado 2029', {
      currentPrice: 800,
    }),
    asset('a-td-ipca', 'TD-IPCA-2035', 'tesouro-direto', 'Tesouro IPCA+ 2035', {
      currentPrice: 2500,
    }),
    asset('a-td-pre-res', 'TD-PRE-2027', 'tesouro-direto', 'Tesouro Prefixado 2027', {
      currentPrice: 900,
    }),
    asset('a-fundo-res', 'FUNDO-DI-RESERVA-EMERG-1', 'emergency', 'Fundo DI reserva'),
    asset('a-petr', 'PETR4', 'stock', 'Petrobras'),
  ];
  const portfolio = [
    pos('p-emerg', 'a-emerg', 1, 5000),
    pos('p-cc-op', 'a-cc-op', 1, 2000),
    pos('p-poup', 'a-poup', 1, 3000),
    pos('p-cash', 'a-cash', 1, 700),
    pos('p-cdb', 'a-cdb', 1, 1200, { totalInvested: 1000 }),
    pos('p-legacy', 'a-legacy', 1, 4000),
    pos('p-td-res', 'a-td-res', 0.5, 16000),
    pos('p-td-pre', 'a-td-pre', 2, 700),
    pos('p-td-ipca', 'a-td-ipca', 1, 2400),
    pos('p-td-pre-res', 'a-td-pre-res', 1, 850),
    pos('p-fundo-res', 'a-fundo-res', 1, 1500, { totalInvested: 1500 }),
    pos('p-petr', 'a-petr', 10, 30),
  ].map((p) =>
    (p.id as string) in overrides ? { ...p, categoriaOverride: overrides[p.id as string] } : p,
  );
  const fixedIncome = [
    fi('fi-cdb', 'a-cdb', { indexerPercent: 110, maturityDate: d('2030-06-15') }),
    fi('fi-td-res', 'a-td-res', {
      tesouroBondType: 'Tesouro Selic',
      tesouroMaturity: d('2031-03-01'),
      investedAmount: 8000,
      maturityDate: d('2031-03-01'),
      liquidityType: 'DAILY',
    }),
    // Tesouro Prefixado comprado na RF: FI com indexer PRE e taxa.
    fi('fi-td-pre', 'a-td-pre', {
      indexer: 'PRE',
      indexerPercent: null,
      annualRate: 12.5,
      tesouroBondType: 'Tesouro Prefixado',
      tesouroMaturity: d('2029-01-01'),
      investedAmount: 1400,
      maturityDate: d('2029-01-01'),
    }),
    // Tesouro IPCA+ da RF: tipo híbrido (paridade: Híbrida, como na main).
    fi('fi-td-ipca', 'a-td-ipca', {
      type: 'CDB_HIB',
      indexer: 'IPCA',
      annualRate: 6.5,
      tesouroBondType: 'Tesouro IPCA+',
      tesouroMaturity: d('2035-05-15'),
      investedAmount: 2400,
      maturityDate: d('2035-05-15'),
    }),
    // Tesouro Prefixado comprado como RESERVA: o FI nasce CDB_PRE + CDI padrão.
    fi('fi-td-pre-res', 'a-td-pre-res', {
      tesouroBondType: 'Tesouro Prefixado',
      tesouroMaturity: d('2027-01-01'),
      investedAmount: 850,
      maturityDate: d('2027-01-01'),
    }),
    fi('fi-fundo-res', 'a-fundo-res', {
      investedAmount: 1500,
      liquidityType: 'DAILY',
      maturityDate: d('2027-01-01'),
    }),
    fi('fi-cash', 'a-cash', { investedAmount: 700, maturityDate: d('2028-01-01') }),
  ];
  const transactions = [
    compra('a-emerg', 5000, {
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
      benchmark: 'CDI',
    }),
    compra('a-cc-op', 2000, null),
    compra('a-poup', 3000, { benchmark: 'Poupança' }),
    compra('a-cash', 700, null),
    compra('a-cdb', 1000, { operation: { action: 'compra' } }),
    compra('a-legacy', 4000, { debentureTipo: 'hibrida', benchmark: 'IPCA' }),
    // Destinos mistos: a 1ª compra (por data) marca Emergência; a 2ª, Oportunidade.
    compra('a-td-res', 4000, { tesouroDestino: 'reserva-oportunidade' }, '2025-03-01'),
    compra('a-td-res', 4000, { tesouroDestino: 'reserva-emergencia' }, '2025-02-01'),
    compra('a-td-pre', 1400, null),
    compra('a-td-ipca', 2400, null),
    compra('a-td-pre-res', 850, {
      tesouroDestino: 'reserva-oportunidade',
      cotizacaoResgate: 'D+0',
      liquidacaoResgate: 'Imediata',
      benchmark: 'CDI',
    }),
    compra('a-fundo-res', 1500, { benchmark: 'CDI', vencimento: '2027-01-01' }),
    compra('a-petr', 300, null),
  ];
  return { assets, portfolio, fixedIncome, transactions };
}

/** Evento de mover no Histórico (o selo "movido" lê daqui). */
export function eventoMover(entityId: string, destino: string): Row {
  return {
    userId: 'user-1',
    section: 'carteira',
    action: 'investimento.mover',
    entityId,
    undoneAt: null,
    createdAt: d('2026-10-01'),
    viaConsultant: false,
    snapshot: {
      v: 1,
      kind: 'mover',
      data: { categoriaOverride: null, objetivo: 0 },
      meta: { after: { categoriaOverride: destino } },
    },
  };
}
