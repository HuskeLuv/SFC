// @vitest-environment jsdom
/**
 * Fundamentos · Raio-X (Bloco D, fatia A): BlocoFundamentos (flag desligada = card de hoje; nível
 * na URL), TabelaRaioX (estrutura acessível, razões, negativos, conferência, chips) e
 * BotaoExportarCsv (gerando, aviso com o nome, erro com "Tentar de novo").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  fundamentos: vi.fn(),
  raioX: vi.fn(),
  baixar: vi.fn(),
  replace: vi.fn(),
  params: { valor: '' },
  celular: { valor: false },
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useAnaliseAtivos', async (original) => ({
  ...(await original<typeof import('@/hooks/useAnaliseAtivos')>()),
  useAnaliseAtivosConfig: () => mocks.config(),
  useFundamentosAtivo: () => mocks.fundamentos(),
}));
vi.mock('@/hooks/useAnaliseAtivosBlocoD', () => ({
  useRaioX: () => mocks.raioX(),
  baixarCsvRaioX: (t: string) => mocks.baixar(t),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/analise-ativos/WEGE3',
  useSearchParams: () => new URLSearchParams(mocks.params.valor),
}));
vi.mock('@/hooks/useMediaQuery', async (original) => ({
  ...(await original<typeof import('@/hooks/useMediaQuery')>()),
  useIsBelowLg: () => mocks.celular.valor,
}));

import BlocoFundamentos from '../BlocoFundamentos';
import TabelaRaioX from '../TabelaRaioX';
import BotaoExportarCsv from '../BotaoExportarCsv';
import { montarAcao, montarFii } from '@/services/analiseAtivos/leitura/ativo/raioX';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { FUNDAMENTOS_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';
import {
  HOJE_DEV,
  dadosAcaoDev,
  dadosFiiDev,
  linhaDev,
} from '@/test/fixtures/analiseAtivos/raioXDev';
import type { RaioXResposta } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_RAIO_X;

function respostaAcao(t: 'WEGE3' | 'CBAV3' | 'ITUB4'): RaioXResposta {
  const { raioX } = montarAcao(HOJE_DEV, dadosAcaoDev(t));
  return { ...raioX, ticker: t, classe: 'acao', nome: linhaDev(t).nome, versao: 'v' };
}
function respostaFii(t: 'HGLG11' | 'XPLG11'): RaioXResposta {
  const { raioX } = montarFii(HOJE_DEV, dadosFiiDev(t));
  return { ...raioX, ticker: t, classe: 'fii', nome: linhaDev(t).nome, versao: 'v' };
}
function consulta<T>(data: T | undefined, extra: Record<string, unknown> = {}) {
  return { data, isPending: data === undefined, isError: false, refetch: vi.fn(), ...extra };
}

beforeEach(() => {
  mocks.config.mockReturnValue({ data: { habilitada: true, recursos: { raioX: true } } });
  mocks.fundamentos.mockReturnValue(consulta(FUNDAMENTOS_WEGE3));
  mocks.raioX.mockReturnValue(consulta(respostaAcao('WEGE3')));
  mocks.baixar.mockReset();
  mocks.replace.mockReset();
  mocks.params.valor = '';
  mocks.celular.valor = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BlocoFundamentos', () => {
  it('flag desligada: o card de hoje, sem seletor e sem buscar o Raio-X (?fund ignorado)', () => {
    mocks.config.mockReturnValue({ data: { habilitada: true, recursos: { raioX: false } } });
    mocks.params.valor = 'fund=raiox';
    render(<BlocoFundamentos ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      TEXTOS_TELA.blocos.fundamentos,
    );
    expect(screen.queryByRole('group', { name: T.seletor.rotuloGrupo })).toBeNull();
    expect(mocks.raioX).not.toHaveBeenCalled();
  });

  it('com o recurso: Essencial com o seletor; trocar grava ?fund=raiox na URL sem rolar', () => {
    render(<BlocoFundamentos ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(T.titulo);
    const grupo = screen.getByRole('group', { name: T.seletor.rotuloGrupo });
    const [ess, rx] = within(grupo).getAllByRole('button');
    expect(ess.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(rx);
    expect(mocks.replace).toHaveBeenCalledWith('/analise-ativos/WEGE3?fund=raiox', {
      scroll: false,
    });
    expect(mocks.raioX).not.toHaveBeenCalled();
  });

  it('?fund=raiox abre no Raio-X; voltar ao Essencial tira o parâmetro', () => {
    mocks.params.valor = 'fund=raiox&x=1';
    render(<BlocoFundamentos ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('table').querySelector('[data-linha="ebitda"]')).toBeTruthy();
    const grupo = screen.getByRole('group', { name: T.seletor.rotuloGrupo });
    fireEvent.click(within(grupo).getByRole('button', { name: T.seletor.essencial }));
    expect(mocks.replace).toHaveBeenCalledWith('/analise-ativos/WEGE3?x=1', { scroll: false });
  });
});

describe('TabelaRaioX', () => {
  it('estrutura: th col/row/rowgroup, coluna fixa opaca, mais recente à esquerda em 600', () => {
    render(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    const tabela = screen.getByRole('table');
    const cols = within(tabela).getAllByRole('columnheader');
    expect(cols[0].textContent).toBe(T.tabela.colunaIndicador);
    expect(cols[0].className).toMatch(/sticky/);
    expect(cols[1].textContent).toBe('2025');
    expect(tabela.querySelectorAll('th[scope="rowgroup"]')).toHaveLength(3);
    const lpa = tabela.querySelector('[data-linha="lpa"]')!;
    const th = lpa.querySelector('th')!;
    expect(th.getAttribute('scope')).toBe('row');
    expect(th.className).toMatch(/sticky/);
    expect(th.className).toMatch(/bg-white/);
    expect(lpa.querySelectorAll('td')[0].className).toMatch(/font-semibold/);
    expect(screen.getByRole('region', { name: /Raio-X de WEGE3/ })).toBeTruthy();
    expect(screen.getByText(T.unidade.acao.replace('{valor}', 'consolidado · IFRS'))).toBeTruthy();
  });

  it('razão em itálico com fundo cinza e "(razão)"; negativo com "−" vermelho', () => {
    render(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    const margem = screen.getByRole('table').querySelector('[data-linha="margemBrutaPct"]')!;
    expect(margem.querySelector('th')!.className).toMatch(/italic/);
    expect(margem.querySelector('th')!.className).toMatch(/F2F4F7/);
    expect(margem.querySelector('th')!.textContent).toContain(T.celula.razao);
    const dl = screen.getByRole('table').querySelector('[data-linha="dividaLiquida"] td')!;
    expect(dl.textContent).toBe('−2.689,0');
    expect(dl.className).toMatch(/D92D20/);
    expect(
      screen.getByRole('table').querySelector('[data-linha="caixaFinanciamento"] th')!.textContent,
    ).toContain('Caixa de financiamento');
  });

  it('CBAV3: LPA de 2025 em conferência = hachura + "—" + chip (número fora da célula)', () => {
    mocks.raioX.mockReturnValue(consulta(respostaAcao('CBAV3')));
    render(<TabelaRaioX ticker="CBAV3" classe="acao" />);
    const celula = screen
      .getByRole('table')
      .querySelector('[data-linha="lpa"] td[data-ano="2025"]')!;
    expect(celula.getAttribute('data-conferencia')).toBe('acoes_escala');
    expect(celula.className).toMatch(/repeating-linear-gradient/);
    expect(celula.textContent).toContain('—');
    expect(celula.textContent).toContain(TEXTOS_TELA.conferencia.chip);
    expect(celula.textContent).not.toContain('185');
    expect(screen.getByText(T.sobreOsDados.perShareConferencia)).toBeTruthy();
  });

  it('XPLG11: taxa de adm. de 2020 fora da escala em conferência; 2025 com 2 casas', () => {
    mocks.raioX.mockReturnValue(consulta(respostaFii('XPLG11')));
    render(<TabelaRaioX ticker="XPLG11" classe="fii" />);
    const linha = screen.getByRole('table').querySelector('[data-linha="taxaAdmAnoPct"]')!;
    expect(linha.querySelector('td[data-ano="2020"]')!.getAttribute('data-conferencia')).toBe(
      'taxaAdmAnoPct',
    );
    expect(linha.querySelector('td[data-ano="2025"]')!.textContent).toBe('0,75%');
  });

  it('chips por bloco no computador (com "Todos") filtram; todos com 44px', () => {
    render(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    const chips = within(screen.getByRole('group', { name: T.blocos.rotuloChips })).getAllByRole(
      'button',
    );
    expect(chips.map((c) => c.textContent)).toEqual([
      T.blocos.todos,
      T.blocos.lucro_caixa,
      T.blocos.caixa_divida,
      T.blocos.fluxo_caixa,
    ]);
    expect(chips.every((c) => c.className.includes('min-h-11'))).toBe(true);
    fireEvent.click(chips[3]);
    expect(chips[3].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('table').querySelectorAll('th[scope="rowgroup"]')).toHaveLength(1);
  });

  it('celular: abre no 1º bloco, sem "Todos"', () => {
    mocks.celular.valor = true;
    mocks.raioX.mockReturnValue(consulta(respostaFii('HGLG11')));
    render(<TabelaRaioX ticker="HGLG11" classe="fii" />);
    const chips = within(screen.getByRole('group', { name: T.blocos.rotuloChips })).getAllByRole(
      'button',
    );
    expect(chips[0].textContent).toBe(T.blocos.resultado_distribuicao);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips.some((c) => c.textContent === T.blocos.todos)).toBe(false);
    expect(screen.getByRole('table').querySelectorAll('th[scope="rowgroup"]')).toHaveLength(1);
  });

  it('"Sobre os dados" (nunca "Notas") com as observações e a legenda', () => {
    mocks.raioX.mockReturnValue(consulta(respostaAcao('ITUB4')));
    render(<TabelaRaioX ticker="ITUB4" classe="acao" />);
    expect(screen.getByRole('heading', { name: T.sobreOsDados.titulo })).toBeTruthy();
    expect(screen.getByText(T.sobreOsDados.payoutSemProventos)).toBeTruthy();
    expect(screen.getByText(T.legenda)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/(^|[^\p{L}])notas?(?!\p{L})/iu);
  });

  it('estados: carregando, erro com "Tentar de novo" e vazio', () => {
    mocks.raioX.mockReturnValue(consulta(undefined));
    const { rerender } = render(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('status')).toBeTruthy();
    const refetch = vi.fn();
    mocks.raioX.mockReturnValue(consulta(undefined, { isPending: false, isError: true, refetch }));
    rerender(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    fireEvent.click(screen.getByRole('button', { name: TEXTOS_TELA.analise.tentarNovamente }));
    expect(refetch).toHaveBeenCalled();
    mocks.raioX.mockReturnValue(consulta({ ...respostaAcao('WEGE3'), anos: [], blocos: [] }));
    rerender(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    expect(screen.getByText(T.estados.vazio)).toBeTruthy();
  });
});

describe('BotaoExportarCsv', () => {
  it('gerando (desabilitado, spinner) → aviso com o nome do arquivo', async () => {
    let resolver: (v: { nome: string }) => void = () => {};
    mocks.baixar.mockReturnValue(new Promise((r) => (resolver = r)));
    render(<BotaoExportarCsv ticker="WEGE3" />);
    const botao = screen.getByRole('button', { name: T.csv.botao });
    expect(botao.className).toMatch(/min-h-11/);
    fireEvent.click(botao);
    expect(botao.textContent).toBe(T.csv.gerando);
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.baixar).toHaveBeenCalledWith('WEGE3');
    await act(async () => resolver({ nome: 'raio-x_WEGE3_2026-10-08.csv' }));
    expect(screen.getByRole('status').textContent).toBe('raio-x_WEGE3_2026-10-08.csv baixado');
    expect(botao.textContent).toBe(T.csv.botao);
  });

  it('erro → alerta com "Tentar de novo", que chama de novo', async () => {
    mocks.baixar.mockRejectedValueOnce(new Error('x'));
    mocks.baixar.mockResolvedValueOnce({ nome: 'a.csv' });
    render(<BotaoExportarCsv ticker="WEGE3" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: T.csv.botao }));
    });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain(T.csv.erro);
    await act(async () => {
      fireEvent.click(within(alerta).getByRole('button', { name: T.csv.tentarNovamente }));
    });
    expect(mocks.baixar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toBe('a.csv baixado');
  });
});
