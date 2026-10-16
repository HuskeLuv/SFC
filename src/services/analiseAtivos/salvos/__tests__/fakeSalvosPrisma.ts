/**
 * Banco FALSO em memória para os testes do bloco 1 (fatia A): só os modelos e as operações que os
 * serviços de salvos usam (findMany/findFirst/count/create/createMany/updateMany/deleteMany, where
 * com igualdade, in, not e gte). Reproduz as uniques do schema (P2002) e SERIALIZA as transações
 * interativas (como o pg_advisory_xact_lock por usuário), para o teste de concorrência do
 * sentinela 'padrao'. Não é um arquivo de teste (sem .test.).
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const UNIQUES: Record<string, string[][]> = {
  analiseLista: [['userId', 'nomeNormalizado']],
  analiseListaItem: [['listaId', 'symbol']],
  analiseFiltroSalvo: [['userId', 'classe', 'nomeNormalizado']],
  analiseComparacao: [['userId', 'chave']],
  analiseAlertaEnvio: [['userId', 'tipo', 'chave']],
};

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function casa(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ('in' in c && !(c.in as unknown[]).some((x) => igual(x, v))) return false;
      if ('not' in c && igual(c.not, v)) return false;
      if ('gte' in c && !((v as Date) >= (c.gte as Date))) return false;
      if ('lt' in c && !((v as Date) < (c.lt as Date))) return false;
      return true;
    }
    return igual(v, cond);
  });
}

function ordenar(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const [[campo, dir]] = Object.entries(orderBy as Record<string, 'asc' | 'desc'>);
  const m = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = a[campo] as number | string | Date;
    const vb = b[campo] as number | string | Date;
    return va < vb ? -m : va > vb ? m : 0;
  });
}

function erroUnico(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

export interface FakeSalvos {
  prisma: Record<string, unknown>;
  tabelas: Record<string, Row[]>;
  /** chaves passadas ao pg_advisory_xact_lock */
  travas: string[];
  limpar(): void;
}

export function criarFakeSalvos(): FakeSalvos {
  const tabelas: Record<string, Row[]> = {
    analiseLista: [],
    analiseListaItem: [],
    analiseFiltroSalvo: [],
    analiseComparacao: [],
    analiseAlertaEnvio: [],
    analiseAlertaMarco: [],
    notification: [],
  };
  const travas: string[] = [];
  let relogio = Date.parse('2026-10-16T12:00:00.000Z');
  const agora = () => new Date((relogio += 1000));

  const conferirUnico = (nome: string, row: Row, exceto?: Row) => {
    for (const campos of UNIQUES[nome] ?? []) {
      const dup = tabelas[nome].some(
        (r) => r !== exceto && campos.every((c) => igual(r[c], row[c])),
      );
      if (dup) throw erroUnico();
    }
  };

  const inserir = (nome: string, data: Row): Row => {
    const t = agora();
    const { itens, ...resto } = data as Row & { itens?: { create: Row[] } };
    const row: Row = {
      id: randomUUID(),
      createdAt: t,
      updatedAt: t,
      ...(nome === 'analiseLista'
        ? { alertaResultado: true, alertaProvento: true, alertaCriterios: false }
        : {}),
      ...(nome === 'analiseFiltroSalvo' ? { versaoSchema: 1, ultimoUsoEm: null } : {}),
      ...resto,
    };
    conferirUnico(nome, row);
    tabelas[nome].push(row);
    if (itens?.create) {
      for (const i of itens.create) inserir('analiseListaItem', { ...i, listaId: row.id });
    }
    return row;
  };

  const comRelacoes = (nome: string, row: Row, select: unknown): Row => {
    const s = select as Record<string, unknown> | undefined;
    if (nome === 'analiseLista' && s?.itens) {
      const sub = s.itens as { where?: Where; orderBy?: unknown };
      const itens = ordenar(
        tabelas.analiseListaItem.filter((i) => i.listaId === row.id && casa(i, sub.where)),
        sub.orderBy,
      );
      return { ...row, itens };
    }
    return { ...row };
  };

  const modelo = (nome: string) => ({
    findMany: async (
      a: { where?: Where; orderBy?: unknown; take?: number; select?: unknown } = {},
    ) => {
      const rows = ordenar(
        tabelas[nome].filter((r) => casa(r, a.where)),
        a.orderBy,
      ).slice(0, a.take ?? Infinity);
      return rows.map((r) => comRelacoes(nome, r, a.select));
    },
    findFirst: async (a: { where?: Where; select?: unknown } = {}) => {
      const r = tabelas[nome].find((x) => casa(x, a.where));
      return r ? comRelacoes(nome, r, a.select) : null;
    },
    findUnique: async (a: { where?: Where } = {}) =>
      tabelas[nome].find((x) => casa(x, a.where)) ?? null,
    count: async (a: { where?: Where } = {}) =>
      tabelas[nome].filter((r) => casa(r, a.where)).length,
    create: async (a: { data: Row }) => ({ ...inserir(nome, a.data) }),
    createMany: async (a: { data: Row[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const d of a.data) {
        try {
          inserir(nome, d);
          count += 1;
        } catch (e) {
          if (!a.skipDuplicates) throw e;
        }
      }
      return { count };
    },
    updateMany: async (a: { where?: Where; data: Row }) => {
      const alvo = tabelas[nome].filter((r) => casa(r, a.where));
      for (const r of alvo) {
        const novo = { ...r, ...a.data, updatedAt: agora() };
        conferirUnico(nome, novo, r);
        Object.assign(r, novo);
      }
      return { count: alvo.length };
    },
    deleteMany: async (a: { where?: Where } = {}) => {
      const antes = tabelas[nome].length;
      const ficam = tabelas[nome].filter((r) => !casa(r, a.where));
      tabelas[nome] = ficam;
      // cascade lista → itens
      if (nome === 'analiseLista') {
        const ids = new Set(ficam.map((l) => l.id));
        tabelas.analiseListaItem = tabelas.analiseListaItem.filter((i) => ids.has(i.listaId));
      }
      return { count: antes - ficam.length };
    },
  });

  let fila: Promise<unknown> = Promise.resolve();
  const prisma: Record<string, unknown> = {
    $executeRaw: async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      if (strings.join('?').includes('pg_advisory_xact_lock')) travas.push(String(valores[0]));
      return 1;
    },
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const fn = arg as (tx: unknown) => Promise<unknown>;
      // serializa como a trava do usuário (uma instância, um usuário nos testes)
      const run = fila.then(() => fn(prisma));
      fila = run.catch(() => undefined);
      return run;
    },
  };
  for (const nome of Object.keys(tabelas)) prisma[nome] = modelo(nome);

  return {
    prisma,
    tabelas,
    travas,
    limpar() {
      for (const k of Object.keys(tabelas)) tabelas[k] = [];
      travas.length = 0;
    },
  };
}
