/**
 * Caso 32, varredura GLOBAL do contrato (v2.4, fatia F): chama TODAS as rotas GET de
 * /api/analise-ativos/* e varre RECURSIVAMENTE as chaves de cada resposta. Nenhuma chave pode
 * conter (por substring, sem diferenciar maiúsculas) indice, semaforo, destaque, nota, rating ou
 * score — lista branca VAZIA. Nos valores de texto, nada do indicador antigo (Índice MF, semáforo,
 * ★) nem os códigos internos dele.
 *
 * O caminho de cada rota é o de verdade (rota → serviço → montador); só o banco é falso (cada
 * modelo devolve vazio, salvo os de que a rota precisa: linhas do Quadro de linhasDb.ts,
 * criteria_params v1, posições, relatos antigos). Onde o serviço lê demonstrações demais para
 * um banco falso (Essencial e Raio-X), o montador real roda sobre os dados do banco dev
 * (raio-x-dev.json). Se uma rota nova entrar em /api/analise-ativos sem estar aqui, o teste
 * "cobre todas as rotas GET" falha.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Metodo = (...args: unknown[]) => unknown;
  const especificos: Record<string, Record<string, Metodo>> = {};
  const padrao = (metodo: string): Metodo => {
    if (metodo === 'findMany' || metodo === 'groupBy') return async () => [];
    if (metodo === 'count') return async () => 0;
    if (metodo === 'aggregate') return async () => ({ _max: {}, _min: {}, _count: {} });
    return async () => null;
  };
  const modelo = (nome: string) =>
    new Proxy(
      {},
      {
        get: (_t, metodo) =>
          typeof metodo === 'string' && metodo !== 'then'
            ? (especificos[nome]?.[metodo] ?? padrao(metodo))
            : undefined,
      },
    );
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, nome) => {
        if (typeof nome !== 'string' || nome === 'then') return undefined;
        if (nome === '$queryRaw' || nome === '$queryRawUnsafe') return async () => [];
        if (nome === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function' ? (arg as (p: unknown) => unknown)(prisma) : arg;
        }
        return modelo(nome);
      },
    },
  );
  return { prisma, especificos };
});

const sessao = vi.hoisted(() => ({
  payload: { id: 'u1', email: 'usuario.demo@finapp.local', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
}));

vi.mock('@/lib/prisma', () => ({ prisma: fake.prisma, default: fake.prisma }));
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<object>()),
  requireSession: vi.fn(async () => sessao.payload),
}));
vi.mock('@/lib/analiseAtivosConfig', async (orig) => ({
  ...(await orig<object>()),
  analiseAtivosReporteHabilitado: () => true,
}));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', async (orig) => ({
  ...(await orig<object>()),
  exigirAcessoAnalise: vi.fn(async () => sessao),
  exigirRecursoAnalise: vi.fn(async () => sessao),
  estadoAcessoAnalise: vi.fn(async () => 'liberada'),
  recursosLiberados: vi.fn(async () => ({ raioX: true, cenarios: true, comparador: true })),
}));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn(),
}));
vi.mock('@/services/analiseAtivos/observabilidade/frescor', () => ({
  obterPainelFrescor: vi.fn(async () => ({ geradoEm: '', camadas: {}, atrasadas: [] })),
}));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (orig) => {
  const real =
    await orig<typeof import('@/services/analiseAtivos/leitura/criterios/lerCriterios')>();
  /** fixtures importadas na hora da chamada (import no factory pode fechar ciclo de mocks) */
  const fixtures = () => import('@/test/fixtures/analiseAtivos/criterios');
  return {
    ...real,
    obterCriteriosVarios: vi.fn(async (_p: unknown, symbols: readonly string[], janela: number) => {
      const f = await fixtures();
      const linhas: Record<string, object> = {
        WEGE3: f.CRITERIOS_LINHA_WEGE3,
        ITUB4: f.CRITERIOS_LINHA_ITUB4,
        HGLG11: f.CRITERIOS_LINHA_HGLG11,
      };
      return new Map(
        symbols.filter((s) => linhas[s]).map((s) => [s, { ...linhas[s], janela }] as const),
      );
    }),
    obterCriteriosAtivo: vi.fn(async (_p: unknown, t: string) => {
      const f = await fixtures();
      const ativos: Record<string, unknown> = {
        WEGE3: f.CRITERIOS_ATIVO_WEGE3,
        ITUB4: f.CRITERIOS_ATIVO_ITUB4,
        HGLG11: f.CRITERIOS_ATIVO_HGLG11,
      };
      return ativos[t] ?? null;
    }),
  };
});
/** Essencial e Raio-X: montadores reais sobre os dados do banco dev (raio-x-dev.json). */
vi.mock('@/services/analiseAtivos/leitura/ativo/fundamentosEssencial', async (orig) => {
  const real =
    await orig<typeof import('@/services/analiseAtivos/leitura/ativo/fundamentosEssencial')>();
  return {
    ...real,
    obterFundamentosEssencial: vi.fn(async (t: string) => {
      const rx = await import('@/services/analiseAtivos/leitura/ativo/raioX');
      const dev = await import('@/test/fixtures/analiseAtivos/raioXDev');
      const dados =
        t === 'HGLG11'
          ? rx.montarFii(dev.HOJE_DEV, dev.dadosFiiDev('HGLG11')).essencial
          : rx.montarAcao(dev.HOJE_DEV, dev.dadosAcaoDev(t === 'ITUB4' ? 'ITUB4' : 'WEGE3'))
              .essencial;
      return { dados, cache: false };
    }),
  };
});
vi.mock('@/services/analiseAtivos/leitura/ativo/raioX', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/ativo/raioX')>();
  return {
    ...real,
    obterRaioX: vi.fn(async (t: string) => {
      const dev = await import('@/test/fixtures/analiseAtivos/raioXDev');
      const fii = t === 'HGLG11';
      const parcial = fii
        ? real.montarFii(dev.HOJE_DEV, dev.dadosFiiDev('HGLG11')).raioX
        : real.montarAcao(dev.HOJE_DEV, dev.dadosAcaoDev(t === 'ITUB4' ? 'ITUB4' : 'WEGE3')).raioX;
      return {
        dados: { ticker: t, classe: fii ? 'fii' : 'acao', nome: t, ...parcial, versao: 'v' },
        cache: false,
        paramsVersion: 2,
      };
    }),
  };
});

import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { Prisma } from '@prisma/client';
import { CATALOGO_SERIES, SERIES_FUNDAMENTO } from '@/types/analiseAtivosFontes';
import type {
  AlvoGetResposta,
  FundamentosResposta,
  MarcaCelulaEssencial,
} from '@/types/analiseAtivosApi';
import { GERADO_EM_FIXTURE, LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import { COMPACTOS_WEGE3 } from '@/test/fixtures/analiseAtivos/criterios';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { _limparCacheComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { _limparCacheTopo } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { GET as getConfig } from '../config/route';
import { GET as getQuadro } from '../quadro/route';
import { GET as getBusca } from '../busca/route';
import { GET as getCarteira } from '../carteira/route';
import { GET as getAtivo } from '../ativos/[ticker]/route';
import { GET as getFundamentos } from '../ativos/[ticker]/fundamentos/route';
import { GET as getValuation } from '../ativos/[ticker]/valuation/route';
import { GET as getRaioX } from '../ativos/[ticker]/raio-x/route';
import { GET as getSugestoes } from '../ativos/[ticker]/comparar-sugestoes/route';
import { GET as getCenarios } from '../cenarios/[ticker]/route';
import { GET as getComparador } from '../comparador/route';
import { GET as getMeusReportes } from '../meus-reportes/route';
import { GET as getTese } from '../teses/[ticker]/route';

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

/** Lista branca: VAZIA (spec v2.4, fatia F). */
const CHAVES_PROIBIDAS_CONTRATO = /indice|semaforo|destaque|nota|rating|score/i;
/** Valores de texto: nada do indicador antigo nem dos códigos internos dele. */
const VALORES_PROIBIDOS = /Índice MF|indiceMf|sem[áa]foro|criterioSemaforo|fora_do_indice|★/i;

function varrer(x: unknown, caminho: string, chaves: string[], valores: string[]) {
  if (Array.isArray(x)) {
    x.forEach((v, i) => varrer(v, `${caminho}[${i}]`, chaves, valores));
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (CHAVES_PROIBIDAS_CONTRATO.test(k)) chaves.push(`${caminho}.${k}`);
      varrer(v, `${caminho}.${k}`, chaves, valores);
    }
  } else if (typeof x === 'string' && VALORES_PROIBIDOS.test(x)) {
    valores.push(`${caminho} = ${x.slice(0, 80)}`);
  }
}

type Rota = (req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) => Promise<Response>;

interface Chamada {
  rota: string;
  get: Rota;
  url: string;
  ticker?: string;
}

const base = 'http://localhost/api/analise-ativos';
const CHAMADAS: Chamada[] = [
  { rota: 'config', get: getConfig as Rota, url: `${base}/config` },
  { rota: 'quadro', get: getQuadro as Rota, url: `${base}/quadro?classe=acao` },
  { rota: 'quadro', get: getQuadro as Rota, url: `${base}/quadro?classe=fii&janela=10` },
  {
    rota: 'quadro',
    get: getQuadro as Rota,
    url: `${base}/quadro?classe=acao&janela=3&criterios=rec,luc&naCarteira=1&ordem=criterios`,
  },
  { rota: 'busca', get: getBusca as Rota, url: `${base}/busca` },
  { rota: 'carteira', get: getCarteira as Rota, url: `${base}/carteira` },
  ...['WEGE3', 'ITUB4', 'HGLG11'].flatMap((t): Chamada[] => [
    { rota: 'ativos/[ticker]', get: getAtivo as Rota, url: `${base}/ativos/${t}`, ticker: t },
    {
      rota: 'ativos/[ticker]/fundamentos',
      get: getFundamentos as Rota,
      url: `${base}/ativos/${t}/fundamentos`,
      ticker: t,
    },
    {
      rota: 'ativos/[ticker]/valuation',
      get: getValuation as Rota,
      url: `${base}/ativos/${t}/valuation`,
      ticker: t,
    },
    {
      rota: 'ativos/[ticker]/raio-x',
      get: getRaioX as Rota,
      url: `${base}/ativos/${t}/raio-x`,
      ticker: t,
    },
    {
      rota: 'ativos/[ticker]/raio-x',
      get: getRaioX as Rota,
      url: `${base}/ativos/${t}/raio-x?formato=csv`,
      ticker: t,
    },
    {
      rota: 'ativos/[ticker]/comparar-sugestoes',
      get: getSugestoes as Rota,
      url: `${base}/ativos/${t}/comparar-sugestoes?janela=5`,
      ticker: t,
    },
    {
      rota: 'cenarios/[ticker]',
      get: getCenarios as Rota,
      url: `${base}/cenarios/${t}`,
      ticker: t,
    },
    { rota: 'teses/[ticker]', get: getTese as Rota, url: `${base}/teses/${t}`, ticker: t },
  ]),
  { rota: 'comparador', get: getComparador as Rota, url: `${base}/comparador?t=WEGE3,ITUB4` },
  {
    rota: 'comparador',
    get: getComparador as Rota,
    url: `${base}/comparador?t=HGLG11,HCTR11,HFOF11&janela=10`,
  },
  { rota: 'meus-reportes', get: getMeusReportes as Rota, url: `${base}/meus-reportes` },
];

async function chamar(c: Chamada): Promise<{ status: number; corpo: unknown; texto: string }> {
  const res = await c.get(new NextRequest(c.url), {
    params: Promise.resolve({ ticker: c.ticker ?? '' }),
  });
  const texto = await res.text();
  const json = (res.headers.get('Content-Type') ?? '').includes('application/json');
  return { status: res.status, corpo: json ? JSON.parse(texto) : texto, texto };
}

/** Rotas com GET em src/app/api/analise-ativos (caminho relativo, sem 'route.ts'). */
function rotasGetNoDisco(): string[] {
  const raiz = path.join(__dirname, '..');
  const achadas: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === '__tests__') continue;
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (nome === 'route.ts' && /export const GET\b/.test(readFileSync(p, 'utf8'))) {
        achadas.push(path.relative(raiz, dir).split(path.sep).join('/'));
      }
    }
  };
  andar(raiz);
  return achadas.sort();
}

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------

/** WEGE3 avaliada nos critérios (cópia compacta), como o job deixa a linha do Quadro. */
const LINHAS = LINHAS_FIXTURE.map((l) =>
  l.symbol === 'WEGE3'
    ? {
        ...l,
        criterios: COMPACTOS_WEGE3,
        perfilCriterios: 'acao',
        paramsVersion: 2,
        flags: [...l.flags, 'conf:proventos:salto@2026-01'],
      }
    : l,
);

const asset = (symbol: string, type: string) => ({
  id: `a-${symbol}`,
  symbol,
  type,
  name: symbol,
  currency: 'BRL',
});

beforeEach(() => {
  _resetarCacheLinhasQuadro();
  _limparCacheComparador();
  _limparCacheTopo();
  for (const k of Object.keys(fake.especificos)) delete fake.especificos[k];
  Object.assign(fake.especificos, {
    analiseQuadroLinha: {
      aggregate: async () => ({ _max: { geradoEm: GERADO_EM_FIXTURE } }),
      findMany: async () => LINHAS,
    },
    criteriaParams: {
      findFirst: async () => ({ version: 1, params: CRITERIA_PARAMS_V1 }),
      findUnique: async () => ({ version: 1, params: CRITERIA_PARAMS_V1 }),
    },
    portfolio: {
      findMany: async () => [
        {
          id: 'pf-wege3',
          quantity: 120,
          categoriaOverride: null,
          objetivo: 6,
          estrategia: 'value',
          tipoFii: null,
          asset: asset('WEGE3', 'stock'),
        },
        {
          id: 'pf-hglg11',
          quantity: 40,
          categoriaOverride: null,
          objetivo: 0,
          estrategia: null,
          tipoFii: 'tijolo',
          asset: asset('HGLG11', 'fii'),
        },
      ],
    },
    watchlist: {
      findMany: async () => [
        {
          id: 'wl-itub4',
          objetivo: 5,
          secao: 'Bancos',
          categoriaOverride: null,
          asset: asset('ITUB4', 'stock'),
        },
      ],
    },
    analiseCenario: {
      findUnique: async () => ({
        classe: 'acao',
        premissas: { yieldPct: 6, gPct: null, kPct: 12, margemPct: 10, plAlvo: null },
        dadosEditados: { valores: { lpa: 1.5 }, valoresDoAtivoNoSalvamento: { lpa: 1.49 } },
        updatedAt: new Date('2026-10-10T12:00:00Z'),
      }),
    },
    analiseTese: {
      findUnique: async () => ({
        corpo: 'Acompanho a margem.',
        updatedAt: new Date('2026-10-10T12:00:00Z'),
      }),
    },
    // relatos ANTIGOS do indicador que saiu da superfície + um de hoje
    analiseDataReport: {
      findMany: async () =>
        [
          { bloco: 'indice', campo: 'indiceMf' },
          { bloco: 'criterios', campo: 'criterioSemaforo' },
          { bloco: 'kpis', campo: 'payout' },
        ].map((r, i) => ({
          id: `00000000-0000-4000-8000-00000000000${i}`,
          protocolo: `AA-2026-000${i}`,
          symbol: 'WEGE3',
          ...r,
          periodo: null,
          mensagem: 'O número parece errado.',
          valorExibido: '9,0',
          valorEsperado: null,
          fonteEsperada: null,
          createdAt: new Date(`2026-10-0${i + 1}T12:00:00Z`),
          caso: {
            id: `c${i}`,
            status: i === 0 ? 'rejeitado' : 'aberto',
            slaAte: new Date('2026-10-20T00:00:00Z'),
            updatedAt: new Date('2026-10-05T12:00:00Z'),
            resolucao: i === 0 ? 'dado_confirmado' : null,
            respostaPublica: i === 0 ? 'Conferido.' : null,
          },
        })),
    },
  });
});

// ---------------------------------------------------------------------------

describe('contratoSemNota — nenhuma resposta de /api/analise-ativos/* com nota', () => {
  it('cobre todas as rotas GET da área', () => {
    const cobertas = [...new Set(CHAMADAS.map((c) => c.rota))].sort();
    expect(rotasGetNoDisco()).toEqual(cobertas);
  });

  it.each(CHAMADAS.map((c) => [c.url.replace(base, ''), c] as const))(
    '%s: 200 e nenhuma chave proibida (lista branca vazia)',
    async (_nome, c) => {
      const { status, corpo, texto } = await chamar(c);
      expect(status, texto.slice(0, 300)).toBe(200);
      expect(texto.length).toBeGreaterThan(40);
      const chaves: string[] = [];
      const valores: string[] = [];
      if (typeof corpo === 'string') {
        // CSV do Raio-X: cabeçalhos e linhas são texto
        expect(corpo).not.toMatch(CHAVES_PROIBIDAS_CONTRATO);
        expect(corpo).not.toMatch(VALORES_PROIBIDOS);
      } else {
        varrer(corpo, '$', chaves, valores);
      }
      expect(chaves).toEqual([]);
      expect(valores).toEqual([]);
    },
  );

  it('relatos antigos do indicador antigo voltam como "descontinuado"', async () => {
    const { corpo } = await chamar(CHAMADAS.find((c) => c.rota === 'meus-reportes')!);
    const itens = (corpo as { itens: Array<{ bloco: string; campo: string }> }).itens;
    expect(itens.map((i) => [i.bloco, i.campo])).toEqual([
      ['descontinuado', 'descontinuado'],
      ['descontinuado', 'descontinuado'],
      ['kpis', 'payout'],
    ]);
  });

  it('v2.5: catálogo de séries, chaves de fonte e colunas das 3 tabelas novas sem nota/score', () => {
    const nomes = [
      ...SERIES_FUNDAMENTO,
      ...Object.keys(CATALOGO_SERIES),
      ...Object.values(Prisma.AssetFundamentalsSerieScalarFieldEnum),
      ...Object.values(Prisma.FiiPropertyQualityScalarFieldEnum),
      ...Object.values(Prisma.PlanningAssetTargetScalarFieldEnum),
    ];
    expect(nomes.length).toBeGreaterThan(60);
    expect(nomes.filter((n) => CHAVES_PROIBIDAS_CONTRATO.test(n))).toEqual([]);
    // contratos de resposta novos (alvos, Essencial): chaves do exemplo tipado
    const exemplo: AlvoGetResposta & { marcas: MarcaCelulaEssencial } & Pick<
        FundamentosResposta,
        'textoFonte' | 'dadosIncompletos'
      > = {
      ticker: 'WEGE3',
      alvo: { targetPct: 6, atualizadoEm: '2026-10-15T00:00:00.000Z' },
      marcas: { fallback: true, incompleto: false, fonte: 'cvm' },
      textoFonte: 'Fonte: DFP/ITR (CVM).',
      dadosIncompletos: false,
    };
    const chaves: string[] = [];
    const valores: string[] = [];
    varrer(exemplo, '$', chaves, valores);
    expect(chaves).toEqual([]);
  });

  it('a varredura acusa as chaves por substring (sanidade do próprio teste)', () => {
    const chaves: string[] = [];
    const valores: string[] = [];
    varrer(
      {
        indiceMf: 1,
        x: [{ estadoIndice: 'a' }, { semaforoTela: [] }, { destaque: 'WEGE3' }],
        observacao: 'ok',
        notas: [],
        ratingComunidade: 1,
        score: 2,
        texto: 'Índice MF 9',
      },
      '$',
      chaves,
      valores,
    );
    expect(chaves).toEqual([
      '$.indiceMf',
      '$.x[0].estadoIndice',
      '$.x[1].semaforoTela',
      '$.x[2].destaque',
      '$.notas',
      '$.ratingComunidade',
      '$.score',
    ]);
    expect(valores).toEqual(['$.texto = Índice MF 9']);
  });
});
