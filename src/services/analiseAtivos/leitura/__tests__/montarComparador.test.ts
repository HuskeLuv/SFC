import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  analiseQuadroLinha: { aggregate: vi.fn(), findMany: vi.fn() },
  assetMultiplesCurrent: { findMany: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  assetPerShareYearly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  _limparCacheComparador,
  _tamanhoCacheComparador,
  montarComparador,
  normalizarTickers,
} from '../comparador/montarComparador';
import { encontrarPalavrasProibidasBlocoD } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import {
  GERADO_EM_FIXTURE,
  LINHA_HGLG11,
  LINHA_ITUB4,
  LINHA_WEGE3,
  linhaQuadroDb,
} from '@/test/fixtures/analiseAtivos/linhasDb';
import type { ComparadorResposta, LinhaComparador } from '@/types/analiseAtivosBlocoD';

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
}

const linhaDe = (r: ComparadorResposta, codigo: string): LinhaComparador =>
  r.grupos.flatMap((g) => g.linhas).find((l) => l.codigo === codigo)!;

async function montar(t: string[]) {
  const r = await montarComparador(t, HOJE);
  if (!r) throw new Error('sem resposta');
  return r.dados;
}

describe('montarComparador', () => {
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

  it('WEGE3/PETR4/ITUB4: financeira n/a, ★ com direção, payout neutro, ordem dos slots', async () => {
    const r = await montar(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.classe).toBe('acao');
    expect(r.tickers).toEqual(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.ativos.map((a) => a.ticker)).toEqual(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.resumo.indices.map((i) => i.ticker)).toEqual(['WEGE3', 'PETR4', 'ITUB4']);
    expect(r.graficos?.series.map((s) => s.ticker)).toEqual(['WEGE3', 'PETR4', 'ITUB4']);

    expect(linhaDe(r, 'margemLiquida').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'divLiqEbitda').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'divLiqPl').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'pReceita').valores.ITUB4.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'roe').destaque).toBe('WEGE3');
    expect(linhaDe(r, 'divLiqPl').destaque).toBe('WEGE3');
    expect(linhaDe(r, 'divLiqPl').valores.WEGE3).toEqual({ estado: 'ok', valor: -0.15 });
    expect(linhaDe(r, 'pl').destaque).toBe('PETR4');
    expect(linhaDe(r, 'payout').destaque).toBeNull();
    expect(linhaDe(r, 'payout').motivoSemDestaque).toBe('neutro');
    // WEGE3 com provento_suspeito (legado) ⇒ DY em conferência com selo, fora do ★
    expect(linhaDe(r, 'dy12m').conferencia.WEGE3?.exibicao).toBe('selo');
    expect(linhaDe(r, 'dy12m').destaque).toBe('PETR4');
    expect(r.resumo.emConferencia[0].ticker).toBe('WEGE3');
    expect(r.misto).toBe(false);
    // PETR4: lucro negativo no 1º ano ⇒ base no 1º ano > 0
    const petr = r.graficos!.series[1];
    expect(petr.pontos[0]).toBeNull();
    expect(petr.pontos[1]).toBe(100);
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

  it('HGLG11/XPLG11: imóveis com fonte CVM e sem ★; VP/cota na base de cotas de hoje', async () => {
    const r = await montar(['HGLG11', 'XPLG11']);
    expect(r.classe).toBe('fii');
    expect(r.grupos.map((g) => g.codigo)).toContain('imoveis');
    expect(r.grupos.map((g) => g.codigo)).not.toContain('cris');
    const vac = linhaDe(r, 'vacanciaFisica');
    expect(vac.destaque).toBeNull();
    expect(vac.motivoSemDestaque).toBe('sem_validacao_cvm');
    expect(vac.fonteCvmAviso).toBe(true);
    expect(linhaDe(r, 'nImoveis').valores.HGLG11).toEqual({ estado: 'ok', valor: 37 });
    expect(linhaDe(r, 'areaInformada').valores.HGLG11).toEqual({ estado: 'ok', valor: 2066 });
    expect(linhaDe(r, 'pvpFii').destaque).toBe('XPLG11');
    expect(linhaDe(r, 'mesesComRendimento').destaque).toBe('HGLG11');
    expect(linhaDe(r, 'rendimentoCota').motivoSemDestaque).toBe('neutro');
    const hglg = r.graficos!.series[0];
    expect(r.graficos!.anos).toEqual([2017, 2018, 2019]);
    expect(hglg.pontos[0]).toBe(100);
    expect(hglg.pontos[1]).toBeCloseTo(102, 0);
    expect(r.graficos!.titulo).toBe('VP por cota desde 2017');
  });

  it('KNCR11/MXRF11 (papel): CRIs provisórios, P/VP perto de 1', async () => {
    const r = await montar(['KNCR11', 'MXRF11']);
    expect(r.grupos.map((g) => g.codigo)).toContain('cris');
    expect(r.grupos.map((g) => g.codigo)).not.toContain('imoveis');
    expect(linhaDe(r, 'nCri').destaque).toBe('MXRF11');
    expect(linhaDe(r, 'nCri').criterioProvisorio).toBe(true);
    expect(linhaDe(r, 'maiorCri').destaque).toBe('KNCR11');
    const pvp = linhaDe(r, 'pvpFii');
    expect(pvp.direcao).toBe('perto_de_1');
    expect(pvp.destaque).toBe('MXRF11'); // |0,98−1| < |1,03−1|
  });

  it('misto (tijolo + papel): aviso, n/a cruzado e P/VP sem ★', async () => {
    const r = await montar(['HGLG11', 'KNCR11']);
    expect(r.misto).toBe(true);
    expect(linhaDe(r, 'nImoveis').valores.KNCR11.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'nCri').valores.HGLG11.estado).toBe('nao_se_aplica');
    expect(linhaDe(r, 'pvpFii').motivoSemDestaque).toBe('tipos_diferentes');
    // nº de CRIs: só KNCR11 aplicável ⇒ menos de 2
    expect(linhaDe(r, 'nCri').motivoSemDestaque).toBe('menos_de_2');
  });

  it('SBSP3: preço em conferência (preco_base) ⇒ P/L e P/VP ocultos com chip, sem ★', async () => {
    const r = await montar(['SBSP3', 'TAEE11', 'WEGE3']);
    const pl = linhaDe(r, 'pl');
    expect(pl.valores.SBSP3.estado).toBe('ausente');
    expect(pl.conferencia.SBSP3?.exibicao).toBe('ocultar');
    expect(pl.conferencia.SBSP3?.motivo).toContain('cotação');
    expect(pl.destaque).toBe('TAEE11');
    expect(r.ativos[0].conferencias).toContain('preco_base');
  });

  it('GSRF11: VP/cota oculto', async () => {
    const r = await montar(['GSRF11', 'XPLG11']);
    const vp = linhaDe(r, 'vpCota');
    expect(vp.valores.GSRF11.estado).toBe('ausente');
    expect(vp.conferencia.GSRF11?.exibicao).toBe('ocultar');
    expect(linhaDe(r, 'pvpFii').conferencia.GSRF11?.exibicao).toBe('ocultar');
  });

  it('cache limitado por conjunto ordenado: reordena pelos slots sem nova leitura', async () => {
    const a = await montarComparador(['WEGE3', 'ITUB4'], HOJE);
    expect(a?.cache).toBe(false);
    const b = await montarComparador(['ITUB4', 'WEGE3'], HOJE);
    expect(b?.cache).toBe(true);
    expect(b?.dados.ativos.map((x) => x.ticker)).toEqual(['ITUB4', 'WEGE3']);
    expect(mockPrisma.assetMultiplesCurrent.findMany).toHaveBeenCalledTimes(1);
    expect(_tamanhoCacheComparador()).toBe(1);
  });

  it('nenhum texto da resposta com palavra proibida', async () => {
    const r = await montar(['HGLG11', 'KNCR11']);
    const textos = [
      ...r.grupos.flatMap((g) => [g.rotulo, ...g.linhas.flatMap((l) => [l.rotulo, l.sub ?? ''])]),
      r.graficos?.titulo ?? '',
      r.resumo.responsabilidade,
    ];
    for (const t of textos) expect(encontrarPalavrasProibidasBlocoD(t)).toEqual([]);
  });

  it('ativo com Decimal no preço sai em número', async () => {
    const r = await montar(['WEGE3', 'ITUB4']);
    expect(r.ativos[0].preco).toEqual({ estado: 'ok', valor: Number(new Prisma.Decimal('41.2')) });
  });
});
