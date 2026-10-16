import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinhaQuadroApi } from '@/types/analiseAtivosApi';
import type { CriteriosLinhaApi, PerfilCriterio } from '@/types/analiseAtivosCriterios';

const mocks = vi.hoisted(() => ({
  linhas: vi.fn(),
  criterios: vi.fn(),
  getAssetPrices: vi.fn(),
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>()),
  obterLinhasQuadroApi: mocks.linhas,
}));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/services/analiseAtivos/leitura/criterios/lerCriterios')
  >()),
  obterCriteriosVarios: mocks.criterios,
}));
// Nenhum provedor de preço no caminho (spy: se for chamado, o teste falha).
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mocks.getAssetPrices }));

import {
  MAX_SUGESTOES,
  MAX_SUGESTOES_BUSCA,
  selecionarSugestoes,
  sugestoesComparar,
} from '../sugestoesComparar';
import { API_HGLG11, API_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';

const acao = (ticker: string, over: Partial<LinhaQuadroApi> = {}): LinhaQuadroApi => ({
  ...API_WEGE3,
  ticker,
  nome: `Empresa ${ticker}`,
  setor: 'Outro setor',
  segmento: 'Outro segmento',
  noQuadro: true,
  flags: [],
  pl: { estado: 'ok', valor: 10 },
  ...over,
});
const fii = (ticker: string, over: Partial<LinhaQuadroApi> = {}): LinhaQuadroApi => ({
  ...API_HGLG11,
  ticker,
  nome: `Fundo ${ticker}`,
  segmentoCvm: 'Outro',
  fiiTipo: 'tijolo',
  noQuadro: true,
  flags: [],
  pvp: { estado: 'ok', valor: 0.95 },
  ...over,
});
const crit = (n: number, de: number, perfil: PerfilCriterio): CriteriosLinhaApi => ({
  janela: 5,
  n,
  de,
  marcas: [],
  perfil,
});

const WEGE = acao('WEGE3', { setor: 'Bens Industriais', segmento: 'Motores' });
const ACOES = [
  WEGE,
  acao('ZZZZ3'),
  acao('AAAA3'),
  acao('TUPY3', { setor: 'Bens Industriais', segmento: 'Material Rodoviário' }),
  acao('EMBJ3', { setor: 'Bens Industriais', segmento: 'Material Aeronáutico' }),
  acao('MOTV3', { segmento: 'Motores' }),
  acao('FORA3', { segmento: 'Motores', noQuadro: false }),
  acao('CNPJ3', { segmento: 'Motores', flags: ['cnpj_em_conferencia'] }),
  fii('HGLG11'),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.criterios.mockResolvedValue(new Map());
});

describe('selecionarSugestoes (pura)', () => {
  it('pares do mesmo segmento/setor primeiro (A–Z), depois os demais (A–Z); sem o próprio ativo', () => {
    const r = selecionarSugestoes(WEGE, ACOES, null, new Map()).map((l) => l.ticker);
    expect(r).toEqual(['EMBJ3', 'MOTV3', 'TUPY3', 'AAAA3', 'ZZZZ3']);
  });

  it('nunca fora do Quadro, CNPJ em conferência nem outra classe', () => {
    const r = selecionarSugestoes(WEGE, ACOES, null, new Map()).map((l) => l.ticker);
    expect(r).not.toContain('FORA3');
    expect(r).not.toContain('CNPJ3');
    expect(r).not.toContain('HGLG11');
  });

  it('até 8 sem busca e 12 com busca (sem acento e sem maiúscula)', () => {
    const muitas = [
      WEGE,
      ...Array.from({ length: 20 }, (_, i) => acao(`AB${String(i).padStart(2, '0')}3`)),
    ];
    expect(selecionarSugestoes(WEGE, muitas, null, new Map())).toHaveLength(MAX_SUGESTOES);
    expect(selecionarSugestoes(WEGE, muitas, 'empresa', new Map())).toHaveLength(
      MAX_SUGESTOES_BUSCA,
    );
    const nomes = [WEGE, acao('PETR4', { nome: 'Petróleo Brasileiro' })];
    expect(selecionarSugestoes(WEGE, nomes, 'PETROLEO', new Map()).map((l) => l.ticker)).toEqual([
      'PETR4',
    ]);
  });

  it('FII: só o mesmo perfil (avaliação primeiro; sem ela, tijolo × resto = papel)', () => {
    const alvo = fii('HGLG11', { segmentoCvm: 'Logística' });
    const linhas = [
      alvo,
      fii('XPLG11', { segmentoCvm: 'Logística' }),
      fii('KNCR11', { fiiTipo: 'papel' }),
      fii('HFOF11', { fiiTipo: 'fof' }),
      // híbrido avaliado como tijolo (imóveis ≥ 50% do PL) entra
      fii('HGRU11', { fiiTipo: 'hibrido' }),
      fii('BRCO11'),
    ];
    const criterios = new Map([['HGRU11', crit(4, 6, 'fii_tijolo')]]);
    expect(selecionarSugestoes(alvo, linhas, null, criterios).map((l) => l.ticker)).toEqual([
      'XPLG11',
      'BRCO11',
      'HGRU11',
    ]);
    const papel = fii('KNCR11', { fiiTipo: 'papel' });
    expect(selecionarSugestoes(papel, linhas, null, new Map()).map((l) => l.ticker)).toEqual([
      'HFOF11',
      'HGRU11',
    ]);
  });
});

describe('selecionarSugestoes · v2.5 (tipo exibido)', () => {
  it('mesmo tipo EXIBIDO: híbrido com perfil tijolo na linha é tijolo; FoF é papel', () => {
    const alvo = fii('HGLG11', { segmentoCvm: 'Logística' });
    const linhas = [
      alvo,
      fii('HIBR11', { fiiTipo: 'hibrido', criterios: crit(3, 6, 'fii_tijolo') }),
      fii('HFOF11', { fiiTipo: 'fof', criterios: crit(3, 6, 'fii_papel') }),
      fii('KNCR11', { fiiTipo: 'papel' }),
    ];
    expect(selecionarSugestoes(alvo, linhas, null, new Map()).map((l) => l.ticker)).toEqual([
      'HIBR11',
    ]);
    const papel = fii('KNCR11', { fiiTipo: 'papel' });
    expect(selecionarSugestoes(papel, linhas, null, new Map()).map((l) => l.ticker)).toEqual([
      'HFOF11',
    ]);
  });
});

describe('sugestoesComparar (banco em memória)', () => {
  it('itens com nome, mesmoSetor, métrica da classe e "n de k" da janela pedida', async () => {
    mocks.linhas.mockResolvedValue(ACOES);
    mocks.criterios.mockResolvedValue(new Map([['EMBJ3', crit(3, 6, 'acao')]]));
    const r = await sugestoesComparar({} as never, { ticker: 'wege3', janela: 10, q: null });
    expect(r?.ticker).toBe('WEGE3');
    expect(r?.janela).toBe(10);
    expect(r?.itens[0]).toEqual({
      ticker: 'EMBJ3',
      nome: 'Empresa EMBJ3',
      mesmoSetor: true,
      metrica: { rotulo: 'P/L', valor: { estado: 'ok', valor: 10 }, formato: 'multiplo' },
      criterios: { n: 3, de: 6 },
    });
    expect(r?.itens.at(-1)).toMatchObject({ ticker: 'ZZZZ3', mesmoSetor: false, criterios: null });
    // critérios só da lista final, na janela pedida
    expect(mocks.criterios).toHaveBeenCalledWith(
      {},
      ['EMBJ3', 'MOTV3', 'TUPY3', 'AAAA3', 'ZZZZ3'],
      10,
    );
    expect(mocks.getAssetPrices).not.toHaveBeenCalled();
  });

  it('FII: P/VP como métrica; ticker fora da área = null', async () => {
    mocks.linhas.mockResolvedValue([fii('HGLG11'), fii('XPLG11')]);
    const r = await sugestoesComparar({} as never, { ticker: 'HGLG11', janela: 5, q: null });
    expect(r?.itens).toEqual([
      expect.objectContaining({
        ticker: 'XPLG11',
        metrica: { rotulo: 'P/VP', valor: { estado: 'ok', valor: 0.95 }, formato: 'numero2' },
      }),
    ]);
    expect(await sugestoesComparar({} as never, { ticker: 'NADA3', janela: 5, q: null })).toBe(
      null,
    );
  });

  it('resposta sem nenhuma chave de nota/índice/semáforo/destaque (contratoSemNota)', async () => {
    mocks.linhas.mockResolvedValue(ACOES);
    const r = await sugestoesComparar({} as never, { ticker: 'WEGE3', janela: 5, q: null });
    expect(JSON.stringify(r)).not.toMatch(/indice|semaforo|destaque|nota|rating|score/i);
  });
});
