/**
 * Prisma em memória só com o que os jobs EUA da fatia A usam (sec_companies, sec_company_tickers,
 * asset_fundamentals_period, asset_quotes_daily_us): findMany/findFirst/createMany/upsert/update/
 * updateMany/delete com where de igualdade, `in`, `OR` e `has`; select, orderBy e distinct simples.
 * Decimal entra como Prisma.Decimal e sai como Prisma.Decimal (paraNumero converte).
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';

type Linha = Record<string, unknown>;

const valor = (v: unknown) => (v instanceof Date ? v.getTime() : v);

function casa(l: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(cond as Linha[]).some((w) => casa(l, w))) return false;
      continue;
    }
    const v = l[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Linha;
      if ('in' in c && !(c.in as unknown[]).map(valor).includes(valor(v))) return false;
      if ('has' in c && !((v as unknown[]) ?? []).includes(c.has)) return false;
      if ('not' in c && valor(v) === valor(c.not)) return false;
      continue;
    }
    if (valor(v ?? null) !== valor(cond)) return false;
  }
  return true;
}

function ordenar(ls: Linha[], orderBy: unknown): Linha[] {
  if (!orderBy) return ls;
  const regras = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) =>
    Object.entries(o as Linha),
  ) as [string, 'asc' | 'desc'][];
  return [...ls].sort((a, b) => {
    for (const [k, dir] of regras) {
      const x = valor(a[k]) as number | string;
      const y = valor(b[k]) as number | string;
      if (x === y) continue;
      const r = x < y ? -1 : 1;
      return dir === 'desc' ? -r : r;
    }
    return 0;
  });
}

function selecionar(l: Linha, select: Linha | undefined): Linha {
  if (!select) return { ...l };
  return Object.fromEntries(Object.keys(select).map((k) => [k, l[k] ?? null]));
}

function delegado(nome: string, chaves: string[], padroes: Linha = {}) {
  const linhas: Linha[] = [];
  const chave = (l: Linha) => chaves.map((k) => String(valor(l[k]))).join('|');
  const achar = (where: Linha) => {
    const w = { ...where };
    for (const [k, v] of Object.entries(where)) {
      // where composto: { symbol_validFrom: { symbol, validFrom } }
      if (k.includes('_') && v && typeof v === 'object' && !(v instanceof Date)) {
        delete w[k];
        Object.assign(w, v);
      }
    }
    return linhas.find((l) => casa(l, w));
  };
  return {
    linhas,
    api: {
      async findMany(
        a: { where?: Linha; select?: Linha; orderBy?: unknown; distinct?: string[] } = {},
      ) {
        let r = ordenar(
          linhas.filter((l) => casa(l, a.where)),
          a.orderBy,
        );
        if (a.distinct) {
          const vistos = new Set<string>();
          r = r.filter((l) => {
            const k = a.distinct!.map((c) => String(valor(l[c]))).join('|');
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
        }
        return r.map((l) => selecionar(l, a.select));
      },
      async findFirst(a: { where?: Linha; select?: Linha; orderBy?: unknown } = {}) {
        const r = ordenar(
          linhas.filter((l) => casa(l, a.where)),
          a.orderBy,
        )[0];
        return r ? selecionar(r, a.select) : null;
      },
      async createMany(a: { data: Linha[]; skipDuplicates?: boolean }) {
        let count = 0;
        for (const d of a.data) {
          const l = { id: randomUUID(), ...padroes, ...d };
          if (linhas.some((x) => chave(x) === chave(l))) {
            if (a.skipDuplicates) continue;
            throw new Error(`${nome}: chave duplicada ${chave(l)}`);
          }
          linhas.push(l);
          count++;
        }
        return { count };
      },
      async upsert(a: { where: Linha; create: Linha; update: Linha }) {
        const atual = achar(a.where);
        if (atual) {
          Object.assign(atual, a.update);
          return atual;
        }
        const l = { id: randomUUID(), ...padroes, ...a.create };
        linhas.push(l);
        return l;
      },
      async update(a: { where: Linha; data: Linha }) {
        const atual = achar(a.where);
        if (!atual) throw new Error(`${nome}: update sem linha`);
        Object.assign(atual, a.data);
        return atual;
      },
      async updateMany(a: { where?: Linha; data: Linha }) {
        const alvo = linhas.filter((l) => casa(l, a.where));
        for (const l of alvo) Object.assign(l, a.data);
        return { count: alvo.length };
      },
      async delete(a: { where: Linha }) {
        const atual = achar(a.where);
        if (!atual) throw new Error(`${nome}: delete sem linha`);
        linhas.splice(linhas.indexOf(atual), 1);
        return atual;
      },
    },
  };
}

export function criarPrismaFakeEua() {
  const secCompany = delegado('secCompany', ['cik'], {
    noUniverso: false,
    ehReit: false,
    ehFinanceira: false,
    origem: 'regra',
  });
  const secCompanyTicker = delegado('secCompanyTicker', ['symbol', 'validFrom'], {
    validTo: null,
    principal: false,
  });
  const assetFundamentalsPeriod = delegado(
    'assetFundamentalsPeriod',
    ['emissorId', 'dtFim', 'tipoPeriodo', 'escopo', 'versao'],
    { naoSeAplica: [], flags: [] },
  );
  const assetQuoteDailyUs = delegado('assetQuoteDailyUs', ['symbol', 'date']);
  const analiseJobRun = delegado('analiseJobRun', ['id']);
  const prisma = {
    secCompany: secCompany.api,
    secCompanyTicker: secCompanyTicker.api,
    assetFundamentalsPeriod: assetFundamentalsPeriod.api,
    assetQuoteDailyUs: assetQuoteDailyUs.api,
    analiseJobRun: analiseJobRun.api,
  } as unknown as PrismaClient;
  return {
    prisma,
    tabelas: {
      secCompany: secCompany.linhas,
      secCompanyTicker: secCompanyTicker.linhas,
      assetFundamentalsPeriod: assetFundamentalsPeriod.linhas,
      assetQuoteDailyUs: assetQuoteDailyUs.linhas,
    },
  };
}
