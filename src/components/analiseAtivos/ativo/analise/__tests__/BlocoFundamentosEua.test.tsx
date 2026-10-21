// @vitest-environment jsdom
/**
 * fundamentei-regras F3: Essencial EUA e gráfico por ação com as chaves de tela. Sem marcas nem
 * lacunas (chaves desligadas), o DOM é o de hoje; com o REIT ajustado, a célula do ano sem SBC
 * ganha '*' com a explicação, e o gráfico lista as lacunas. Varredura de linguagem (PT e EN).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockHooks = vi.hoisted(() => ({ useFundamentosAtivo: vi.fn() }));
vi.mock('@/hooks/useAnaliseAtivos', () => mockHooks);

import BlocoFundamentosEua from '../BlocoFundamentosEua';
import GraficoPorAcaoEua from '../../topo/GraficoPorAcaoEua';
import {
  lerFixturesEua,
  type EmpresaFixtureEua,
} from '../../../../../../prisma/seedAnaliseAtivosEua';
import {
  montarFundamentosEua,
  type PeriodoSec,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import { graficoEua } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { esperarDomLimpo } from '@/test/utils/varrerDom';

const EMPRESAS = lerFixturesEua().empresas;
function periodos(t: string, sbc: number | null): PeriodoSec[] {
  const e = EMPRESAS.find((x) => x.ticker === t) as EmpresaFixtureEua;
  return e.anos.map((a) => ({
    anoFiscal: a.ano,
    dtFim: a.dtFim,
    receita: a.receita,
    ebit: a.ebit,
    depreciacaoAmortizacao: a.depreciacaoAmortizacao,
    lucroLiquido: a.lucroLiquido,
    pl: a.pl,
    caixa: a.caixa,
    aplicacoesFinanceiras: a.aplicacoesFinanceiras,
    dividaBrutaCp: null,
    dividaBrutaLp: a.dividaBruta,
    fco: a.fco,
    capex: a.capex,
    dividendosPagos: a.dividendosPagos,
    acoesMediaDiluida: a.acoesMediaDiluida,
    lpaOn: a.lpa,
    dpa: a.dpa,
    dpaOrigem: a.dpaOrigem,
    flags: a.flags,
    // SBC SINTÉTICA (fração do FCO); 2025 sem SBC para a marca
    ...(sbc === null || a.fco === null || a.ano === 2025 ? {} : { remuneracaoAcoes: a.fco * sbc }),
  }));
}
const consulta = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
});

describe('BlocoFundamentosEua / GraficoPorAcaoEua (F3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chaves desligadas: DOM igual com a resposta de hoje (sem marca e sem lacunas)', () => {
    const e = { classe: 'reit' as const, periodos: periodos('O', 0.05), exercicioFimMmdd: '1231' };
    mockHooks.useFundamentosAtivo.mockReturnValue(consulta(montarFundamentosEua(e)));
    const a = render(<BlocoFundamentosEua ticker="O" />).container.innerHTML;
    mockHooks.useFundamentosAtivo.mockReturnValue(
      consulta(montarFundamentosEua(e, { reitFcoAjustado: false, rotulosEn: false })),
    );
    const b = render(<BlocoFundamentosEua ticker="O" />).container.innerHTML;
    expect(b).toBe(a);
    expect(a).not.toContain('data-sbc-indisponivel');
    const g = render(<GraficoPorAcaoEua ticker="O" grafico={graficoEua('reit', e.periodos)} />);
    expect(g.container.querySelector('[data-lacunas-grafico-eua]')).toBeNull();
  });

  it('REIT ajustado + EN: nomes em inglês, ano sem SBC marcado com a explicação', async () => {
    const e = { classe: 'reit' as const, periodos: periodos('O', 0.05), exercicioFimMmdd: '1231' };
    const dados = montarFundamentosEua(e, { reitFcoAjustado: true, rotulosEn: true });
    mockHooks.useFundamentosAtivo.mockReturnValue(consulta(dados));
    const { container } = render(<BlocoFundamentosEua ticker="O" />);
    expect(screen.getByText('OCF adj./share (US$)')).toBeTruthy();
    expect(screen.queryByText(/FFO|AFFO/)).toBeNull();
    const marcadas = container.querySelectorAll('[data-sbc-indisponivel]');
    expect(marcadas).toHaveLength(3);
    expect(marcadas[0].getAttribute('title')).toBe(TEXTOS_EUA.reitAjustado.sbcIndisponivel);
    await esperarDomLimpo(container);
    const g = render(
      <GraficoPorAcaoEua
        ticker="O"
        grafico={graficoEua('reit', e.periodos, { reitFcoAjustado: true, rotulosEn: true })}
      />,
    );
    const lacunas = g.container.querySelector('[data-lacunas-grafico-eua]');
    expect(lacunas?.textContent).toMatch(/FY2025: sem remuneração em ações/);
    await esperarDomLimpo(g.container);
  });
});
