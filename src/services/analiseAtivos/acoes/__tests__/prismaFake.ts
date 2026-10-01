/**
 * Prisma em memória só com o que a ingestão de ações usa (findMany/findUnique/createMany/update/
 * updateMany/upsert/count com where de igualdade, in, gte/gt/lte/lt e not). Permite testar
 * idempotência de verdade (rodar 2× ⇒ mesmas linhas) sem banco.
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';

type Linha = Record<string, unknown>;

const UNICOS: Record<string, string[]> = {
  cvmCompany: ['cnpj'],
  cvmCompanyTicker: ['symbol', 'validFrom'],
  assetFundamentalsPeriod: ['emissorId', 'dtFim', 'tipoPeriodo', 'escopo', 'versao'],
  assetStatementLine: [
    'emissorId',
    'dtFim',
    'tipoPeriodo',
    'escopo',
    'demonstrativo',
    'cdConta',
    'versao',
  ],
  assetShareCount: ['cnpj', 'data'],
  analiseFonteArquivo: ['url'],
  assetCorporateAction: ['id'],
};
const COM_ID = new Set(['cvmCompanyTicker', 'assetFundamentalsPeriod', 'assetShareCount']);
const PADROES: Record<string, Linha> = {
  cvmCompany: { layoutFinanceiro: false },
  cvmCompanyTicker: { validTo: null, origem: 'fca' },
  assetFundamentalsPeriod: { moeda: 'BRL', lpaEscalaCorrigida: false, naoSeAplica: [], flags: [] },
  assetShareCount: { flags: [] },
};
const DECIMAIS = new Set([
  'receita',
  'lucroBruto',
  'ebit',
  'depreciacaoAmortizacao',
  'lucroLiquido',
  'lucroAtribuivel',
  'ativoTotal',
  'ativoCirculante',
  'passivoCirculante',
  'caixa',
  'aplicacoesFinanceiras',
  'dividaBrutaCp',
  'dividaBrutaLp',
  'pl',
  'plControladora',
  'fco',
  'fci',
  'fcf',
  'capex',
  'dividendosJcpPagos',
  'dmplDeclarado',
  'valor',
  'on',
  'pn',
  'tesouraria',
  'total',
]);

class DecimalFake {
  constructor(private readonly s: string) {}
  toNumber() {
    return Number(this.s);
  }
  toString() {
    return this.s;
  }
}

function normalizar(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v instanceof DecimalFake) return v.toNumber();
  return v;
}

function igual(a: unknown, b: unknown): boolean {
  return normalizar(a) === normalizar(b);
}

function casa(l: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'NOT') return !casa(l, cond as Linha);
    const v = l[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('has' in c) return Array.isArray(v) && v.includes(c.has);
      if ('in' in c) return (c.in as unknown[]).some((x) => igual(v, x));
      if ('not' in c) return !igual(v, c.not);
      const nv = normalizar(v) as number;
      if ('gte' in c && !(nv >= (normalizar(c.gte) as number))) return false;
      if ('gt' in c && !(nv > (normalizar(c.gt) as number))) return false;
      if ('lte' in c && !(nv <= (normalizar(c.lte) as number))) return false;
      if ('lt' in c && !(nv < (normalizar(c.lt) as number))) return false;
      return true;
    }
    return igual(v, cond ?? null);
  });
}

function preparar(tabela: string, data: Linha): Linha {
  const l: Linha = { ...(PADROES[tabela] ?? {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    l[k] =
      DECIMAIS.has(k) && (typeof v === 'string' || typeof v === 'number')
        ? new DecimalFake(String(v))
        : v;
  }
  if (COM_ID.has(tabela) && !l.id) l.id = randomUUID();
  return l;
}

function chave(tabela: string, l: Linha): string {
  return UNICOS[tabela].map((k) => String(normalizar(l[k]))).join('|');
}

export function criarPrismaFake() {
  const tabelas: Record<string, Linha[]> = Object.fromEntries(
    Object.keys(UNICOS).map((t) => [t, [] as Linha[]]),
  );
  const escritas = { n: 0 };
  const delegado = (t: string) => ({
    findMany: async (
      a: { where?: Linha; select?: Record<string, boolean>; distinct?: string[] } = {},
    ) => {
      let r = tabelas[t].filter((l) => casa(l, a.where));
      if (a.distinct) {
        const vistos = new Set<string>();
        r = r.filter((l) => {
          const k = a.distinct!.map((c) => String(normalizar(l[c]))).join('|');
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
      }
      if (a.select) {
        return r.map((l) =>
          Object.fromEntries(Object.keys(a.select!).map((k) => [k, l[k] ?? null])),
        );
      }
      return r.map((l) => ({ ...l }));
    },
    findUnique: async (a: { where: Linha }) => {
      const l = tabelas[t].find((x) => casa(x, a.where));
      return l ? { ...l } : null;
    },
    findFirst: async (a: { where?: Linha } = {}) => {
      const l = tabelas[t].find((x) => casa(x, a.where));
      return l ? { ...l } : null;
    },
    count: async (a: { where?: Linha } = {}) => tabelas[t].filter((l) => casa(l, a.where)).length,
    createMany: async (a: { data: Linha[]; skipDuplicates?: boolean }) => {
      let count = 0;
      const existentes = new Set(tabelas[t].map((l) => chave(t, l)));
      for (const d of a.data) {
        const l = preparar(t, d);
        const k = chave(t, l);
        if (existentes.has(k)) {
          if (a.skipDuplicates) continue;
          throw new Error(`unique violado em ${t}: ${k}`);
        }
        existentes.add(k);
        tabelas[t].push(l);
        count++;
      }
      escritas.n += count;
      return { count };
    },
    create: async (a: { data: Linha }) => {
      const l = preparar(t, a.data);
      tabelas[t].push(l);
      escritas.n++;
      return { ...l };
    },
    update: async (a: { where: Linha; data: Linha }) => {
      const l = tabelas[t].find((x) => casa(x, a.where));
      if (!l) throw new Error(`update sem linha em ${t}`);
      Object.assign(l, preparar(t, a.data), { id: l.id });
      if (!COM_ID.has(t)) delete l.id;
      escritas.n++;
      return { ...l };
    },
    updateMany: async (a: { where?: Linha; data: Linha }) => {
      const alvo = tabelas[t].filter((x) => casa(x, a.where));
      for (const l of alvo) Object.assign(l, a.data);
      escritas.n += alvo.length;
      return { count: alvo.length };
    },
    upsert: async (a: { where: Linha; create: Linha; update: Linha }) => {
      const l = tabelas[t].find((x) => casa(x, a.where));
      escritas.n++;
      if (l) {
        Object.assign(l, preparar(t, a.update));
        if (!COM_ID.has(t)) delete l.id;
        return { ...l };
      }
      const n = preparar(t, a.create);
      tabelas[t].push(n);
      return { ...n };
    },
  });
  const prisma = Object.fromEntries(Object.keys(UNICOS).map((t) => [t, delegado(t)]));
  return { prisma: prisma as unknown as PrismaClient, tabelas, escritas };
}
