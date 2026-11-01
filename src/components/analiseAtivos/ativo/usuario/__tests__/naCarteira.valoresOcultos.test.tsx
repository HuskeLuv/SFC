// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';
import type {
  MetaRendaCenario,
  SuaPosicaoCenario,
} from '@/services/analiseAtivos/regras/valuation/montarCenarios';

/**
 * Esconder valores — Análise de Ativos, Fase 5 (fatia 1): o que é do USUÁRIO na página do ativo
 * (Na sua carteira, barra posição × alvo, Ver na Carteira, Planejar, Registrar operação, chip "Na
 * carteira", Sua posição, Meta de renda e Criar objetivo) e a coluna "Na carteira" do Quadro,
 * Comparador e Salvos. Valores-sentinela; a cotação (mercado) fica visível; formulários ficam
 * visíveis (decisão 3). Olho aberto = o mesmo DOM de sem o provider.
 */

const mocks = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => false,
  useMediaQuery: () => false,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: mocks.toast }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/carteira/AddAssetWizard', () => ({ default: () => null }));
vi.mock('@/components/carteira/wizard/shared/InstitutionPicker', () => ({
  default: ({ selectedName }: { selectedName: string }) => <span>{selectedName}</span>,
}));

import BlocoNaCarteira from '../BlocoNaCarteira';
import BarraPesoAlvo from '../BarraPesoAlvo';
import ModalVerNaCarteira from '@/components/analiseAtivos/ativo/acoes/ModalVerNaCarteira';
import ModalPlanejar from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import ModalRegistrarOperacao from '@/components/analiseAtivos/ativo/acoes/ModalRegistrarOperacao';
import { ChipsCarteira } from '@/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo';
import LinhaSuaPosicao from '@/components/analiseAtivos/ativo/cenarios/LinhaSuaPosicao';
import BlocoMetaRenda from '@/components/analiseAtivos/ativo/cenarios/BlocoMetaRenda';
import ConfirmarObjetivoPlanejamento from '@/components/analiseAtivos/ativo/cenarios/ConfirmarObjetivoPlanejamento';
import CelulaNaCarteira from '@/components/analiseAtivos/quadro/CelulaNaCarteira';

// ---------------------------------------------------------------------------
// Fixtures com sentinelas (as rotas reais da Carteira)
// ---------------------------------------------------------------------------

const COTACAO = 52.3; // mercado: fica visível
const QTD = SENTINELAS.quantidade; // 7.777
const PM = SENTINELAS.precoMedio; // 66,66
const VALOR = SENTINELAS.saldo; // 9.876.543,21
const APLICADO = SENTINELAS.aplicado; // 8.765.432,10
const OUTRAS = 40_000_000;

const LINHA = {
  id: 'pf-wege3',
  ticker: 'WEGE3',
  quantidade: QTD,
  precoAquisicao: PM,
  cotacaoAtual: COTACAO,
  valorAtualizado: VALOR,
  percentualCarteira: 3.8,
  objetivo: 30,
  quantoFalta: 0,
  necessidadeAporte: 0,
  rentabilidade: 41.2,
};
const ABA_ACOES = {
  secoes: [
    {
      nome: 'Growth',
      ativos: [
        LINHA,
        {
          ...LINHA,
          id: 'pf-outr3',
          ticker: 'OUTR3',
          quantidade: 1,
          valorAtualizado: OUTRAS,
          percentualCarteira: 80,
          objetivo: 0,
        },
      ],
    },
  ],
};
const RESUMO = {
  totais: { dinheiro: (VALOR + OUTRAS) / 0.33 },
  distribuicao: { acoes: { valor: VALOR + OUTRAS, percentual: 33 } },
};
const CONFIG = { configuracoes: [{ categoria: 'acoes', target: 35 }] };
const POSICAO = {
  ativo: { nome: 'WEG', ticker: 'WEGE3', instituicao: { id: 'inst-xp', nome: 'XP' } },
  posicao: {
    quantidade: QTD,
    precoMedio: PM,
    valorAplicado: APLICADO,
    saldoBruto: VALOR,
    rentabilidade: 12.68,
    resultado: VALOR - APLICADO,
    proventosRecebidos: APLICADO / 10,
    cotacaoAtual: COTACAO,
  },
  transacoes: [
    {
      id: 't1',
      tipoOperacao: 'Aporte',
      quantity: QTD,
      price: PM,
      total: APLICADO,
      date: '2025-05-02T00:00:00.000Z',
      notes: JSON.stringify({ operation: { instituicaoId: 'inst-xp' } }),
    },
  ],
};

let overlay: OverlayCarteiraResposta;

function roteador(url: string) {
  if (url.startsWith('/api/analise-ativos/carteira')) return mockFetchResponse(overlay);
  if (url.startsWith('/api/carteira/acoes')) return mockFetchResponse(ABA_ACOES);
  if (url.startsWith('/api/carteira/resumo')) return mockFetchResponse(RESUMO);
  if (url.startsWith('/api/carteira/configuracao')) return mockFetchResponse(CONFIG);
  if (url.startsWith('/api/ativos/pf-wege3')) return mockFetchResponse(POSICAO);
  if (url.startsWith('/api/ativos/price-at')) return mockFetchResponse({}, 404);
  return mockFetchResponse({ error: 'não mockado' }, 500);
}

beforeEach(() => {
  mocks.csrfFetch.mockReset();
  mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ success: true }, 201));
  mocks.toast.mockReset();
  overlay = {
    posicoes: {
      WEGE3: {
        portfolioId: 'pf-wege3',
        quantidade: QTD,
        categoria: 'acoes',
        objetivoPct: 30,
        estrategia: 'growth',
        tipoFii: null,
      },
    },
    planejados: {},
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => roteador(String(url))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Renderiza com o olho fechado (padrão), aberto, ou sem o provider (`semProvider`). */
function montar(ui: React.ReactElement, modo: 'fechado' | 'aberto' | 'sem' = 'fechado') {
  const client = createTestQueryClient();
  const arvore = <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
  if (modo === 'sem') return render(arvore);
  return render(<ComValoresOcultos ocultos={modo === 'fechado'}>{arvore}</ComValoresOcultos>);
}

const pmTexto = 'R$ 66,66';

// ---------------------------------------------------------------------------

describe('BlocoNaCarteira (Na sua carteira)', () => {
  const props = {
    ticker: 'WEGE3',
    classe: 'acao' as const,
    nome: 'WEG',
    assetId: 'a-wege',
    precoCabecalho: 51, // ≠ cotação da Carteira: aparece a nota com a cotação (mercado)
    precoData: '2026-09-29',
  };

  it('olho fechado: quantidade, valor, preço médio e desvio em R$ viram pílula; % e cotação ficam', async () => {
    const { container } = montar(<BlocoNaCarteira {...props} />);
    await waitFor(() => expect(container.querySelector('[data-barra-peso]')).not.toBeNull());
    expectSemValoresExpostos(container);
    expect(container.querySelectorAll('.mf-sensivel--curto').length).toBeGreaterThanOrEqual(1);
    expectPilulas(container);
    const card = container.querySelector('[data-na-carteira="posicao"]')!;
    expect(card.textContent).toContain('41,20%'); // rentabilidade (%) fica
    // cotação = mercado: continua na nota, como ValorVisivel
    expect(card.querySelector('[data-nota-cotacao] [data-mf-valor-visivel]')?.textContent).toMatch(
      /R\$\s52,30/,
    );
    // o rótulo acessível da barra não leva dinheiro
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/R\$\s?\d/);
  });

  it('olho aberto: o mesmo DOM de sem o provider (nada muda)', async () => {
    const aberto = montar(<BlocoNaCarteira {...props} />, 'aberto');
    await waitFor(() => expect(aberto.container.querySelector('[data-barra-peso]')).not.toBeNull());
    const htmlAberto = aberto.container.innerHTML;
    aberto.unmount();
    const sem = montar(<BlocoNaCarteira {...props} />, 'sem');
    await waitFor(() => expect(sem.container.querySelector('[data-barra-peso]')).not.toBeNull());
    expect(htmlAberto).toBe(sem.container.innerHTML);
    expect(sem.container.textContent).toContain(pmTexto);
    expect(htmlAberto).not.toContain('mf-sensivel');
  });
});

describe('BarraPesoAlvo', () => {
  it('desvio em R$ no texto e no rótulo acessível padrão vira pílula/máscara', () => {
    const { container } = render(
      <ComValoresOcultos>
        <BarraPesoAlvo
          rotulo="posição atual 17,2% da aba"
          valor={17.2}
          referencia={20}
          rotuloReferencia="alvo planejado por você: 20,0% em Ações · desvio −2,8 p.p. (R$ 9.876.543)"
        />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 1);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('R$ •••••');
    expect(container.textContent).toContain('−2,8 p.p.');
  });
});

describe('ModalVerNaCarteira', () => {
  it('olho fechado: posição, valores, custo, resultado, proventos e operações escondidos', async () => {
    montar(<ModalVerNaCarteira aberto onFechar={() => {}} ticker="WEGE3" classe="acao" />);
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(dialogo.querySelector('[data-ver-posicao]')).not.toBeNull());
    await waitFor(() => expect(dialogo.querySelector('table')).not.toBeNull());
    expectSemValoresExpostos(dialogo);
    // a cotação de mercado continua ("a R$ 52,30")
    expect(dialogo.querySelector('[data-mf-valor-visivel]')?.textContent).toMatch(/R\$\s52,30/);
    expect(dialogo.textContent).toContain('+12,7%'); // resultado em % fica
    // quantidade na tabela: pílula curta (não muda a altura da linha)
    expect(dialogo.querySelectorAll('td .mf-sensivel--curto')).toHaveLength(1);
  });
});

describe('ModalPlanejar (formulário)', () => {
  it('o campo fica visível; posição e resumo calculado viram pílula', async () => {
    montar(
      <ModalPlanejar
        aberto
        onFechar={() => {}}
        ticker="WEGE3"
        classe="acao"
        nome="WEG"
        assetId="a-wege"
        preco={COTACAO}
      />,
    );
    const campo = (await screen.findByLabelText(
      'Peso-alvo dentro de Ações (%)',
    )) as HTMLInputElement;
    await waitFor(() =>
      expect(document.querySelector('[data-resumo-plano] .mf-sensivel')).not.toBeNull(),
    );
    fireEvent.change(campo, { target: { value: '35' } });
    expect(campo.value).toBe('35'); // decisão 3: o número digitado aparece
    const dialogo = screen.getByRole('dialog');
    await waitFor(() =>
      expect(dialogo.querySelectorAll('[data-resumo-plano] .mf-sensivel').length).toBeGreaterThan(
        1,
      ),
    );
    expectSemValoresExpostos(dialogo);
  });
});

describe('ModalRegistrarOperacao (formulário)', () => {
  it('campos visíveis; total, nova posição, PM e a posição do rodapé viram pílula', async () => {
    montar(
      <ModalRegistrarOperacao
        aberto
        onFechar={() => {}}
        ticker="WEGE3"
        classe="acao"
        nome="WEG"
        assetId="a-wege"
        preco={COTACAO}
        fiiTipo={null}
      />,
    );
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(dialogo.textContent).toContain('Posição atual:'));
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: '10' } });
    expect((screen.getByLabelText(/Quantidade/) as HTMLInputElement).value).toBe('10');
    await waitFor(() =>
      expect(dialogo.querySelectorAll('[data-resumo-operacao] .mf-sensivel')).toHaveLength(3),
    );
    expectSemValoresExpostos(dialogo);
  });
});

describe('ChipsCarteira', () => {
  it('o title do chip "Na carteira" não leva a quantidade', async () => {
    const { container } = montar(<ChipsCarteira ticker="WEGE3" classe="acao" />);
    await waitFor(() => expect(container.querySelector('[title]')).not.toBeNull());
    expectSemValoresExpostos(container);
    expect(container.querySelector('[title]')!.getAttribute('title')).toContain('•••••');
  });
});

describe('Cenários: Sua posição, Meta de renda e Criar objetivo', () => {
  const posicao: SuaPosicaoCenario = {
    classe: 'fii',
    quantidade: QTD,
    pm: PM,
    multiploSobreCusto: 0.95,
    yieldSobreCustoPct: 12.4,
    proventoEmConferencia: false,
  };
  const meta: MetaRendaCenario = {
    rendaMensal: 6543.21,
    rend12m: 1.234,
    cotas: 8888,
    custo: SENTINELAS.saldo,
    diferenca: 8888 - QTD,
    quantidade: QTD,
    target: SENTINELAS.aplicado,
    available: SENTINELAS.saldo / 2,
    cotacao: 10.05,
  };
  const sentinelasMeta = [...Object.values(SENTINELAS), 6543.21, 8888, 1111];

  it('Sua posição: quantidade e PM viram pílula; P/VP e rendimento sobre custo ficam', () => {
    const { container } = montar(
      <LinhaSuaPosicao posicao={posicao} classe="fii" consultor={false} />,
    );
    expectSemValoresExpostos(container);
    expect(container.textContent).toContain('0,95');
    expect(container.textContent).toContain('12,4%');
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(1);
  });

  it('Meta de renda: renda, cotas, custo e diferença viram pílula; rendimento e cotação ficam', () => {
    const { container } = montar(
      <BlocoMetaRenda
        ticker="MXRF11"
        meta={meta}
        temPosicao
        consultor={false}
        onCriado={() => {}}
      />,
    );
    expectSemValoresExpostos(container, { sentinelas: sentinelasMeta });
    expect(container.textContent).toContain('1,234'); // rendimento 12m por cota (mercado)
    expect(container.querySelector('[data-mf-valor-visivel]')?.textContent).toBe('10,05');
  });

  it('Criar objetivo: valor e já disponível viram pílula; o nome (campo) fica', () => {
    montar(
      <ConfirmarObjetivoPlanejamento
        aberto
        onFechar={() => {}}
        ticker="MXRF11"
        meta={meta}
        consultor={false}
        onCriado={() => {}}
      />,
    );
    const dialogo = screen.getByRole('dialog');
    expectSemValoresExpostos(dialogo, { sentinelas: sentinelasMeta.filter((n) => n !== 6543.21) });
    // formulário: o nome editável continua com a renda digitada (decisão 3)
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toContain('R$ 6.543');
    expect(
      dialogo.querySelector('[data-objetivo-valor] [data-mf-valor-visivel]')?.textContent,
    ).toBe('10,05');
  });

  it('olho aberto: os textos ficam iguais aos de sem o provider', () => {
    const a = montar(
      <>
        <LinhaSuaPosicao posicao={posicao} classe="fii" consultor={false} />
        <BlocoMetaRenda
          ticker="MXRF11"
          meta={meta}
          temPosicao
          consultor={false}
          onCriado={() => {}}
        />
      </>,
      'aberto',
    );
    const html = a.container.innerHTML;
    a.unmount();
    const s = montar(
      <>
        <LinhaSuaPosicao posicao={posicao} classe="fii" consultor={false} />
        <BlocoMetaRenda
          ticker="MXRF11"
          meta={meta}
          temPosicao
          consultor={false}
          onCriado={() => {}}
        />
      </>,
      'sem',
    );
    expect(html).toBe(s.container.innerHTML);
  });
});

describe('CelulaNaCarteira (Quadro, Comparador e Salvos)', () => {
  it('a quantidade vira pílula curta; o % da carteira fica', () => {
    const { container } = montar(
      <CelulaNaCarteira
        info={{ tipo: 'posicao', quantidade: QTD, percentual: 3.8 }}
        classe="fii"
      />,
    );
    expectSemValoresExpostos(container);
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(1);
    expect(container.textContent).toContain('cotas · 3,80%');
  });

  it('olho aberto: o texto de hoje', () => {
    const { container } = montar(
      <CelulaNaCarteira
        info={{ tipo: 'posicao', quantidade: QTD, percentual: 3.8 }}
        classe="fii"
      />,
      'aberto',
    );
    expect(container.textContent).toBe('7.777 cotas · 3,80%');
    expect(container.querySelector('.mf-sensivel')).toBeNull();
  });
});
