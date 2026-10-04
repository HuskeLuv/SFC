/**
 * Banco FALSO (em memória) para os testes do relato (bloco C, fatia D): só as operações do Prisma
 * que registrarReporte, notificacoesReporte, privacidadeReportes e as rotas de relato usam, com um
 * filtro `where` mínimo (igualdade, null, in, gte, lt, OR, relação `caso`, metadata path/equals).
 * Não é um Prisma completo: chaves desconhecidas no where falham alto (throw), para o teste não
 * passar por engano.
 */
import { vi } from 'vitest';

type Linha = Record<string, unknown>;

let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

function valorBate(v: unknown, cond: unknown): boolean {
  if (cond === null) return v === null || v === undefined;
  if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
  if (typeof cond === 'object' && cond !== null) {
    const c = cond as Record<string, unknown>;
    for (const [op, alvo] of Object.entries(c)) {
      if (op === 'in') {
        if (!(alvo as unknown[]).includes(v)) return false;
      } else if (op === 'gte') {
        if (!(v instanceof Date) || v.getTime() < (alvo as Date).getTime()) return false;
      } else if (op === 'lt') {
        if (v instanceof Date) {
          if (v.getTime() >= (alvo as Date).getTime()) return false;
        } else if (typeof v === 'string') {
          if (!(v < (alvo as string))) return false;
        } else return false;
      } else if (op === 'path') {
        const caminho = alvo as string[];
        let atual: unknown = v;
        for (const k of caminho) atual = (atual as Record<string, unknown> | null)?.[k];
        if (atual !== c.equals) return false;
      } else if (op === 'equals') {
        if (!('path' in c) && v !== alvo) return false;
      } else {
        throw new Error(`banco falso: operador não suportado ${op}`);
      }
    }
    return true;
  }
  return v === cond;
}

export function criarBancoFalso() {
  const tabelas = {
    casos: [] as Linha[],
    reportes: [] as Linha[],
    eventos: [] as Linha[],
    notificacoes: [] as Linha[],
    usuarios: [] as Linha[],
  };

  const bate = (tabela: keyof typeof tabelas, l: Linha, where: Linha | undefined): boolean => {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k === 'OR') {
        if (!(cond as Linha[]).some((w) => bate(tabela, l, w))) return false;
        continue;
      }
      if (k === 'caso' && tabela === 'reportes') {
        const caso = tabelas.casos.find((c) => c.id === l.casoId);
        if (!caso || !bate('casos', caso, cond as Linha)) return false;
        continue;
      }
      if (!valorBate(l[k], cond)) return false;
    }
    return true;
  };

  const ordenar = (linhas: Linha[], orderBy: unknown): Linha[] => {
    const ordens = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Array<
      Record<string, 'asc' | 'desc'>
    >;
    return [...linhas].sort((a, b) => {
      for (const o of ordens) {
        const [k, dir] = Object.entries(o)[0];
        const va = a[k] instanceof Date ? (a[k] as Date).getTime() : (a[k] as string | number);
        const vb = b[k] instanceof Date ? (b[k] as Date).getTime() : (b[k] as string | number);
        if (va === vb) continue;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const r = va < vb ? -1 : 1;
        return dir === 'desc' ? -r : r;
      }
      return 0;
    });
  };

  const selecionar = (tabela: keyof typeof tabelas, l: Linha, select?: Linha): Linha => {
    if (!select) return { ...l };
    const out: Linha = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      if (k === 'caso' && tabela === 'reportes') {
        const caso = tabelas.casos.find((c) => c.id === l.casoId) as Linha;
        out.caso = selecionar('casos', caso, (v as { select: Linha }).select);
      } else out[k] = l[k];
    }
    return out;
  };

  function modelo(tabela: keyof typeof tabelas, padroes: () => Linha) {
    const linhas = () => tabelas[tabela];
    return {
      findMany: vi.fn(
        async (a: { where?: Linha; orderBy?: unknown; take?: number; select?: Linha } = {}) => {
          let r = ordenar(
            linhas().filter((l) => bate(tabela, l, a.where)),
            a.orderBy,
          );
          if (a.take !== undefined) r = r.slice(0, a.take);
          return r.map((l) => selecionar(tabela, l, a.select));
        },
      ),
      findFirst: vi.fn(async (a: { where?: Linha; orderBy?: unknown; select?: Linha } = {}) => {
        const r = ordenar(
          linhas().filter((l) => bate(tabela, l, a.where)),
          a.orderBy,
        )[0];
        return r ? selecionar(tabela, r, a.select) : null;
      }),
      findUnique: vi.fn(async (a: { where: Linha; select?: Linha }) => {
        const r = linhas().find((l) => bate(tabela, l, a.where));
        return r ? selecionar(tabela, r, a.select) : null;
      }),
      count: vi.fn(
        async (a: { where?: Linha } = {}) =>
          linhas().filter((l) => bate(tabela, l, a.where)).length,
      ),
      create: vi.fn(async (a: { data: Linha; select?: Linha }) => {
        const l = { id: uuid(), ...padroes(), ...a.data };
        linhas().push(l);
        return selecionar(tabela, l, a.select);
      }),
      createMany: vi.fn(async (a: { data: Linha[] }) => {
        for (const d of a.data) linhas().push({ id: uuid(), ...padroes(), ...d });
        return { count: a.data.length };
      }),
      update: vi.fn(async (a: { where: Linha; data: Linha; select?: Linha }) => {
        const l = linhas().find((x) => bate(tabela, x, a.where));
        if (!l) throw new Error('banco falso: registro não encontrado');
        for (const [k, v] of Object.entries(a.data)) {
          if (v && typeof v === 'object' && 'increment' in (v as Linha)) {
            l[k] = (l[k] as number) + ((v as { increment: number }).increment ?? 0);
          } else l[k] = v;
        }
        l.updatedAt = new Date();
        return selecionar(tabela, l, a.select);
      }),
      updateMany: vi.fn(async (a: { where: Linha; data: Linha }) => {
        const alvo = linhas().filter((x) => bate(tabela, x, a.where));
        for (const l of alvo) Object.assign(l, a.data);
        return { count: alvo.length };
      }),
      upsert: vi.fn(async (a: { where: Linha; create: Linha; update: Linha; select?: Linha }) => {
        const existente = linhas().find((x) => bate(tabela, x, a.where));
        if (existente) {
          Object.assign(existente, a.update);
          return selecionar(tabela, existente, a.select);
        }
        const l = { id: uuid(), ...padroes(), ...a.create };
        linhas().push(l);
        return selecionar(tabela, l, a.select);
      }),
    };
  }

  const agoraPadrao = () => new Date();
  const db = {
    analiseCasoDado: modelo('casos', () => ({
      status: 'aberto',
      resolucao: null,
      efeitoTela: null,
      slaAte: null,
      nReportes: 0,
      periodo: null,
      respostaPublica: null,
      resolvidoEm: null,
      chaveAberta: null,
      regraCodigo: null,
      abertoEm: agoraPadrao(),
      updatedAt: agoraPadrao(),
    })),
    analiseDataReport: modelo('reportes', () => ({
      clienteId: null,
      periodo: null,
      anonimizadoEm: null,
      respondidoEm: null,
      createdAt: agoraPadrao(),
    })),
    analiseCasoEvento: modelo('eventos', () => ({ createdAt: agoraPadrao() })),
    notification: modelo('notificacoes', () => ({ readAt: null, createdAt: agoraPadrao() })),
    user: modelo('usuarios', () => ({})),
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };

  /** Caso de REGRA aberto (como a fatia C grava). */
  const casoDeRegra = (c: Linha) => {
    const l = {
      id: uuid(),
      origem: 'regra',
      status: 'aberto',
      nReportes: 0,
      slaAte: null,
      abertoEm: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      resolvidoEm: null,
      periodo: null,
      contexto: {},
      ...c,
    };
    tabelas.casos.push(l);
    return l;
  };

  return { db, tabelas, casoDeRegra };
}

export type BancoFalso = ReturnType<typeof criarBancoFalso>;

/** Linha do Quadro mínima (AnaliseQuadroLinha) para o retrato do servidor. */
export function linhaQuadro(over: Record<string, unknown> = {}) {
  return {
    symbol: 'WEGE3',
    classe: 'acao',
    cnpj: '84429695000111',
    dataRef: new Date('2026-10-02T00:00:00Z'),
    geradoEm: new Date('2026-10-02T10:30:00Z'),
    paramsVersion: 1,
    estadoIndice: 'calculado',
    indiceMf: 71,
    flags: [] as string[],
    motivosIncompleto: [] as string[],
    naoSeAplica: [] as string[],
    preco: 52.1,
    precoData: new Date('2026-10-02T00:00:00Z'),
    valorMercado: 218_000_000_000,
    patrimonio: null,
    pl: 31.2,
    pvp: 8.9,
    dy12mPct: 1.8,
    roePct: 30.1,
    margemLiquidaPct: 17.2,
    divLiqEbitda: -0.3,
    divLiqPl: -0.1,
    payoutPct: 55,
    vacanciaFisicaCvmPct: null,
    obrigacoesPlPct: null,
    cotistas: null,
    nImoveisCvm: null,
    nCri: null,
    anosLucroConsecutivos: 10,
    mesesComRendimento: null,
    serieUlt12m: 6.4,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
