/**
 * Banco em memória para os testes da ativação do Orçamento v2 (dados 100% sintéticos).
 *
 * Implementa só o subconjunto do Prisma que a ativação, `personalizeGroup` (o REAL, para
 * reproduzir a "ressurreição" de grupo oculto) e a desativação usam: where com igualdade, `in`,
 * `not` e `OR`; select raso; distinct; createMany com skipDuplicates; as unicidades relevantes
 * (inclusive o índice parcial da Geral, que dispara P2002) e o FK NO ACTION do orçado.
 * `$transaction` desfaz as escritas se o callback lançar; `$executeRaw` simula o advisory lock
 * (serializa quem pede a mesma chave até o fim da transação que o pediu).
 *
 * `arvoreMesclada` monta a árvore como `getMergedCashflowGroups` (3 níveis, itens do usuário ou
 * template, valores do usuário no ano) e passa pelo `mergeTemplatesWithCustomizations` real.
 */
import { randomUUID } from 'crypto';
import type { CashflowGroup } from '@/types/cashflow';
import { mergeTemplatesWithCustomizations } from '@/services/cashflow/getCashflowTree';

export type Linha = Record<string, unknown>;
type Where = Record<string, unknown>;

const TABELAS = [
  'user',
  'cashflowGroup',
  'cashflowItem',
  'cashflowValue',
  'cashflowOrcamento',
  'cashflowOrcamentoItem',
  'cashflowOrcamentoPrefs',
  'featureBetaUser',
  'bankTransaction',
] as const;
export type NomeTabela = (typeof TABELAS)[number];

const DEFAULTS: Partial<Record<NomeTabela, Linha>> = {
  cashflowGroup: { parentId: null, templateId: null, hidden: false, orderIndex: 0, icone: null },
  cashflowItem: {
    templateId: null,
    hidden: false,
    isGeral: false,
    orcamentoFixa: null,
    orderIndex: 0,
    significado: null,
    rank: null,
    objetivoId: null,
    dividaId: null,
  },
  cashflowValue: { color: null, valorBanco: 0 },
  cashflowOrcamentoPrefs: {
    categoriasRecolhidas: [],
    graficoVisivel: true,
    fonte: 'lancado',
    estruturaCriadaEm: null,
    avisoGeralVistoEm: null,
  },
  cashflowOrcamentoItem: { pct: null },
};

const CHAVE_PRIMARIA: Partial<Record<NomeTabela, string>> = { cashflowOrcamentoPrefs: 'userId' };

function erroUnico(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function casa(linha: Linha, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Where[]).some((w) => casa(linha, w));
    if (k === 'AND') return (cond as Where[]).every((w) => casa(linha, w));
    const v = linha[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('not' in c && v === c.not) return false;
      if ('lt' in c && !((v as number) < (c.lt as number))) return false;
      return true;
    }
    return (v ?? null) === (cond ?? null);
  });
}

function selecionar(linha: Linha, select: Record<string, unknown> | undefined): Linha {
  if (!select) return { ...linha };
  const out: Linha = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = linha[k];
  return out;
}

export interface BancoFalso {
  dados: Record<NomeTabela, Linha[]>;
  prisma: Record<string, unknown>;
  /** Chamadas a $executeRaw (strings do template + valores). */
  travas: { sql: string; valores: unknown[] }[];
  /** Ganchos de teste: rodam antes do create/createMany da tabela (simular corrida/defeito). */
  ganchos: Partial<Record<string, (args: Linha) => void>>;
  inserir: (tabela: NomeTabela, linha: Linha) => Linha;
  copia: () => Record<NomeTabela, Linha[]>;
  arvoreMesclada: (userId: string, ano: number) => CashflowGroup[];
}

export function criarBancoFalso(): BancoFalso {
  const dados = Object.fromEntries(TABELAS.map((t) => [t, [] as Linha[]])) as Record<
    NomeTabela,
    Linha[]
  >;
  const travas: BancoFalso['travas'] = [];
  const ganchos: BancoFalso['ganchos'] = {};
  const filas = new Map<string, Promise<void>>();

  const copia = () =>
    Object.fromEntries(TABELAS.map((t) => [t, dados[t].map((l) => ({ ...l }))])) as Record<
      NomeTabela,
      Linha[]
    >;

  const violaUnicidade = (tabela: NomeTabela, l: Linha, ignorar?: Linha): boolean => {
    const outras = dados[tabela].filter((o) => o !== ignorar);
    const igual = (campos: string[]) =>
      outras.some((o) => campos.every((c) => o[c] === l[c] && l[c] != null));
    switch (tabela) {
      case 'cashflowItem':
        return (
          (l.templateId != null && igual(['userId', 'templateId'])) ||
          (l.isGeral === true &&
            l.hidden !== true &&
            outras.some((o) => o.groupId === l.groupId && o.isGeral === true && o.hidden !== true))
        );
      case 'cashflowGroup':
        return l.templateId != null && igual(['userId', 'templateId']);
      case 'cashflowOrcamentoItem':
        return igual(['userId', 'itemId', 'ano', 'mes']);
      case 'featureBetaUser':
        return igual(['recurso', 'userId']);
      case 'cashflowOrcamentoPrefs':
        return igual(['userId']);
      default:
        return false;
    }
  };

  const montar = (tabela: NomeTabela, data: Linha): Linha => {
    const agora = new Date();
    const chave = CHAVE_PRIMARIA[tabela];
    return {
      ...(chave ? {} : { id: randomUUID() }),
      ...DEFAULTS[tabela],
      createdAt: agora,
      updatedAt: agora,
      ...data,
    };
  };

  const inserir = (tabela: NomeTabela, data: Linha): Linha => {
    const l = montar(tabela, data);
    if (violaUnicidade(tabela, l)) throw erroUnico();
    dados[tabela].push(l);
    return l;
  };

  const modelo = (tabela: NomeTabela) => ({
    findUnique: async (args: { where: Where; select?: Linha; include?: Linha }) => {
      const l = dados[tabela].find((x) => casa(x, args.where));
      if (!l) return null;
      if (tabela === 'cashflowGroup' && args.include) {
        return {
          ...l,
          items: args.include.items ? dados.cashflowItem.filter((i) => i.groupId === l.id) : [],
          children: args.include.children
            ? dados.cashflowGroup.filter((g) => g.parentId === l.id)
            : [],
          group: undefined,
        };
      }
      if (tabela === 'cashflowItem' && args.include?.group) {
        return { ...l, group: dados.cashflowGroup.find((g) => g.id === l.groupId) ?? null };
      }
      return selecionar(l, args.select as Record<string, unknown> | undefined);
    },
    findFirst: async (args: { where?: Where; select?: Linha }) => {
      const l = dados[tabela].find((x) => casa(x, args?.where));
      return l ? selecionar(l, args.select as Record<string, unknown> | undefined) : null;
    },
    findMany: async (args: { where?: Where; select?: Linha; distinct?: string[] } = {}) => {
      let linhas = dados[tabela].filter((x) => casa(x, args.where));
      if (args.distinct) {
        const vistos = new Set<string>();
        linhas = linhas.filter((l) => {
          const k = args.distinct!.map((c) => String(l[c])).join('|');
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
      }
      return linhas.map((l) => selecionar(l, args.select as Record<string, unknown> | undefined));
    },
    count: async (args: { where?: Where } = {}) =>
      dados[tabela].filter((x) => casa(x, args.where)).length,
    create: async (args: { data: Linha; select?: Linha }) => {
      ganchos[`${tabela}.create`]?.(args.data);
      return selecionar(
        inserir(tabela, args.data),
        args.select as Record<string, unknown> | undefined,
      );
    },
    createMany: async (args: { data: Linha[]; skipDuplicates?: boolean }) => {
      ganchos[`${tabela}.createMany`]?.(args as unknown as Linha);
      let count = 0;
      for (const d of args.data) {
        const l = montar(tabela, d);
        if (violaUnicidade(tabela, l)) {
          if (args.skipDuplicates) continue;
          throw erroUnico();
        }
        dados[tabela].push(l);
        count++;
      }
      return { count };
    },
    update: async (args: { where: Where; data: Linha }) => {
      const l = dados[tabela].find((x) => casa(x, args.where));
      if (!l) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      const novo = { ...l, ...args.data, updatedAt: new Date() };
      if (violaUnicidade(tabela, novo, l)) throw erroUnico();
      Object.assign(l, novo);
      return { ...l };
    },
    updateMany: async (args: { where?: Where; data: Linha }) => {
      const alvo = dados[tabela].filter((x) => casa(x, args.where));
      alvo.forEach((l) => Object.assign(l, args.data, { updatedAt: new Date() }));
      return { count: alvo.length };
    },
    upsert: async (args: { where: Where; create: Linha; update: Linha }) => {
      const l = dados[tabela].find((x) => casa(x, args.where));
      if (l) {
        Object.assign(l, args.update, { updatedAt: new Date() });
        return { ...l };
      }
      return { ...inserir(tabela, args.create) };
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      const alvo = dados[tabela].filter((x) => casa(x, args.where));
      if (tabela === 'cashflowItem') {
        // FK NO ACTION de cashflow_orcamento_itens.itemId
        const ids = new Set(alvo.map((l) => l.id));
        if (dados.cashflowOrcamentoItem.some((o) => ids.has(o.itemId))) {
          throw Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
        }
      }
      dados[tabela] = dados[tabela].filter((x) => !alvo.includes(x));
      return { count: alvo.length };
    },
  });

  const prisma: Record<string, unknown> = Object.fromEntries(TABELAS.map((t) => [t, modelo(t)]));

  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const antes = copia();
    let soltar: (() => void) | undefined;
    const tx = {
      ...prisma,
      $executeRaw: async (strings: TemplateStringsArray, ...valores: unknown[]) => {
        travas.push({ sql: strings.join('?'), valores });
        const chave = valores.map(String).join('|');
        const anterior = filas.get(chave) ?? Promise.resolve();
        const minha = new Promise<void>((r) => (soltar = r));
        filas.set(
          chave,
          anterior.then(() => minha),
        );
        await anterior;
        return 1;
      },
    };
    try {
      return await fn(tx);
    } catch (e) {
      for (const t of TABELAS) dados[t] = antes[t];
      throw e;
    } finally {
      soltar?.();
    }
  };

  const arvoreMesclada = (userId: string, ano: number): CashflowGroup[] => {
    const meuOuTemplate = (l: Linha) => l.userId === userId || l.userId === null;
    const itensDe = (groupId: unknown) =>
      dados.cashflowItem
        .filter((i) => i.groupId === groupId && meuOuTemplate(i))
        .sort(
          (a, b) =>
            (a.orderIndex as number) - (b.orderIndex as number) ||
            String(a.name).localeCompare(String(b.name)),
        )
        .map((i) => ({
          ...i,
          values: dados.cashflowValue
            .filter((v) => v.itemId === i.id && v.userId === userId && v.year === ano)
            .sort((a, b) => (a.month as number) - (b.month as number))
            .map((v) => ({ ...v })),
        }));
    const no = (g: Linha, nivel: number): Linha => ({
      ...g,
      items: itensDe(g.id),
      ...(nivel < 2
        ? {
            children: dados.cashflowGroup
              .filter((c) => c.parentId === g.id && meuOuTemplate(c))
              .sort((a, b) => (a.orderIndex as number) - (b.orderIndex as number))
              .map((c) => no(c, nivel + 1)),
          }
        : {}),
    });
    const raizes = (dono: string | null) =>
      dados.cashflowGroup
        .filter((g) => g.userId === dono && g.parentId === null)
        .sort((a, b) => (a.orderIndex as number) - (b.orderIndex as number))
        .map((g) => no(g, 0));
    return mergeTemplatesWithCustomizations(
      raizes(null) as unknown as CashflowGroup[],
      raizes(userId) as unknown as CashflowGroup[],
    );
  };

  return { dados, prisma, travas, ganchos, inserir, copia, arvoreMesclada };
}
