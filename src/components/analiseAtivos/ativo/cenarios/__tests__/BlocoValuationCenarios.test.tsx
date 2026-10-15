// @vitest-environment jsdom
/**
 * Bloco D, fatia B: o card Valuation com e sem o recurso de cenários. Sem o recurso = os Múltiplos
 * de hoje, sem seletor (regressão). Com o recurso = seletor 'Múltiplos | Meus cenários' e a
 * calculadora só quando o usuário escolhe.
 *
 * v2.4 (fatia C2): MeusCenarios de verdade (importActual) com as premissas em branco — caso 22.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

const cfg = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/useAnaliseAtivos', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useAnaliseAtivos')>()),
  useAnaliseAtivosConfig: () => ({ data: cfg.data }),
}));
vi.mock('@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos', () => ({
  default: (p: { ticker: string; cabecalhoExtra?: ReactNode }) => (
    <div data-testid="multiplos">
      {p.ticker}
      {p.cabecalhoExtra}
    </div>
  ),
}));
vi.mock('@/components/analiseAtivos/ativo/cenarios/MeusCenarios', () => ({
  default: (p: { ticker: string; cabecalhoExtra?: ReactNode }) => (
    <div data-testid="cenarios">
      {p.ticker}
      {p.cabecalhoExtra}
    </div>
  ),
}));

import BlocoValuation from '@/components/analiseAtivos/ativo/analise/BlocoValuation';
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import { esperarDomLimpo } from '@/test/utils/varrerDom';

describe('BlocoValuation (fatia B)', () => {
  afterEach(() => {
    cleanup();
    cfg.data = undefined;
  });

  it('sem o recurso: só os Múltiplos, sem seletor', () => {
    cfg.data = { habilitada: true, recursos: { raioX: true, cenarios: false, comparador: true } };
    const { getByTestId, queryByRole } = render(
      <BlocoValuation ticker="WEGE3" classe="acao" nome="WEG" />,
    );
    expect(getByTestId('multiplos').textContent).toBe('WEGE3');
    expect(queryByRole('group')).toBeNull();
  });

  it('com o recurso: seletor e troca para Meus cenários', () => {
    cfg.data = { habilitada: true, recursos: { raioX: false, cenarios: true, comparador: false } };
    const { getByRole, getByTestId, queryByTestId } = render(
      <BlocoValuation ticker="WEGE3" classe="acao" nome="WEG" />,
    );
    expect(getByRole('group', { name: 'Tipo de valuation' })).toBeTruthy();
    expect(queryByTestId('cenarios')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Meus cenários' }));
    expect(getByTestId('cenarios')).toBeTruthy();
    expect(getByRole('button', { name: 'Meus cenários' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

// ---------------------------------------------------------------------------
// v2.4 (fatia C2) — MeusCenarios com as premissas em branco (spec §4.4, caso 22)
// ---------------------------------------------------------------------------

const cen = vi.hoisted(() => ({
  data: undefined as unknown,
  salvar: vi.fn(),
  apagar: vi.fn(),
}));
vi.mock('@/hooks/useAnaliseAtivosBlocoD', () => ({
  useCenarios: () => ({
    data: cen.data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSalvarCenario: () => ({
    mutate: cen.salvar,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useApagarCenario: () => ({ mutate: cen.apagar, isPending: false }),
}));
vi.mock('@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo', () => ({
  useNaCarteiraAtivo: () => ({ status: 'sem_posicao', linha: null, quantidade: 0 }),
}));
vi.mock('@/hooks/useMediaQuery', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useMediaQuery')>()),
  useIsBelowLg: () => false,
}));

const okE = (valor: number) => ({ estado: 'ok' as const, valor });

function respostaWege(salvo: unknown = null, podeSalvar = true) {
  return {
    ticker: 'WEGE3',
    nome: 'WEG',
    classe: 'acao',
    cotacao: { valor: okE(52.3), data: '2026-09-29', conferencia: null },
    base: {
      lpa: okE(1.64),
      vpa: okE(5.59),
      dpa: okE(0.84),
      plAlvoPadrao: okE(22.3),
      conferencias: [],
    },
    premissasIniciais: { yieldPct: null, gPct: null, kPct: null, margemPct: 0, plAlvo: 22.3 },
    limites: LIMITES_CENARIO,
    salvo,
    podeSalvar,
    motivoSemSalvar: podeSalvar ? null : 'consultor',
    versao: 'v1',
  };
}

async function renderCenarios() {
  const { default: MeusCenariosReal } = await vi.importActual<
    typeof import('@/components/analiseAtivos/ativo/cenarios/MeusCenarios')
  >('@/components/analiseAtivos/ativo/cenarios/MeusCenarios');
  return render(<MeusCenariosReal ticker="WEGE3" classe="acao" />);
}

describe('MeusCenarios v2.4 — premissas em branco (caso 22)', () => {
  afterEach(() => {
    cleanup();
    cen.salvar.mockReset();
    cen.apagar.mockReset();
  });

  it('abre em branco com placeholders de formato; Bazin/Gordon "informe…"; rodapé literal', async () => {
    cen.data = respostaWege();
    const { container, getByLabelText, getByText } = await renderCenarios();
    const y = getByLabelText('Yield que você deseja') as HTMLInputElement;
    expect(y.value).toBe('');
    expect(y.placeholder).toBe('ex.: 6');
    expect((getByLabelText('Crescimento dos dividendos (g)') as HTMLInputElement).value).toBe('');
    expect((getByLabelText('Retorno que você exige (k)') as HTMLInputElement).value).toBe('');
    expect((getByLabelText('P/L alvo') as HTMLInputElement).value).toBe('22,3');
    expect(getByText('média 10a do ativo: 22,3 (fato; altere se quiser)')).toBeTruthy();
    expect(getByText('(em branco até você preencher)')).toBeTruthy();
    expect(container.querySelector('[data-slider-margem]')).toHaveProperty('value', '0');
    const bazin = container.querySelector('tr[data-metodo="bazin"]')!;
    expect(bazin.textContent).toContain('informe yield');
    expect(container.querySelector('tr[data-metodo="gordon"]')!.textContent).toContain(
      'informe g e k',
    );
    expect(container.querySelector('tr[data-metodo="graham"]')!.textContent).toContain('R$ 14,36');
    const rodape = container.querySelector('[data-texto-legal]')!;
    expect(rodape.getAttribute('data-texto-legal')).toBe('rodape-cenarios');
    // varredura: só o literal registrado cita "preço justo"; nada de padrão/faltam
    esperarDomLimpo(container);
    expect(container.textContent).not.toMatch(/padrão:|faltam/i);
  });

  it('salvar manda o PUT v2 com os campos em branco como null', async () => {
    cen.data = respostaWege();
    const { getByLabelText, container } = await renderCenarios();
    fireEvent.change(getByLabelText('Yield que você deseja'), { target: { value: '4' } });
    expect(container.querySelector('tr[data-metodo="bazin"]')!.textContent).toContain('R$ 21,00');
    fireEvent.click(container.querySelector('[data-cenario-salvar]')!);
    expect(cen.salvar).toHaveBeenCalledTimes(1);
    expect(cen.salvar.mock.calls[0][0]).toEqual({
      classe: 'acao',
      premissas: { yieldPct: 4, gPct: null, kPct: null, margemPct: 0, plAlvo: 22.3 },
      dados: {},
    });
  });

  it('"Limpar minhas premissas" com cenário salvo chama o DELETE e volta ao branco', async () => {
    cen.data = respostaWege({
      premissas: { yieldPct: 4, gPct: 5, kPct: 12, margemPct: 20, plAlvo: 18 },
      dadosEditados: null,
      atualizadoEm: '2026-10-13T12:00:00Z',
    });
    cen.apagar.mockImplementation((_v: unknown, o: { onSuccess: () => void }) => o.onSuccess());
    const { getByLabelText, getByRole } = await renderCenarios();
    expect((getByLabelText('Yield que você deseja') as HTMLInputElement).value).toBe('4,0');
    fireEvent.click(getByRole('button', { name: 'Limpar minhas premissas' }));
    expect(cen.apagar).toHaveBeenCalledTimes(1);
    expect((getByLabelText('Yield que você deseja') as HTMLInputElement).value).toBe('');
    expect((getByLabelText('Retorno que você exige (k)') as HTMLInputElement).value).toBe('');
  });

  it('consultor agindo: calcula, mas não salva', async () => {
    cen.data = respostaWege(null, false);
    const { container, queryByRole } = await renderCenarios();
    expect(container.querySelector('[data-cenarios-consultor]')).not.toBeNull();
    expect(queryByRole('button', { name: 'Salvar cenário' })).toBeNull();
  });
});
