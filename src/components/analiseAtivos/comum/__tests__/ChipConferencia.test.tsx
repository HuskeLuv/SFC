// @vitest-environment jsdom
/**
 * Bloco C, fatia B — chip "em conferência" + "Por quê?", blocos da página com a mesma política,
 * Quadro (célula hachurada, "—" no fim da ordenação), alvos de toque, paleta e contraste.
 *
 * Contraste: o axe-core não calcula contraste no jsdom (sem layout/pintura: a regra fica
 * "incomplete"); aqui a razão WCAG é calculada sobre os pares de cor que os componentes usam, e o
 * axe roda nas telas reais pelo Playwright (QA da fatia).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const midia = vi.hoisted(() => ({ celular: false }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => midia.celular,
  useMediaQuery: () => midia.celular,
}));
const botaoReportar = vi.hoisted(() => vi.fn((_props: unknown) => null));
vi.mock('@/components/analiseAtivos/reporte/BotaoReportarDado', () => ({
  default: (props: unknown) => botaoReportar(props),
}));
// "Você reportou" (fatia D) no rodapé do bloco: busca com React Query; fora do escopo deste teste
vi.mock('@/components/analiseAtivos/reporte/MeusRelatos', () => ({
  LinhasVoceReportou: () => null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import ChipConferencia from '../ChipConferencia';
import { ConferenciaPaginaProvider, type ContextoConferenciaPagina } from '../PorQueConferencia';
import BlocoKpis from '@/components/analiseAtivos/ativo/topo/BlocoKpis';
import TabelaQuadro from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { compararLinhas } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { estadoOcultoConferencia } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import { Prisma } from '@prisma/client';
import type { ConferenciaTela, KpiAtivo } from '@/types/analiseAtivosApi';

const CONF_ACOES: ConferenciaTela = {
  grupo: 'acoes_escala',
  campos: ['pl', 'pvp', 'valorMercado', 'nAcoes'],
  exibicao: 'ocultar',
  motivo: 'P/VP abaixo de 0,08: o nº de ações informado provavelmente está em outra escala.',
  desde: '2026-04-29',
  efeitoIndice: 'O Índice MF fica incompleto: preço fora da conta.',
  origem: 'regra',
  caso: { status: 'em_analise', atualizadoEm: '2026-10-01T12:00:00.000Z' },
};

function contexto(over: Partial<ContextoConferenciaPagina> = {}): ContextoConferenciaPagina {
  return {
    ticker: 'CBAV3',
    classe: 'acao',
    versao: '2026-10-03T10:40:00.000Z',
    reporteHabilitado: false,
    conferencias: [CONF_ACOES],
    frescorBlocos: null,
    ...over,
  };
}

function comContexto(ui: ReactNode, over: Partial<ContextoConferenciaPagina> = {}) {
  return render(<ConferenciaPaginaProvider valor={contexto(over)}>{ui}</ConferenciaPaginaProvider>);
}

const chipPvp = (
  <ChipConferencia
    conferencia={CONF_ACOES}
    campo="pvp"
    rotuloCampo="P/VP"
    valorNaoPublicado="0,00"
    bloco="kpis"
  />
);

beforeEach(() => {
  midia.celular = false;
  botaoReportar.mockClear();
});
afterEach(cleanup);

describe('ChipConferencia — sem contexto da página (Quadro, cartões)', () => {
  it('é só texto, sem botão', () => {
    render(<ChipConferencia conferencia={CONF_ACOES} campo="pvp" rotuloCampo="P/VP" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('em conferência')).toBeInTheDocument();
  });
});

describe('ChipConferencia — computador (popover)', () => {
  it('botão com nome acessível, aria-expanded e área de toque de 44px', () => {
    comContexto(chipPvp);
    const chip = screen.getByRole('button', { name: 'P/VP em conferência: por quê?' });
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    // desenho compacto (20px) + pseudo-elemento de 12px acima e abaixo = 44px
    expect(chip.className).toContain('leading-5');
    expect(chip.className).toContain('after:-inset-y-3');
  });

  it('abre o "Por quê?" com motivo, desde, na tela + não publicado, Índice, origem e situação', () => {
    comContexto(chipPvp);
    const chip = screen.getByRole('button', { name: /por quê/ });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    const d = screen.getByRole('dialog', { name: 'P/VP em conferência' });
    expect(within(d).getByText(CONF_ACOES.motivo)).toBeInTheDocument();
    expect(within(d).getByText('29/04/2026')).toBeInTheDocument();
    expect(within(d).getByText(/O valor fica oculto/)).toBeInTheDocument();
    expect(within(d).getByText('Valor calculado, não publicado: 0,00')).toBeInTheDocument();
    expect(within(d).getByText(CONF_ACOES.efeitoIndice as string)).toBeInTheDocument();
    expect(within(d).getByText('conferência automática dos dados')).toBeInTheDocument();
    expect(within(d).getByText('A equipe está conferindo desde 01/10/2026.')).toBeInTheDocument();
    const fechar = within(d).getByRole('button', { name: 'Fechar' });
    expect(fechar.className).toContain('h-11');
    expect(fechar.className).toContain('w-11');
  });

  it('Esc fecha e devolve o foco ao chip; clique fora fecha', () => {
    comContexto(chipPvp);
    const chip = screen.getByRole('button', { name: /por quê/ });
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(chip);
    fireEvent.click(chip);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('termina no atalho "Reportar" só com o relato ligado; o atalho fecha o "Por quê?" e abre o formulário (controlado, campo escolhido)', () => {
    comContexto(chipPvp);
    fireEvent.click(screen.getByRole('button', { name: /por quê/ }));
    expect(screen.queryByRole('button', { name: 'Reportar' })).toBeNull();
    expect(botaoReportar).not.toHaveBeenCalled();
    cleanup();
    comContexto(chipPvp, { reporteHabilitado: true });
    fireEvent.click(screen.getByRole('button', { name: /por quê/ }));
    expect(botaoReportar.mock.calls.at(-1)?.[0]).toMatchObject({
      variante: 'controlado',
      aberto: false,
      campo: 'pvp',
      bloco: 'kpis',
      ticker: 'CBAV3',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reportar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(botaoReportar.mock.calls.at(-1)?.[0]).toMatchObject({
      variante: 'controlado',
      aberto: true,
    });
  });
});

describe('ChipConferencia — celular (sheet)', () => {
  beforeEach(() => {
    midia.celular = true;
  });

  it('abre BottomSheet com "Fechar" de 48px; "voltar" do sistema fecha', async () => {
    comContexto(chipPvp);
    const antes = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: /por quê/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(CONF_ACOES.motivo)).toBeInTheDocument();
    const fechar = within(sheet)
      .getAllByRole('button', { name: 'Fechar' })
      .find((b) => b.className.includes('min-h-12'));
    expect(fechar).toBeDefined();
    expect(window.history.length).toBe(antes + 1);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Reportar" tira o sheet do histórico ANTES de abrir o formulário (sem entrada órfã)', async () => {
    comContexto(chipPvp, { reporteHabilitado: true });
    const antes = window.history.state as Record<string, unknown> | null;
    fireEvent.click(screen.getByRole('button', { name: /por quê/ }));
    const sheet = await screen.findByRole('dialog');
    expect(window.history.state).not.toEqual(antes);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reportar' }));
    // o formulário só abre depois do "voltar" do sheet (popstate)
    await waitFor(() =>
      expect(botaoReportar.mock.calls.at(-1)?.[0]).toMatchObject({ aberto: true }),
    );
    expect(window.history.state).toEqual(antes);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Blocos da página
// ---------------------------------------------------------------------------

const KPIS: KpiAtivo[] = [
  {
    codigo: 'pl',
    rotulo: 'P/L',
    valor: estadoOcultoConferencia('acoes_escala', 0.0014),
    formato: 'multiplo',
    sub: null,
    selo: 'em_conferencia',
  },
  {
    codigo: 'roe',
    rotulo: 'ROE',
    valor: { estado: 'ok', valor: 20 },
    formato: 'pct',
    sub: null,
    selo: null,
  },
];

describe('BlocoKpis', () => {
  it('KPI em conferência: borda tracejada, "—" (motivo só para leitor de tela) e o chip', () => {
    comContexto(<BlocoKpis classe="acao" kpis={KPIS} />);
    const kpi = document.querySelector('[data-kpi="pl"]') as HTMLElement;
    expect(kpi.className).toContain('border-dashed');
    expect(within(kpi).getByText('—')).toBeInTheDocument();
    expect(within(kpi).getByRole('button', { name: 'P/L em conferência: por quê?' })).toBeVisible();
    // o motivo não aparece duas vezes (o chip já diz "em conferência")
    expect(within(kpi).getByText('Nº de ações em conferência.').className).toContain('sr-only');
  });

  it('flag desligada e params v1: sem menu ⋯, sem selo de frescor e sem chip', () => {
    const v1: KpiAtivo[] = [{ ...KPIS[1] }];
    comContexto(<BlocoKpis classe="acao" kpis={v1} />, { conferencias: [] });
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('[data-frescor-bloco]')).toBeNull();
  });

  it('com frescor por bloco (v2): menu ⋯ (44px) e selo no rodapé com "atualização em atraso"', () => {
    comContexto(<BlocoKpis classe="acao" kpis={KPIS} />, {
      frescorBlocos: {
        kpis: {
          fonte: 'B3 · cotação · CVM · DFP/ITR',
          referencia: '29/09/2026 · ITR 2T26',
          atualizadoEm: null,
          status: 'atrasado',
          documentoEsperado: 'ITR 3T26',
        },
      },
    });
    const menu = screen.getByRole('button', { name: 'Opções do bloco Indicadores' });
    expect(menu.className).toContain('h-11');
    const rodape = document.querySelector('[data-frescor-bloco="atrasado"]') as HTMLElement;
    expect(within(rodape).getByText('atualização em atraso')).toBeInTheDocument();
    expect(within(rodape).getByText('(aguardando ITR 3T26)')).toBeInTheDocument();
  });

  it('FII: nota fixa "a tela segue a CVM" na vacância só com o bloco C ativo', () => {
    const vac: KpiAtivo[] = [
      {
        codigo: 'vacanciaCvm',
        rotulo: 'Vacância (CVM)',
        valor: { estado: 'ok', valor: 5 },
        formato: 'pct',
        sub: null,
        selo: null,
      },
    ];
    comContexto(<BlocoKpis classe="fii" kpis={vac} />, { conferencias: [] });
    expect(document.querySelector('[data-nota-cvm]')).toBeNull();
    cleanup();
    comContexto(<BlocoKpis classe="fii" kpis={vac} />, {
      conferencias: [],
      reporteHabilitado: true,
    });
    expect(document.querySelector('[data-nota-cvm]')?.textContent).toContain('segue a CVM');
  });
});

// ---------------------------------------------------------------------------
// Quadro
// ---------------------------------------------------------------------------

const linha = (symbol: string, over: Parameters<typeof linhaQuadroDb>[0] = {}) =>
  paraLinhaQuadroApi(
    linhaQuadroDb({
      symbol,
      pl: 10,
      pvp: 2,
      dy12mPct: 5,
      roePct: 20,
      valorMercado: new Prisma.Decimal('1000000000'),
      ...over,
    }),
  );

describe('Quadro', () => {
  const sbsp = linha('SBSP3', { pvp: 0.4, flags: ['conf:preco_base:base_sem_evento@2026-04-29'] });
  const wege = linha('WEGE3', { pvp: 8 });
  const itub = linha('ITUB4', { pvp: 2.2 });

  it('ordenação: o campo oculto ("—") vai para o fim nas duas direções', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const ord = [sbsp, wege, itub].sort(compararLinhas('pvp', dir)).map((l) => l.ticker);
      expect(ord.at(-1)).toBe('SBSP3');
    }
  });

  it('célula hachurada + "—" + "em conferência"; preço com selo mostra o valor', () => {
    render(
      <TabelaQuadro
        classe="acao"
        modo="detalhado"
        ordem="indiceMf"
        dir="desc"
        linhas={[sbsp, wege]}
        onOrdenar={() => undefined}
        naCarteira={() => ({ tipo: 'nenhum' })}
        legenda="Quadro"
      />,
    );
    const tr = document.querySelector('tr[data-ticker="SBSP3"]') as HTMLElement;
    const pvp = tr.querySelector('td[data-coluna="pvp"]') as HTMLElement;
    expect(pvp.className).toContain('repeating-linear-gradient');
    expect(pvp.textContent).toContain('—');
    expect(pvp.textContent).toContain('em conferência');
    const preco = tr.querySelector('td[data-coluna="preco"]') as HTMLElement | null;
    if (preco) expect(preco.textContent).toMatch(/R\$/);
    const outra = document.querySelector('tr[data-ticker="WEGE3"] td[data-coluna="pvp"]');
    expect(outra?.className).not.toContain('repeating-linear-gradient');
  });

  it('cabeçalho ordenado com fundo patrimonio (#396CAA): texto branco ≥ 4,5:1', () => {
    expect(contraste('#FFFFFF', MYFINANCE_BRAND.patrimonio)).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#FFFFFF', MYFINANCE_BRAND.outside)).toBeLessThan(4.5);
  });
});

// ---------------------------------------------------------------------------
// Paleta e contraste
// ---------------------------------------------------------------------------

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('paleta e contraste', () => {
  it('nenhuma cor fora da paleta nos arquivos novos da fatia B', () => {
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    for (const arq of ['ChipConferencia.tsx', 'PorQueConferencia.tsx']) {
      const fonte = readFileSync(path.join(__dirname, '..', arq), 'utf8');
      const fora = [...fonte.matchAll(/#[0-9a-fA-F]{6}\b/g)]
        .map((m) => m[0])
        .filter((c) => !permitidas.has(c.toUpperCase()));
      expect(fora).toEqual([]);
    }
  });

  it('texto sobre o fundo do chip e sobre a hachura ≥ 4,5:1 (claro e escuro)', () => {
    // claro: gray-700 (#344054) sobre #F2F4F7 (chip e listra da hachura) e sobre branco
    expect(contraste('#344054', '#F2F4F7')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#344054', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // escuro: gray-300 (#D0D5DD) sobre a listra #2E3440 e sobre o card #1F1F22
    expect(contraste('#D0D5DD', '#2E3440')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#D0D5DD', '#1F1F22')).toBeGreaterThanOrEqual(4.5);
    // link/texto azul: #396CAA no claro, #6E9DC4 no escuro
    expect(contraste('#396CAA', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#6E9DC4', '#1F1F22')).toBeGreaterThanOrEqual(4.5);
  });
});
