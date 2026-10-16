// @vitest-environment jsdom
/**
 * Caso 32 (spec v2.4 §4.5) no Comparador — fatia D: o DOM renderizado (computador e celular, ações
 * e FIIs misto) passa no varrerDom (sem ★, destaque, Índice, nota, vencedor, melhor/pior; literais
 * só com data-texto-legal e texto exato; nomes do banco em data-nome-ativo) e NENHUMA célula tem
 * fundo diferente das outras: a comparação é isonômica.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import {
  CRITERIOS_LINHA_HGLG11,
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_KNCR11,
  CRITERIOS_LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { MarcaCriterioLinha } from '@/types/analiseAtivosCriterios';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';

const estado = vi.hoisted(() => ({
  query: '',
  celular: false,
  dados: undefined as unknown,
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: estado.replace, push: vi.fn() }),
  usePathname: () => '/analise-ativos/comparador',
  useSearchParams: () => new URLSearchParams(estado.query),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIsBelowLg: () => estado.celular,
}));
vi.mock('@/hooks/useAnaliseAtivosBlocoD', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useComparador: () => ({
    data: estado.dados,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAnaliseAtivos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIndiceBusca: () => ({ data: undefined }),
  useOverlayCarteira: () => ({ data: undefined }),
}));
vi.mock('@/components/analiseAtivos/quadro/CelulaNaCarteira', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNaCarteira: () => ({
    fonte: null,
    info: (t: string) =>
      t === 'WEGE3' || t === 'HGLG11'
        ? { tipo: 'posicao', quantidade: 100, percentual: 4.7 }
        : { tipo: 'nenhum' },
    conjunto: new Set<string>(),
  }),
}));

import Comparador from '@/components/analiseAtivos/comparador/Comparador';

const ok = (valor: number) => ({ estado: 'ok' as const, valor });
const na = { estado: 'nao_se_aplica' as const, motivo: 'financeira', texto: 'n/a' };

function ativo(
  ticker: string,
  nome: string,
  tipo: 'acao' | 'tijolo' | 'papel',
  criterios: ComparadorResposta['ativos'][number]['criterios'],
): ComparadorResposta['ativos'][number] {
  return {
    ticker,
    nome,
    preco: ok(40),
    precoData: '2026-10-10',
    fiiTipo: tipo === 'acao' ? null : tipo,
    tipoComparacao: tipo,
    criterios,
    noQuadro: true,
    foraDoQuadroMotivo: null,
    conferencias: [],
    pares: [],
  };
}

const ACOES: ComparadorResposta = {
  classe: 'acao',
  janela: 5,
  tickers: ['WEGE3', 'ITUB4', 'TAEE11'],
  ignorados: [],
  misto: false,
  ativos: [
    ativo('WEGE3', 'WEG', 'acao', CRITERIOS_LINHA_WEGE3),
    ativo('ITUB4', 'Itaú Unibanco', 'acao', CRITERIOS_LINHA_ITUB4),
    ativo('TAEE11', 'Taesa', 'acao', null),
  ],
  criterios: {
    rotulos: Object.fromEntries(CRITERIA_PARAMS_V1.perfis.acao.map((c) => [c.id, c.rotulo])),
    equivalencias: {},
  },
  grupos: [
    {
      codigo: 'qualidade',
      rotulo: 'Qualidade',
      aplicavelA: ['acao'],
      linhas: [
        {
          codigo: 'roe',
          rotulo: 'ROE',
          sub: '12 meses',
          formato: 'pct',
          fonteCvmAviso: false,
          valores: { WEGE3: ok(31.2), ITUB4: ok(22.1), TAEE11: ok(20.1) },
          conferencia: { WEGE3: null, ITUB4: null, TAEE11: null },
        },
        {
          codigo: 'margemLiquida',
          rotulo: 'Margem líquida',
          sub: '12 meses',
          formato: 'pct',
          fonteCvmAviso: false,
          valores: { WEGE3: ok(15.6), ITUB4: na, TAEE11: ok(36.2) },
          conferencia: {
            WEGE3: null,
            ITUB4: null,
            TAEE11: { exibicao: 'selo', motivo: 'Valor em conferência.' },
          },
        },
      ],
    },
    {
      codigo: 'preco',
      rotulo: 'Preço',
      aplicavelA: ['acao'],
      linhas: [
        {
          codigo: 'pl',
          rotulo: 'P/L',
          sub: 'cotação ÷ LPA 12m',
          formato: 'numero',
          fonteCvmAviso: false,
          valores: { WEGE3: ok(28.4), ITUB4: ok(9.1), TAEE11: ok(8.6) },
          conferencia: { WEGE3: null, ITUB4: null, TAEE11: null },
        },
      ],
    },
  ],
  graficos: {
    tipo: 'lucro',
    titulo: 'Lucro líquido em 10 anos',
    anos: [2021, 2022, 2023, 2024, 2025],
    escala: { min: 90, max: 250 },
    series: ['WEGE3', 'ITUB4', 'TAEE11'].map((t, i) => ({
      ticker: t,
      pontos: [100, 120 + i * 10, 150, 180, 200 + i * 20],
      emConferencia: [false, false, false, false, false],
      insuficiente: false,
    })),
  },
  leitura: {
    janela: 5,
    contagens: [
      { ticker: 'WEGE3', n: 5, de: 6 },
      { ticker: 'ITUB4', n: 2, de: 3 },
      { ticker: 'TAEE11', n: null, de: null },
    ],
    texto: LEITURA_DOS_DADOS.texto,
  },
  versao: 'c2:x',
};

const FIIS_MISTO: ComparadorResposta = {
  ...ACOES,
  classe: 'fii',
  tickers: ['HGLG11', 'KNCR11'],
  misto: true,
  ativos: [
    // nome do banco com "Índices" fica em data-nome-ativo (fora da varredura)
    ativo('HGLG11', 'CSHG Logística Índices', 'tijolo', CRITERIOS_LINHA_HGLG11),
    ativo('KNCR11', 'Kinea Rendimentos Imobiliários', 'papel', CRITERIOS_LINHA_KNCR11),
  ],
  criterios: {
    rotulos: {
      rend: 'Rendimento/cota crescente',
      vp: 'VP/cota crescente',
      vac: 'Vacância ≤ 10% / Inadimplência ≤ 3%',
      alav: 'Obrigações/PL ≤ 20% / LTV ≤ 60%',
      mes: 'Rendimento todos os meses',
      res: 'Resultado crescente',
    },
    equivalencias: { vac: 'inad', alav: 'ltv' },
  },
  grupos: [
    {
      codigo: 'endividamento',
      rotulo: 'Endividamento · fonte CVM',
      aplicavelA: ['tijolo', 'papel'],
      linhas: [
        {
          codigo: 'obrigacoesPl',
          rotulo: 'Obrigações/PL',
          sub: null,
          formato: 'pct',
          fonteCvmAviso: false,
          valores: { HGLG11: ok(20.2), KNCR11: ok(0.1) },
          conferencia: { HGLG11: null, KNCR11: null },
        },
      ],
    },
    {
      codigo: 'imoveis',
      rotulo: 'Qualidade dos imóveis (tijolo) · fonte CVM',
      aplicavelA: ['tijolo'],
      linhas: [
        {
          codigo: 'vacanciaFisica',
          rotulo: 'Vacância física (CVM)',
          sub: 'pode diferir do relatório do gestor',
          formato: 'pct',
          fonteCvmAviso: true,
          valores: {
            HGLG11: ok(8.1),
            KNCR11: { estado: 'nao_se_aplica', motivo: 'fora_do_escopo', texto: 'n/a' },
          },
          conferencia: { HGLG11: null, KNCR11: null },
        },
      ],
    },
  ],
  graficos: null,
  leitura: {
    janela: 5,
    contagens: [
      { ticker: 'HGLG11', n: 3, de: 6 },
      { ticker: 'KNCR11', n: 2, de: 6 },
    ],
    texto: LEITURA_DOS_DADOS.texto,
  },
};

/** Classes de fundo (bg-*) de um elemento, ordenadas. */
function fundos(el: Element): string {
  return (el.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter((c) => /(^|:)bg-/.test(c))
    .sort()
    .join(' ');
}

function montar(dados: ComparadorResposta, query: string, celular: boolean) {
  estado.dados = dados;
  estado.query = query;
  estado.celular = celular;
  return render(<Comparador />);
}

describe('Comparador isonômico (caso 32)', () => {
  beforeEach(() => {
    estado.replace.mockReset();
  });
  afterEach(() => cleanup());

  for (const celular of [false, true]) {
    const onde = celular ? 'celular' : 'computador';

    it(`ações (${onde}): DOM limpo, literais exatos e nomes fora da varredura`, () => {
      const { container } = montar(ACOES, 't=WEGE3,ITUB4,TAEE11', celular);
      const r = esperarDomLimpo(container);
      expect(r.literais).toEqual(
        expect.arrayContaining(['instrucao-comparador-acoes', 'leitura-dos-dados']),
      );
      // fora dos literais (que citam "sem ranking nem destaque" na negativa)
      expect(r.texto).not.toMatch(/★|destaque|Índice MF/);
      expect(container.querySelectorAll('[data-nome-ativo]').length).toBeGreaterThanOrEqual(3);
    });

    it(`FIIs misto (${onde}): DOM limpo, aviso do misto e literal das FIIs`, () => {
      const { container } = montar(FIIS_MISTO, 't=HGLG11,KNCR11', celular);
      const r = esperarDomLimpo(container);
      expect(r.literais).toEqual(
        expect.arrayContaining(['instrucao-comparador-fiis', 'leitura-dos-dados']),
      );
      expect(container.textContent).toContain(
        'Você está comparando FIIs de tijolo com FIIs de papel.',
      );
    });
  }

  it('computador: critérios PRIMEIRO, "n de k" sem destaque e nenhuma célula com fundo distinto', () => {
    const { container } = montar(ACOES, 't=WEGE3,ITUB4,TAEE11', false);
    const tabela = container.querySelector('[data-tabela-comparador]')!;
    const faixas = [...tabela.querySelectorAll('th[scope="rowgroup"]')].map((th) =>
      th.textContent?.trim(),
    );
    expect(faixas[0]).toBe('Critérios de fundamentos · 5 anos');
    expect(faixas.slice(1)).toEqual(['Qualidade', 'Preço', 'Na minha carteira']);

    const contagem = tabela.querySelector('[data-criterio="atendidos"]')!;
    expect([...contagem.querySelectorAll('td')].map((td) => td.textContent?.trim())).toEqual([
      '5 de 6',
      '2 de 3',
      'sem avaliação',
    ]);
    // a contagem de todos com o mesmo peso (nenhuma em negrito "maior" que a outra)
    const bolds = [...contagem.querySelectorAll('td b')].map((b) => b.getAttribute('class'));
    expect(new Set(bolds).size).toBe(1);

    const tds = [...tabela.querySelectorAll('tbody td')];
    expect(tds.length).toBeGreaterThan(20);
    expect(new Set(tds.map(fundos))).toEqual(new Set(['']));
    // nenhuma marca/elemento com cor semântica de placar
    for (const el of tabela.querySelectorAll('[class]')) {
      expect(el.getAttribute('class')).not.toMatch(/green|emerald|#D92D20|#F97066|amber|yellow/);
    }
  });

  it('computador: marcas neutras e fatos (sem dado = não atende; financeira = não se aplica)', () => {
    const { container } = montar(ACOES, 't=WEGE3,ITUB4,TAEE11', false);
    const linha = (id: string) =>
      container.querySelector(`[data-criterio="${id}"]`) as HTMLTableRowElement;
    const fcl = [...linha('fcl').querySelectorAll('td')];
    expect(
      fcl[0].querySelector('[data-estado-criterio]')?.getAttribute('data-estado-criterio'),
    ).toBe('nao_atende');
    expect(fcl[1].textContent).toContain('não se aplica');
    expect(fcl[2].textContent).toContain('sem avaliação');
    expect(linha('rec').textContent).toContain('cresceu em 5 de 5 anos');
  });

  it('misto: a linha de tijolo acha a marca do papel pela equivalência (vac ↔ inad)', () => {
    const { container } = montar(FIIS_MISTO, 't=HGLG11,KNCR11', false);
    const vac = container.querySelector('[data-criterio="vac"]')!;
    expect(vac.querySelector('th')?.textContent).toBe('Vacância ≤ 10% / Inadimplência ≤ 3%');
    const tds = [...vac.querySelectorAll('td')];
    expect(tds[0].textContent).toContain('não atende · sem dado nas demonstrações');
    expect(tds[1].textContent).toContain('não atende · sem dado nas demonstrações');
    // KNCR11 (papel): a marca é a de 'inad' (relatórios gerenciais), não um '—' sem avaliação
    expect(tds[1].textContent).toContain('relatórios gerenciais em PDF');
  });

  it('v2.5: rótulos da v2, financeira "n de 6" com sem dado e a obs do lucro junto da frase', () => {
    const marcasItub: MarcaCriterioLinha[] = [
      { id: 'rec', estado: 'atende', fato: 'cresceu em 5 de 5 anos' },
      {
        id: 'luc',
        estado: 'atende',
        fato: 'cresceu em 5 de 5 anos',
        obs: ['lucro_sem_descontado'],
      },
      { id: 'ebitda', estado: 'sem_dado', fato: TEXTOS_CRITERIOS.fatos.semDado },
      { id: 'mg', estado: 'atende', fato: 'positiva em 5 de 5 anos' },
      { id: 'dl', estado: 'sem_dado', fato: TEXTOS_CRITERIOS.fatos.semDado },
      { id: 'fcl', estado: 'nao_atende', fato: 'cresceu em 2 de 5 anos' },
    ];
    const v2: ComparadorResposta = {
      ...ACOES,
      ativos: [
        ACOES.ativos[0],
        {
          ...ACOES.ativos[1],
          criterios: { ...CRITERIOS_LINHA_ITUB4, n: 3, de: 6, marcas: marcasItub },
        },
        ACOES.ativos[2],
      ],
      criterios: {
        rotulos: Object.fromEntries(CRITERIA_PARAMS_V2.perfis.acao.map((c) => [c.id, c.rotulo])),
        equivalencias: {},
      },
    };
    const { container } = montar(v2, 't=WEGE3,ITUB4,TAEE11', false);
    const linha = (id: string) =>
      container.querySelector(`[data-criterio="${id}"]`) as HTMLTableRowElement;
    expect(linha('dl').querySelector('th')?.textContent).toBe('Dív. líq./EBITDA < 3×');
    const dl = [...linha('dl').querySelectorAll('td')];
    expect(dl[1].textContent).toContain('não atende · sem dado nas demonstrações');
    expect(dl[1].textContent).not.toContain('não se aplica');
    const luc = [...linha('luc').querySelectorAll('td')];
    expect(luc[1].querySelector('[data-obs-criterio="lucro_sem_descontado"]')).not.toBeNull();
    const contagem = container.querySelector('[data-criterio="atendidos"]')!;
    expect(contagem.textContent).toContain('3 de 6');
    esperarDomLimpo(container);
  });

  it('celular: critérios em cartão primeiro; caixas com o mesmo fundo; sem tabela', () => {
    const { container } = montar(ACOES, 't=WEGE3,ITUB4,TAEE11', true);
    expect(container.querySelector('[data-tabela-comparador]')).toBeNull();
    const cartoes = container.querySelector('[data-cartoes-comparador]')!;
    const titulos = [...cartoes.querySelectorAll('section > h3')].map((h) => h.textContent);
    expect(titulos[0]).toBe('Critérios de fundamentos · 5 anos');
    const caixas = [...cartoes.querySelectorAll('section .grid > div')];
    expect(caixas.length).toBeGreaterThan(20);
    expect(new Set(caixas.map(fundos)).size).toBe(1);
  });

  it('Leitura dos dados: só contagens na ordem dos slots + literal exato', () => {
    montar(ACOES, 't=WEGE3,ITUB4,TAEE11', false);
    const leitura = screen.getByRole('region', { name: 'Leitura dos dados' });
    expect(leitura.textContent).toContain(
      'WEGE3: 5 de 6 critérios em 5 anos · ITUB4: 2 de 3 critérios em 5 anos · TAEE11: sem avaliação',
    );
    const lit = leitura.querySelector('[data-texto-legal="leitura-dos-dados"]')!;
    expect(lit.textContent).toBe(LEITURA_DOS_DADOS.texto);
    expect(within(leitura).getByRole('button', { name: /Copiar link da comparação/ })).toBeTruthy();
  });

  it('janela 3 | 5 | 10 vai para a URL (?janela=), mantendo os tickers', () => {
    montar(ACOES, 't=WEGE3,ITUB4,TAEE11', false);
    fireEvent.click(screen.getByRole('radio', { name: '10 anos' }));
    expect(estado.replace).toHaveBeenCalledWith(
      '/analise-ativos/comparador?t=WEGE3,ITUB4,TAEE11&janela=10',
      { scroll: false },
    );
  });

  it('Tijolo | Papel: no misto nenhum marcado; escolher Papel deixa só os fundos de papel', () => {
    montar(FIIS_MISTO, 't=HGLG11,KNCR11', false);
    const grupo = screen.getByRole('group', { name: 'Tipo de FII' });
    const [tijolo, papel] = within(grupo).getAllByRole('button');
    expect(tijolo.getAttribute('aria-pressed')).toBe('false');
    expect(papel.getAttribute('aria-pressed')).toBe('false');
    expect(tijolo.className).toContain('min-h-11');
    fireEvent.click(papel);
    expect(estado.replace).toHaveBeenCalledWith('/analise-ativos/comparador?t=KNCR11', {
      scroll: false,
    });
  });

  it('alvos de 44 px: remover (×), janela, tipo e copiar link', () => {
    const { container } = montar(FIIS_MISTO, 't=HGLG11,KNCR11', false);
    for (const b of container.querySelectorAll('[data-remover]')) {
      expect(b.className).toMatch(/\bh-11\b/);
      expect(b.className).toMatch(/\bw-11\b/);
    }
    for (const b of container.querySelectorAll(
      '[data-pilulas-janela] button, [data-acao="copiar-link"]',
    )) {
      expect(b.className).toContain('min-h-11');
    }
  });
});
