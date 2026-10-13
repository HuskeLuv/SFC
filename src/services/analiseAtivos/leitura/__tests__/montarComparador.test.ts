import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  analiseQuadroLinha: { aggregate: vi.fn(), findMany: vi.fn() },
  assetMultiplesCurrent: { findMany: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  assetPerShareYearly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
  criteriaParams: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const mockCriteriosVarios = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
// critérios (criteria_eval) vêm da fatia A: aqui, fixtures por ticker na janela pedida
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  obterCriteriosVarios: mockCriteriosVarios,
}));

import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  _limparCacheComparador,
  _tamanhoCacheComparador,
  montarComparador,
  normalizarTickers,
} from '../comparador/montarComparador';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import type {
  ComparadorRespostaV2,
  LinhaComparadorV2,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import {
  CRITERIOS_LINHA_HGLG11,
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_KNCR11,
  CRITERIOS_LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import {
  GERADO_EM_FIXTURE,
  LINHA_HGLG11,
  LINHA_ITUB4,
  LINHA_WEGE3,
  linhaQuadroDb,
} from '@/test/fixtures/analiseAtivos/linhasDb';
import type { CriteriosLinhaApi, Janela } from '@/types/analiseAtivosCriterios';

const HOJE = '2026-10-08';

const PETR4 = linhaQuadroDb({
  symbol: 'PETR4',
  cnpj: '33000167000101',
  nome: 'Petrobras',
  anosLucroConsecutivos: 4,
  roePct: 27.7,
  pl: 4.7,
  pvp: 1.32,
  dy12mPct: 7.4,
  margemLiquidaPct: 18,
  divLiqEbitda: 1.1,
  payoutPct: 60,
  serie10a: [2016, 2017, 2018, 2019, 2020].map((ano, i) => ({
    ano,
    valor: [-14, 0.4, 25, 40, 7][i],
  })),
});
const TAEE11 = linhaQuadroDb({
  symbol: 'TAEE11',
  cnpj: '07859971000130',
  nome: 'Taesa',
  anosLucroConsecutivos: 12,
  roePct: 20.1,
  pl: 8.6,
  pvp: 1.73,
  dy12mPct: 7.4,
  margemLiquidaPct: 36.2,
  divLiqEbitda: 3.48,
  payoutPct: 63.7,
});
const SBSP3 = linhaQuadroDb({
  symbol: 'SBSP3',
  cnpj: '43776517000180',
  nome: 'Sabesp',
  pl: 12,
  pvp: 2,
  dy12mPct: 2,
  flags: ['conf:preco_base:base_sem_evento@2026-09-01'],
});
const XPLG11 = linhaQuadroDb({
  symbol: 'XPLG11',
  classe: 'fii',
  cnpj: '26502794000185',
  nome: 'XP Log FII',
  fiiTipo: 'tijolo',
  regua: 'fii_tijolo',
  mesesComRendimento: 99,
  pvp: 0.88,
  dy12mPct: 10.7,
  obrigacoesPlPct: 14.6,
  vacanciaFisicaCvmPct: 18.3,
  nImoveisCvm: 29,
});
const KNCR11 = linhaQuadroDb({
  symbol: 'KNCR11',
  classe: 'fii',
  cnpj: '16706958000132',
  nome: 'Kinea Rendimentos',
  fiiTipo: 'papel',
  regua: 'fii_papel',
  mesesComRendimento: 123,
  pvp: 1.03,
  dy12mPct: 13.3,
  obrigacoesPlPct: 0.1,
});
const MXRF11 = linhaQuadroDb({
  symbol: 'MXRF11',
  classe: 'fii',
  cnpj: '97521225000125',
  nome: 'Maxi Renda',
  fiiTipo: 'papel',
  regua: 'fii_papel',
  mesesComRendimento: 150,
  pvp: 0.98,
  dy12mPct: 12.1,
  obrigacoesPlPct: 3,
});
const GSRF11 = linhaQuadroDb({
  symbol: 'GSRF11',
  classe: 'fii',
  cnpj: '43000000000100',
  nome: 'GSR FII',
  fiiTipo: 'tijolo',
  regua: 'fii_tijolo',
  pvp: 0.5,
  flags: ['conf:fii_vp:vp_salto@2026-08'],
});

const LINHAS = [
  LINHA_WEGE3,
  LINHA_ITUB4,
  LINHA_HGLG11,
  PETR4,
  TAEE11,
  SBSP3,
  XPLG11,
  KNCR11,
  MXRF11,
  GSRF11,
];

const ATUAIS = [
  {
    symbol: 'WEGE3',
    divLiqPl: -0.15,
    pReceita: 5.17,
    rend12m: null,
    vpCota: null,
    naoSeAplica: [],
  },
  { symbol: 'PETR4', divLiqPl: 0.7, pReceita: 0.9, rend12m: null, vpCota: null, naoSeAplica: [] },
  {
    symbol: 'ITUB4',
    divLiqPl: null,
    pReceita: null,
    rend12m: null,
    vpCota: null,
    naoSeAplica: ['divLiqPl'],
  },
  {
    symbol: 'TAEE11',
    divLiqPl: 1.27,
    pReceita: 3.03,
    rend12m: null,
    vpCota: null,
    naoSeAplica: [],
  },
  {
    symbol: 'HGLG11',
    divLiqPl: null,
    pReceita: null,
    rend12m: 13.34,
    vpCota: 165.95,
    naoSeAplica: [],
  },
  {
    symbol: 'XPLG11',
    divLiqPl: null,
    pReceita: null,
    rend12m: 9.84,
    vpCota: 104.65,
    naoSeAplica: [],
  },
  { symbol: 'GSRF11', divLiqPl: null, pReceita: null, rend12m: 1, vpCota: 300, naoSeAplica: [] },
];

function prepararBanco() {
  mockPrisma.analiseQuadroLinha.aggregate.mockResolvedValue({
    _max: { geradoEm: GERADO_EM_FIXTURE },
  });
  mockPrisma.analiseQuadroLinha.findMany.mockResolvedValue(
    [...LINHAS].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );
  mockPrisma.assetMultiplesCurrent.findMany.mockImplementation(
    async ({ where }: { where: { symbol: { in: string[] } } }) =>
      ATUAIS.filter((a) => where.symbol.in.includes(a.symbol)),
  );
  mockPrisma.fiiQuarterly.findMany.mockResolvedValue([
    {
      cnpj: LINHA_HGLG11.cnpj,
      nImoveisRenda: 35,
      nImoveisOutros: 2,
      areaM2: 2066000,
      nCri: 0,
      maiorCriPct: null,
    },
    {
      cnpj: KNCR11.cnpj,
      nImoveisRenda: null,
      nImoveisOutros: null,
      areaM2: null,
      nCri: 96,
      maiorCriPct: 4.8,
    },
    {
      cnpj: MXRF11.cnpj,
      nImoveisRenda: null,
      nImoveisOutros: null,
      areaM2: null,
      nCri: 120,
      maiorCriPct: 6,
    },
  ]);
  mockPrisma.assetPerShareYearly.findMany.mockResolvedValue([
    { symbol: 'HGLG11', anoFiscal: 2017, vpCotaFim: 1127.27, flags: [] },
    { symbol: 'HGLG11', anoFiscal: 2018, vpCotaFim: 115, flags: [] },
    { symbol: 'HGLG11', anoFiscal: 2019, vpCotaFim: 120, flags: [] },
    { symbol: 'XPLG11', anoFiscal: 2017, vpCotaFim: 100, flags: [] },
    { symbol: 'XPLG11', anoFiscal: 2018, vpCotaFim: 102, flags: [] },
    { symbol: 'XPLG11', anoFiscal: 2019, vpCotaFim: 104, flags: [] },
  ]);
  mockPrisma.fiiMonthly.findMany.mockResolvedValue([
    { cnpj: LINHA_HGLG11.cnpj, refMonth: new Date('2018-03-01T00:00:00Z'), fatorDesdobramento: 10 },
  ]);
  mockPrisma.criteriaParams.findFirst.mockResolvedValue({ version: 1, params: CRITERIA_PARAMS_V1 });
  mockCriteriosVarios.mockImplementation(
    async (_p: unknown, symbols: readonly string[], janela: Janela) =>
      new Map(
        symbols
          .filter((s) => CRITERIOS[s])
          .map((s) => [s, { ...CRITERIOS[s], janela } as CriteriosLinhaApi]),
      ),
  );
}

/** Critérios da janela por ticker (PETR4, TAEE11, SBSP3, GSRF11 ficam sem avaliação). */
const CRITERIOS: Record<string, CriteriosLinhaApi> = {
  WEGE3: CRITERIOS_LINHA_WEGE3,
  ITUB4: CRITERIOS_LINHA_ITUB4,
  HGLG11: CRITERIOS_LINHA_HGLG11,
  KNCR11: CRITERIOS_LINHA_KNCR11,
  MXRF11: { ...CRITERIOS_LINHA_KNCR11, n: 3 },
  // XPLG11: rótulo tijolo, mas o PERFIL (rec. 3) diz papel — o misto segue o perfil
  XPLG11: { ...CRITERIOS_LINHA_KNCR11, n: 1 },
};

/** Todas as chaves (recursivo) de um JSON. */
function chaves(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((v) => chaves(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      out.push(k);
      chaves(v, out);
    }
  }
  return out;
}

const linhaDe = (r: ComparadorRespostaV2, codigo: string): LinhaComparadorV2 =>
  r.grupos.flatMap((g) => g.linhas).find((l) => l.codigo === codigo)!;

async function montar(t: string[], janela: Janela = 5) {
  const r = await montarComparador(t, HOJE, janela);
  if (!r) throw new Error('sem resposta');
  return r.dados;
}

describe('montarComparador (v2.4, isonômico)', () => {
  beforeEach(() => {
    _resetarCacheLinhasQuadro();
    _limparCacheComparador();
    vi.clearAllMocks();
    prepararBanco();
  });

  it('normaliza: maiúsculas, dedupe, formato', () => {
    expect(normalizarTickers([' wege3', 'WEGE3', 'X;Y', '', 'itub4'])).toEqual({
      validos: ['WEGE3', 'ITUB4'],
      ignorados: [{ ticker: 'X;Y', motivo: 'formato' }],
    });
  });

  it('nenhum ticker válido ⇒ null', async () => {
    expect(await montarComparador(['xx', '!!'], HOJE)).toBeNull();
  });

  it('WEGE3/PETR4/ITUB4: critérios primeiro, financeira n/a, ordem dos slots', async () => {
    const r = await montar(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.classe).toBe('acao');
    expect(r.janela).toBe(5);
    expect(r.tickers).toEqual(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.ativos.map((a) => a.ticker)).toEqual(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.graficos?.series.map((s) => s.ticker)).toEqual(['WEGE3', 'PETR4', 'ITUB4']);

    // critérios: n de 6 e n de 3 (financeira, D4); sem avaliação = null
    expect(r.ativos.map((a) => a.criterios && `${a.criterios.n} de ${a.criterios.de}`)).toEqual([
      '5 de 6',
      null,
      '2 de 3',
    ]);
    expect(Object.keys(r.criterios.rotulos)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
    expect(r.criterios.equivalencias).toEqual({});
    expect(r.leitura.contagens).toEqual([
      { ticker: 'WEGE3', n: 5, de: 6 },
      { ticker: 'PETR4', n: null, de: null },
      { ticker: 'ITUB4', n: 2, de: 3 },
    ]);
    expect(r.leitura.texto).toBe(LEITURA_DOS_DADOS.texto);

    // grupos de ações: Qualidade · Endividamento · Preço · Dividendos
    expect(r.grupos.map((g) => g.codigo)).toEqual([
      'qualidade',
      'endividamento',
      'preco',
      'dividendos',
    ]);
    expect(linhaDe(r, 'margemLiquida').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'divLiqEbitda').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'divLiqPl').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'pReceita').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'divLiqPl').valores.WEGE3).toEqual({ estado: 'ok', valor: -0.15 });
    // WEGE3 com provento_suspeito (legado) ⇒ DY em conferência com selo
    expect(linhaDe(r, 'dy12m').conferencia.WEGE3?.exibicao).toBe('selo');
    expect(r.misto).toBe(false);
    // PETR4: lucro negativo no 1º ano ⇒ base no 1º ano > 0
    const petr = r.graficos!.series[1];
    expect(petr.pontos[0]).toBeNull();
    expect(petr.pontos[1]).toBe(100);
  });

  it('contrato isonômico: nenhuma chave de Índice, semáforo, marca de valor ou placar', async () => {
    for (const t of [
      ['WEGE3', 'PETR4', 'ITUB4'],
      ['HGLG11', 'KNCR11'],
    ]) {
      const r = await montar(t);
      const ks = chaves(r);
      expect(
        ks.filter((k) => /indice|semaforo|destaque|direcao|nota|rating|score/i.test(k)),
      ).toEqual([]);
      expect(ks).not.toContain('resumo');
      expect(ks).not.toContain('regua');
    }
  });

  it('financeira sem avaliação de critérios: a régua gravada no Quadro ainda dá n/a (D4)', async () => {
    mockCriteriosVarios.mockResolvedValue(new Map());
    const r = await montar(['WEGE3', 'ITUB4']);
    expect(r.ativos.every((a) => a.criterios === null)).toBe(true);
    expect(linhaDe(r, 'margemLiquida').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(r.leitura.contagens.map((c) => c.n)).toEqual([null, null]);
  });

  it('classe do 1º ticker; outra classe, inexistente e excesso ignorados com motivo', async () => {
    const r = await montar(['WEGE3', 'HGLG11', 'ZZZZ3', 'TAEE11', 'PETR4', 'ITUB4', 'SBSP3']);
    expect(r.tickers).toEqual(['WEGE3', 'TAEE11', 'PETR4', 'ITUB4']);
    expect(r.ignorados).toEqual([
      { ticker: 'HGLG11', motivo: 'outra_classe' },
      { ticker: 'ZZZZ3', motivo: 'inexistente' },
      { ticker: 'SBSP3', motivo: 'excesso' },
    ]);
  });

  it('HGLG11/GSRF11 (tijolo): imóveis da CVM, vacância com selo, Obrigações/PL comum', async () => {
    const r = await montar(['HGLG11', 'GSRF11']);
    expect(r.classe).toBe('fii');
    expect(r.misto).toBe(false);
    expect(r.grupos.map((g) => g.codigo)).toEqual([
      'renda',
      'preco',
      'endividamento',
      'imoveis',
      'tamanhoLiquidez',
    ]);
    expect(r.grupos.find((g) => g.codigo === 'imoveis')!.rotulo).toBe(
      'Qualidade dos imóveis · fonte CVM',
    );
    expect(linhaDe(r, 'vacanciaFisica').fonteCvmAviso).toBe(true);
    expect(linhaDe(r, 'nImoveis').valores.HGLG11).toEqual({ estado: 'ok', valor: 37 });
    expect(linhaDe(r, 'areaInformada').valores.HGLG11).toEqual({ estado: 'ok', valor: 2066 });
    expect(linhaDe(r, 'obrigacoesPl').valores.HGLG11.estado).toBe('ok');
    expect(Object.keys(r.criterios.rotulos)).toEqual(['rend', 'vp', 'vac', 'alav', 'mes', 'res']);
    // GSRF11 sem avaliação: tijolo pela régua do Quadro
    expect(r.ativos[1].tipoComparacao).toBe('tijolo');
  });

  it('VP/cota do HGLG11 no mini-gráfico na base de cotas de hoje', async () => {
    const r = await montar(['HGLG11', 'GSRF11']);
    const hglg = r.graficos!.series[0];
    expect(r.graficos!.anos[0]).toBe(2017);
    expect(hglg.pontos[0]).toBe(100);
    expect(hglg.pontos[1]).toBeCloseTo(102, 0);
    expect(r.graficos!.titulo).toBe('VP por cota desde 2017');
  });

  it('KNCR11/MXRF11 (papel): ativos da carteira (nº de CRIs) e rótulos de papel', async () => {
    const r = await montar(['KNCR11', 'MXRF11']);
    expect(r.grupos.map((g) => g.codigo)).toContain('ativosPapel');
    expect(r.grupos.map((g) => g.codigo)).not.toContain('imoveis');
    expect(linhaDe(r, 'nCri').valores).toEqual({
      KNCR11: { estado: 'ok', valor: 96 },
      MXRF11: { estado: 'ok', valor: 120 },
    });
    expect(Object.keys(r.criterios.rotulos)).toEqual(['rend', 'vp', 'inad', 'ltv', 'mes', 'res']);
  });

  it('misto (tijolo + papel): n/a por grupo, Obrigações/PL nos dois e rótulos em par', async () => {
    const r = await montar(['HGLG11', 'KNCR11']);
    expect(r.misto).toBe(true);
    const rotulos = r.grupos.map((g) => g.rotulo);
    expect(rotulos).toContain('Qualidade dos imóveis (tijolo) · fonte CVM');
    expect(rotulos).toContain('Qualidade dos ativos da carteira (papel) · fonte CVM');
    for (const c of ['vacanciaFisica', 'nImoveis', 'areaInformada']) {
      expect(linhaDe(r, c).valores.KNCR11.estado).toBe('nao_se_aplica');
      expect(linhaDe(r, c).valores.HGLG11.estado).not.toBe('nao_se_aplica');
    }
    expect(linhaDe(r, 'nCri').valores.HGLG11.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'nCri').valores.KNCR11).toEqual({ estado: 'ok', valor: 96 });
    // Obrigações/PL é comum aos dois tipos: nenhum n/a
    expect(linhaDe(r, 'obrigacoesPl').valores.HGLG11.estado).toBe('ok');
    expect(linhaDe(r, 'obrigacoesPl').valores.KNCR11.estado).toBe('ok');
    expect(r.criterios.rotulos.alav).toBe('Obrigações/PL ≤ 20% / LTV ≤ 60%');
    expect(r.criterios.rotulos.vac).toBe('Vacância ≤ 10% / Inadimplência ≤ 3%');
    expect(r.criterios.equivalencias).toEqual({ vac: 'inad', alav: 'ltv' });
  });

  it('o misto é decidido pelo PERFIL de critérios, não pelo rótulo do fundo', async () => {
    const r = await montar(['XPLG11', 'KNCR11']);
    expect(r.misto).toBe(false);
    expect(r.ativos.map((a) => a.tipoComparacao)).toEqual(['papel', 'papel']);
    expect(r.grupos.map((g) => g.codigo)).not.toContain('imoveis');
  });

  it('SBSP3: preço em conferência (preco_base) ⇒ P/L e P/VP ocultos com chip', async () => {
    const r = await montar(['SBSP3', 'TAEE11', 'WEGE3']);
    const pl = linhaDe(r, 'pl');
    expect(pl.valores.SBSP3.estado).toBe('ausente');
    expect(pl.conferencia.SBSP3?.exibicao).toBe('ocultar');
    expect(pl.conferencia.SBSP3?.motivo).toContain('cotação');
    expect(pl.valores.TAEE11.estado).toBe('ok');
    expect(r.ativos[0].conferencias).toContain('preco_base');
  });

  it('GSRF11: VP/cota oculto', async () => {
    const r = await montar(['GSRF11', 'HGLG11']);
    const vp = linhaDe(r, 'vpCota');
    expect(vp.valores.GSRF11.estado).toBe('ausente');
    expect(vp.conferencia.GSRF11?.exibicao).toBe('ocultar');
    expect(linhaDe(r, 'pvpFii').conferencia.GSRF11?.exibicao).toBe('ocultar');
  });

  it('janela: critérios lidos na janela pedida; o cache separa por janela', async () => {
    const r3 = await montar(['WEGE3', 'ITUB4'], 3);
    expect(r3.janela).toBe(3);
    expect(r3.leitura.janela).toBe(3);
    expect(r3.ativos[0].criterios?.janela).toBe(3);
    expect(mockCriteriosVarios).toHaveBeenLastCalledWith(expect.anything(), expect.any(Array), 3);
    const r10 = await montarComparador(['WEGE3', 'ITUB4'], HOJE, 10);
    expect(r10?.cache).toBe(false);
    expect(r10?.dados.ativos[0].criterios?.janela).toBe(10);
    expect(_tamanhoCacheComparador()).toBe(2);
  });

  it('sem criteria_params no banco: rótulos do v1 do código (nada quebra)', async () => {
    mockPrisma.criteriaParams.findFirst.mockResolvedValue(null);
    const r = await montar(['WEGE3']);
    expect(r.criterios.rotulos.rec).toBe('Receita crescente');
  });

  it('cache limitado por conjunto ordenado: reordena pelos slots sem nova leitura', async () => {
    const a = await montarComparador(['WEGE3', 'ITUB4'], HOJE);
    expect(a?.cache).toBe(false);
    const b = await montarComparador(['ITUB4', 'WEGE3'], HOJE);
    expect(b?.cache).toBe(true);
    expect(b?.dados.ativos.map((x) => x.ticker)).toEqual(['ITUB4', 'WEGE3']);
    expect(b?.dados.leitura.contagens.map((x) => x.ticker)).toEqual(['ITUB4', 'WEGE3']);
    expect(mockPrisma.assetMultiplesCurrent.findMany).toHaveBeenCalledTimes(1);
    expect(_tamanhoCacheComparador()).toBe(1);
  });

  it('nenhum texto da resposta com palavra proibida (linguagemV2; literal à parte)', async () => {
    for (const t of [
      ['HGLG11', 'KNCR11'],
      ['WEGE3', 'ITUB4'],
    ]) {
      const r = await montar(t);
      const textos = [
        ...r.grupos.flatMap((g) => [g.rotulo, ...g.linhas.flatMap((l) => [l.rotulo, l.sub ?? ''])]),
        ...Object.values(r.criterios.rotulos),
        r.graficos?.titulo ?? '',
      ];
      for (const x of textos) expect(encontrarProibidasV2(x as string)).toEqual([]);
      expect(encontrarProibidasV2(r.leitura.texto, { ignorarLiterais: true })).toEqual([]);
    }
  });

  it('ativo com Decimal no preço sai em número', async () => {
    const r = await montar(['WEGE3', 'ITUB4']);
    expect(r.ativos[0].preco).toEqual({ estado: 'ok', valor: Number(new Prisma.Decimal('41.2')) });
  });
});
