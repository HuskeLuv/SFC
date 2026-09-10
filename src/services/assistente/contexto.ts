/**
 * "Retrato" compacto da conta que vai no prompt do assistente: carteira
 * (resumo + posições), fluxo de caixa do ano (totais mensais por linha),
 * orçamento, dívidas, saúde financeira e objetivos.
 *
 * As funções `compact*` são puras e compartilhadas com o harness
 * (scripts/assistente/build-contexto.ts). `buildContextoUsuario` roda no
 * servidor reaproveitando as rotas GET existentes (mesma autenticação e
 * mesmo contexto de consultor da requisição), com cache de 5 min por usuário.
 */
import { NextRequest } from 'next/server';
import { getTtlCache, deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';

export type Json = Record<string, unknown>;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const DROP_KEY =
  /(^id$|Id$|^userId$|createdAt|updatedAt|^isTemplate$|^templateId$|^hidden$|^orderIndex$)/;

const ATIVO_KEEP = [
  'ticker',
  'nome',
  'setor',
  'tipo',
  'quantidade',
  'precoAquisicao',
  'cotacaoAtual',
  'valorTotal',
  'valorAtualizado',
  'valorInicialAplicado',
  'rentabilidade',
  'percentualCarteira',
  'proventos',
  'benchmark',
  'vencimento',
  'cotizacaoResgate',
  'liquidacaoResgate',
  'estrategia',
  'objetivo',
  'instituicao',
];

/** Chave de `distribuicao` no resumo da carteira → rota de posições. */
const CLASSE_POR_DISTRIBUICAO: Record<string, string> = {
  acoes: 'acoes',
  fiis: 'fii',
  etfs: 'etf',
  stocks: 'stocks',
  reits: 'reit',
  rendaFixaFundos: 'renda-fixa',
  fimFia: 'fim-fia',
  moedasCriptos: 'moedas-criptos',
  previdenciaSeguros: 'previdencia-seguros',
  imoveisBens: 'imoveis-bens',
  reservaEmergencia: 'reserva-emergencia',
  reservaOportunidade: 'reserva-oportunidade',
};

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mantém só campos primitivos úteis; arredonda números; remove ids/datas técnicas. */
export function slim(obj: unknown, keep?: string[]): Json {
  if (!obj || typeof obj !== 'object') return {};
  const out: Json = {};
  for (const [k, v] of Object.entries(obj as Json)) {
    if (keep ? !keep.includes(k) : DROP_KEY.test(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') out[k] = round(v);
    else if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export interface CashGroupLike {
  id?: string;
  name: string;
  type?: string;
  hidden?: boolean;
  items?: Array<{
    id?: string;
    name: string;
    hidden?: boolean;
    objetivoId?: string | null;
    dividaId?: string | null;
    values?: Array<{ month: number; value: number | string | null }>;
  }>;
  children?: CashGroupLike[];
}

export interface LinhaEditavel {
  itemId: string;
  itemNome: string;
  /** Trilha completa do grupo, ex.: "Despesas > Despesas Fixas > Transporte". */
  grupoNome: string;
  grupoTipo: string;
}

/**
 * Linhas em que o assistente pode lançar: grupos de entrada/despesa (em
 * qualquer nível), sem espelho de sonho/dívida e não ocultas. Inclui as
 * linhas ainda zeradas — é a lista completa, não só o que tem valor.
 */
export function listarLinhasEditaveis(groups: CashGroupLike[]): LinhaEditavel[] {
  const out: LinhaEditavel[] = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    if (g.hidden) return;
    const nome = [...trail, g.name].join(' > ');
    if (g.type === 'entrada' || g.type === 'despesa') {
      for (const item of g.items ?? []) {
        if (item.hidden || item.objetivoId || item.dividaId) continue;
        out.push({
          itemId: item.id ?? '',
          itemNome: item.name,
          grupoNome: nome,
          grupoTipo: g.type,
        });
      }
    }
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}

/**
 * Catálogo para o prompt: { "Despesas > Despesas Fixas > Transporte": ["Combustível", ...] }.
 * Só nomes (sem valores), para o modelo saber TODAS as linhas onde pode lançar —
 * `compactCashflow` mostra apenas as já preenchidas.
 */
export function catalogoLinhas(groups: CashGroupLike[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of listarLinhasEditaveis(groups)) {
    (out[l.grupoNome] ??= []).push(l.itemNome);
  }
  return out;
}

/** Árvore do fluxo → lista plana de grupos com linhas não zeradas e valores por mês. */
export function compactCashflow(groups: CashGroupLike[]): Json[] {
  const out: Json[] = [];
  const walk = (g: CashGroupLike, trail: string[]) => {
    const nome = [...trail, g.name].join(' > ');
    const linhas = (g.items ?? [])
      .map((it) => {
        const porMes = Array<number>(12).fill(0);
        for (const v of it.values ?? []) {
          if (typeof v.month === 'number' && v.month >= 0 && v.month < 12) {
            porMes[v.month] = round(Number(v.value ?? 0));
          }
        }
        const total = round(porMes.reduce((a, b) => a + b, 0));
        if (total === 0) return null;
        const meses: Json = {};
        porMes.forEach((val, i) => {
          if (val !== 0) meses[MESES[i]] = val;
        });
        return { linha: it.name, totalAno: total, meses };
      })
      .filter(Boolean);
    if (linhas.length > 0) out.push({ grupo: nome, tipo: g.type, linhas });
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}

interface Secao {
  nome?: string;
  tipo?: string;
  ativos?: Json[];
  totalValorAtualizado?: number;
}
export interface CarteiraClasseLike {
  resumo?: Json;
  secoes?: Secao[];
  totalGeral?: Json;
}

export function compactClasse(d: CarteiraClasseLike | null | undefined): Json | null {
  if (!d) return null;
  const secoes = (d.secoes ?? [])
    .map((s) => ({
      secao: s.nome ?? s.tipo,
      total: s.totalValorAtualizado !== undefined ? round(s.totalValorAtualizado) : undefined,
      ativos: (s.ativos ?? []).map((a) => slim(a, ATIVO_KEEP)),
    }))
    .filter((s) => s.ativos.length > 0);
  if (secoes.length === 0) return null;
  return { resumo: slim(d.resumo), secoes, totalGeral: slim(d.totalGeral) };
}

export interface ContextoBruto {
  ano: number;
  resumo: Json | null;
  posicoes: Record<string, CarteiraClasseLike | null>;
  cashflow: { groups: CashGroupLike[] } | null;
  orcamento: Json | null;
  dividas: { dividas: Json[] } | null;
  saude: Json | null;
  sonhos: { objetivos: Json[] } | null;
}

const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Monta o JSON compacto a partir das respostas cruas das rotas. Pura. */
export function montarContexto(raw: ContextoBruto, hoje: Date = new Date()): Json {
  const r = (raw.resumo ?? {}) as Json;
  const posicoes: Json = {};
  for (const [classe, d] of Object.entries(raw.posicoes)) {
    const c = compactClasse(d);
    if (c) posicoes[classe] = c;
  }
  const orc = raw.orcamento as Json | null;
  return {
    // A data fica AQUI (parte por usuário, cacheada 5 min) e não nas regras,
    // para o prefixo estável do prompt continuar cacheável entre usuários.
    hoje: hoje.toISOString().slice(0, 10),
    mesAtual: MESES_LONGOS[hoje.getMonth()],
    ano: raw.ano,
    carteira: {
      saldoBruto: r.saldoBruto,
      valorAplicado: r.valorAplicado,
      rentabilidadePercentual: r.rentabilidade,
      caixaParaInvestir: r.caixaParaInvestir,
      metaPatrimonio: r.metaPatrimonio,
      totais: slim(r.totais),
      distribuicao: Object.fromEntries(
        Object.entries((r.distribuicao ?? {}) as Record<string, Json>)
          .filter(([, v]) => Number(v?.valor ?? 0) !== 0)
          .map(([k, v]) => [k, slim(v)]),
      ),
      posicoes,
    },
    // Só linhas com valor no ano (leitura). O catálogo completo vai em linhasDoFluxo.
    fluxoDeCaixa: raw.cashflow ? compactCashflow(raw.cashflow.groups) : null,
    // Todas as linhas editáveis, por grupo, para propor_lancamento acertar a linha/seção.
    linhasDoFluxo: raw.cashflow ? catalogoLinhas(raw.cashflow.groups) : null,
    orcamento: orc
      ? {
          categorias: ((orc.categorias ?? []) as Json[]).map((c) => ({
            ...slim(c, ['nome', 'parentNome', 'metaMensal']),
            realAnual: slim(c.realAnual),
          })),
          totais: orc.totais,
          investimentos: slim(orc.investimentos, ['tipoMeta', 'valorMeta']),
        }
      : null,
    dividas: (raw.dividas?.dividas ?? []).map((d) => slim(d)),
    saudeFinanceira: raw.saude
      ? { indicadores: (raw.saude as Json).indicadores, config: (raw.saude as Json).config }
      : null,
    objetivos: (raw.sonhos?.objetivos ?? []).map((o) => slim(o)),
  };
}

/** Classes de ativo com valor > 0 no resumo → rotas a consultar. */
export function classesComPosicao(resumo: Json | null): string[] {
  const dist = ((resumo ?? {}) as Json).distribuicao as Record<string, Json> | undefined;
  if (!dist) return [];
  return Object.entries(dist)
    .filter(([k, v]) => CLASSE_POR_DISTRIBUICAO[k] && Number(v?.valor ?? 0) !== 0)
    .map(([k]) => CLASSE_POR_DISTRIBUICAO[k]);
}

// ---------------------------------------------------------------------------
// Servidor: reaproveita as rotas GET existentes (mesmos cookies/consultor).
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest) => Promise<Response>;

/** Carregamento tardio das rotas para não puxar tudo no import do serviço. */
const ROTAS: Record<string, () => Promise<{ GET: RouteHandler }>> = {
  '/api/carteira/resumo': () => import('@/app/api/carteira/resumo/route'),
  '/api/cashflow': () => import('@/app/api/cashflow/route'),
  '/api/cashflow/orcamento': () => import('@/app/api/cashflow/orcamento/route'),
  '/api/dividas': () => import('@/app/api/dividas/route'),
  '/api/saude-financeira': () => import('@/app/api/saude-financeira/route'),
  '/api/planejamento-sonhos': () => import('@/app/api/planejamento-sonhos/route'),
  '/api/carteira/acoes': () => import('@/app/api/carteira/acoes/route'),
  '/api/carteira/fii': () => import('@/app/api/carteira/fii/route'),
  '/api/carteira/etf': () => import('@/app/api/carteira/etf/route'),
  '/api/carteira/stocks': () => import('@/app/api/carteira/stocks/route'),
  '/api/carteira/reit': () => import('@/app/api/carteira/reit/route'),
  '/api/carteira/renda-fixa': () => import('@/app/api/carteira/renda-fixa/route'),
  '/api/carteira/fim-fia': () => import('@/app/api/carteira/fim-fia/route'),
  '/api/carteira/moedas-criptos': () => import('@/app/api/carteira/moedas-criptos/route'),
  '/api/carteira/previdencia-seguros': () => import('@/app/api/carteira/previdencia-seguros/route'),
  '/api/carteira/imoveis-bens': () => import('@/app/api/carteira/imoveis-bens/route'),
  '/api/carteira/reserva-emergencia': () => import('@/app/api/carteira/reserva-emergencia/route'),
  '/api/carteira/reserva-oportunidade': () =>
    import('@/app/api/carteira/reserva-oportunidade/route'),
};

async function chamarRota<T = Json>(
  request: NextRequest,
  path: string,
  query?: Record<string, string>,
): Promise<T | null> {
  const loader = ROTAS[path];
  if (!loader) return null;
  try {
    const { GET } = await loader();
    const url = new URL(path, request.nextUrl.origin);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await GET(new NextRequest(url, { headers: request.headers }));
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_NS = 'assistente-contexto';

export function invalidarContextoUsuario(userId: string): void {
  deleteTtlCacheKeyPrefix(CACHE_NS, `${userId}:`);
}

/** Contexto compacto do usuário-alvo da requisição, como string JSON (cacheado 5 min). */
export async function buildContextoUsuario(request: NextRequest, userId: string): Promise<string> {
  const ano = new Date().getFullYear();
  const cache = getTtlCache<string>(CACHE_NS);
  const key = `${userId}:${ano}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const resumo = await chamarRota(request, '/api/carteira/resumo');
  const classes = classesComPosicao(resumo);
  const [cashflow, orcamento, dividas, saude, sonhos, ...posicoesArr] = await Promise.all([
    chamarRota<{ groups: CashGroupLike[] }>(request, '/api/cashflow', { year: String(ano) }),
    chamarRota(request, '/api/cashflow/orcamento', { year: String(ano) }),
    chamarRota<{ dividas: Json[] }>(request, '/api/dividas'),
    chamarRota(request, '/api/saude-financeira'),
    chamarRota<{ objetivos: Json[] }>(request, '/api/planejamento-sonhos'),
    ...classes.map((c) => chamarRota<CarteiraClasseLike>(request, `/api/carteira/${c}`)),
  ]);
  const posicoes: Record<string, CarteiraClasseLike | null> = {};
  classes.forEach((c, i) => {
    posicoes[c] = posicoesArr[i];
  });

  const contexto = montarContexto({
    ano,
    resumo,
    posicoes,
    cashflow,
    orcamento,
    dividas,
    saude,
    sonhos,
  });
  const json = JSON.stringify(contexto);
  cache.set(key, json, CACHE_TTL_MS);
  return json;
}
