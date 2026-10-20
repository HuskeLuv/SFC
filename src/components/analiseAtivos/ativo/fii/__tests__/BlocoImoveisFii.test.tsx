// @vitest-environment jsdom
/**
 * Seção "Imóveis e composição do fundo" (A6, fatia A). FII FICTÍCIO XPTO11 (nomes, cidades e
 * números inventados; nenhum valor de terceiros).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type {
  ImovelFiiApi,
  ImoveisFiiResposta,
  ListaImoveisFiiApi,
} from '@/types/analiseAtivosComplementos';

const q = vi.hoisted(() => ({ atual: {} as Record<string, unknown>, refetch: vi.fn() }));
vi.mock('@/hooks/useImoveisFii', () => ({
  useImoveisFii: () => ({ ...q.atual, refetch: q.refetch }),
}));

import BlocoImoveisFii from '@/components/analiseAtivos/ativo/fii/BlocoImoveisFii';

const T = TEXTOS_IMOVEIS_FII;

const imovel = (i: number): ImovelFiiApi => ({
  ordem: i,
  nome: `Galpão XPTO ${i}`,
  endereco: `Rua Inventada, ${i}, Cidade ${i}, SP`,
  uf: i % 3 === 0 ? null : 'SP',
  areaM2: 20000 - i * 1000,
  unidades: 1,
  vacanciaPct: i === 1 ? 12.5 : 0,
  receitaPct: 7,
});

const LISTA: ListaImoveisFiiApi = {
  refQuarter: '2026-06-30',
  resumo: {
    nImoveisRenda: 12,
    nOutros: 1,
    areaTotalM2: 1_120_000,
    vacanciaFisicaPct: { estado: 'ok', valor: 4.8 },
    nEstados: 1,
    nComUf: 8,
    setores: [
      { setor: 'Logística', receitaPct: 41.2 },
      { setor: 'Varejo', receitaPct: 19.8 },
    ],
  },
  imoveis: Array.from({ length: 12 }, (_, i) => imovel(i)),
  outros: [{ ordem: 99, nome: 'Terreno XPTO', classe: 'Terreno', areaM2: 210000 }],
  somaReceitaPct: 84,
  somaReceitaForaDaFaixa: true,
};

const RESPOSTA: ImoveisFiiResposta = {
  ticker: 'XPTO11',
  versao: 'v1',
  composicao: {
    estado: 'ok',
    valor: {
      refMonth: '2026-09-01',
      ativoTotal: 4_820_000_000,
      outrosDetalhado: false,
      fatias: [
        { codigo: 'imoveis', pct: 85.9, valor: 4_140_380_000 },
        { codigo: 'cri_cra', pct: 3.1, valor: 149_420_000 },
        { codigo: 'lci_lca', pct: 1.2, valor: 57_840_000 },
        { codigo: 'cotas_fii', pct: 0, valor: 0 },
        { codigo: 'caixa_renda_fixa', pct: 6.8, valor: 327_760_000 },
        { codigo: 'outros', pct: 3, valor: 144_600_000 },
      ],
    },
  },
  imoveis: { estado: 'ok', valor: LISTA },
};

const ok = (dados: ImoveisFiiResposta) => {
  q.atual = { isPending: false, isError: false, data: dados };
};

beforeEach(() => {
  q.refetch.mockReset();
  ok(RESPOSTA);
});
afterEach(cleanup);

describe('BlocoImoveisFii', () => {
  it('tijolo: composição (1/3) + lista (2/3) a partir de xl', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    const grid = container.querySelector('[data-bloco-imoveis-fii="com-lista"]')!;
    expect(grid.className).toContain('xl:grid-cols-3');
    expect(container.querySelectorAll('[data-fatia]')).toHaveLength(6);
    // 0% aparece (não some)
    expect(container.querySelector('[data-fatia="cotas_fii"]')!.textContent).toContain('0%');
    expect(screen.getByText(/set\/2026 · fonte CVM informe mensal/)).toBeTruthy();
  });

  it('resumo: locatários sem dado com o motivo, setores reais e estados identificados', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    const loc = container.querySelector('[data-locatarios]')!.textContent!;
    expect(loc).toContain(T.imoveis.resumo.locatariosSemDado);
    expect(loc).toContain('Logística 41,2% · Varejo 19,8%');
    expect(container.textContent).toContain('1,12 mi m²');
    expect(container.textContent).toContain('identificados no endereço (em 8 de 12 imóveis)');
    expect(container.textContent).toContain('+ 1 em outras classes');
  });

  it('soma da receita fora da faixa: nota sem normalizar; rodapé com a data do trimestre', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    expect(container.querySelector('[data-soma-receita-fora]')!.textContent).toContain('84,0%');
    expect(container.textContent).toContain('ref. 30/06/2026 · fonte CVM informe trimestral');
  });

  it('mostra 10 imóveis e "Ver os 12 imóveis" abre todos; outros imóveis no expansível', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    const tabela = container.querySelector('[data-imoveis-tabela]')!;
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Ver os 12 imóveis' }));
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(12);
    expect(screen.getByRole('button', { name: T.imoveis.verMenos })).toBeTruthy();
    const outros = container.querySelector('[data-imoveis-outros]')!;
    expect(outros.textContent).toContain('Outros imóveis (1)');
    expect(outros.textContent).toContain('Terreno XPTO');
  });

  it('390 px: a lista vira cartões (tabela só a partir de md); UF não identificada explícita', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    const cartoes = container.querySelector('[data-imoveis-cartoes]')!;
    expect(cartoes.className).toContain('md:hidden');
    expect(container.querySelector('[data-imoveis-tabela]')!.className).toContain(
      'hidden md:block',
    );
    const primeiro = within(cartoes as HTMLElement).getAllByRole('listitem')[0];
    expect(primeiro.textContent).toContain('Galpão XPTO 0');
    expect(primeiro.textContent).toContain(T.imoveis.ufNaoIdentificada);
    expect(primeiro.querySelectorAll('dt')).toHaveLength(4);
  });

  it('sem cor semântica e sem inadimplência por imóvel', () => {
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#D92D20|#F97066|emerald|text-red|text-green|bg-red|bg-green/);
    expect(container.textContent!.toLowerCase()).not.toContain('inadimpl');
  });

  it('papel/FoF: só a composição, na largura toda, com o "Como ler"', () => {
    ok({
      ...RESPOSTA,
      imoveis: {
        estado: 'nao_se_aplica',
        motivo: 'nao_se_aplica_tipo',
        texto: T.motivos.nao_se_aplica_tipo,
      },
    });
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="papel" />);
    expect(container.querySelector('[data-bloco-imoveis-fii="sem-lista"]')).toBeTruthy();
    expect(container.querySelector('[data-lista-imoveis]')).toBeNull();
    expect(container.textContent).toContain(T.composicao.comoLer);
    expect(container.textContent).toContain(T.composicao.semLista);
  });

  it('lista sem dado e composição inconsistente mostram o motivo', () => {
    ok({
      ...RESPOSTA,
      composicao: {
        estado: 'ausente',
        motivo: 'composicao_inconsistente',
        texto: T.motivos.composicao_inconsistente,
      },
      imoveis: {
        estado: 'ausente',
        motivo: 'sem_informe_trimestral',
        texto: T.motivos.sem_informe_trimestral,
      },
    });
    const { container } = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    expect(container.querySelector('[data-composicao-sem-dado]')!.textContent).toBe(
      T.motivos.composicao_inconsistente,
    );
    expect(container.querySelector('[data-imoveis-sem-dado]')!.textContent).toBe(
      T.motivos.sem_informe_trimestral,
    );
  });

  it('404: sem informe; erro: "Tentar de novo" refaz a busca; carregando: esqueleto', () => {
    q.atual = { isPending: false, isError: true, error: new ErroAnalise('x', 404) };
    const r1 = render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    expect(r1.container.textContent).toContain(T.motivos.sem_informe_mensal);
    cleanup();
    q.atual = { isPending: false, isError: true, error: new ErroAnalise('x', 500) };
    render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    fireEvent.click(screen.getByRole('button'));
    expect(q.refetch).toHaveBeenCalled();
    cleanup();
    q.atual = { isPending: true, isError: false };
    render(<BlocoImoveisFii ticker="XPTO11" fiiTipo="tijolo" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
