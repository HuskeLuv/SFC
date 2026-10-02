// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AVISO_LIQUIDEZ_RESERVA,
  AVISO_OBJETIVO_ZERA,
  AVISO_SAUDE_RESERVA,
  CATEGORIAS_MOVIVEIS_TODAS,
  MOTIVO_COM_COTACAO,
  MOTIVO_SALDO_SEM_COTACAO_BOLSA,
  MOTIVO_SALDO_SEM_TITULO,
  MOTIVO_SEM_COTACAO_BOLSA,
  SUBGRUPOS_POR_CATEGORIA,
  rotuloCategoria,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import { queryKeys } from '@/lib/queryKeys';
import type { MoverAlvo } from '@/types/carteiraMover';
import { opcoesKdif } from './fixtures';

const { mostrarToastMover, belowLg, categoriaEfetiva } = vi.hoisted(() => ({
  mostrarToastMover: vi.fn(),
  belowLg: { value: false },
  categoriaEfetiva: {
    value: { categoria: null as string | null, override: false },
  },
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => belowLg.value,
  useMediaQuery: () => belowLg.value,
}));
vi.mock('@/hooks/useCategoriaEfetivaAtivo', () => ({
  useCategoriaEfetivaAtivo: () => ({
    ...categoriaEfetiva.value,
    carregando: false,
    carregandoSecao: false,
    secaoAtual: null,
  }),
}));
// Subcampos pesados do Step4 (fora do que se testa aqui).
vi.mock('@/components/carteira/wizard/Step4TesouroReservaFields', () => ({
  default: () => <div data-testid="campos-reserva" />,
}));
vi.mock('@/components/carteira/wizard/Step4TesouroRendaFixaFields', () => ({
  default: () => <div data-testid="campos-rf" />,
}));
vi.mock('@/components/carteira/wizard/shared/ReinvestimentoToggle', () => ({
  default: () => null,
}));
vi.mock('@/components/form/Select', () => ({
  default: ({ id }: { id?: string }) => <select id={id} aria-label="Onde exibir" />,
}));

import { chipsDaBandeja } from '../AbaDropTarget';
import { EscolherSecaoPopover } from '../EscolherSecaoPopover';
import MoverInvestimento from '../MoverInvestimento';
import { entradaDosEfeitos } from '../EfeitosMoverList';
import { queryKeyDaAba, removerLinhaReserva } from '../moverOptimistic';
import { useMoverInvestimento } from '@/hooks/useMoverInvestimento';
import Step4TesouroDiretoFields, {
  destinoTesouroDaAba,
} from '@/components/carteira/wizard/Step4TesouroDiretoFields';

// ── Fixtures (payload do GET /mover com a chave LIGADA) ─────────────────────────────────────

const ABA_ID: Record<CategoriaMovivel, string> = {
  reservaEmergencia: 'reserva-emergencia',
  reservaOportunidade: 'reserva-oportunidade',
  rendaFixaFundos: 'renda-fixa',
  fimFia: 'fim-fia',
  fiis: 'fiis',
  acoes: 'acoes',
  stocks: 'stocks',
  reits: 'reit',
  etfs: 'etf',
};

const destino = (categoria: CategoriaMovivel, extra: Partial<DestinoOpcao> = {}): DestinoOpcao => ({
  categoria,
  abaId: ABA_ID[categoria],
  label: rotuloCategoria(categoria),
  permitido: true,
  subgrupos: SUBGRUPOS_POR_CATEGORIA[categoria].map((s) => ({ ...s, atual: false })),
  subgrupoSugerido: SUBGRUPOS_POR_CATEGORIA[categoria][0]?.id ?? '',
  avisos: [],
  subgrupoEditavel: !['reservaEmergencia', 'reservaOportunidade', 'rendaFixaFundos'].includes(
    categoria,
  ),
  ...extra,
});

const RV: CategoriaMovivel[] = ['fimFia', 'fiis', 'acoes', 'stocks', 'reits', 'etfs'];

/** CDB pós (CDI) na Renda Fixa › Pós-fixada, R$ 15.000, sem liquidez diária. */
function opcoesCdbRf(): MoverOpcoesResponse {
  return {
    item: {
      tipo: 'posicao',
      id: 'pf-cdb',
      assetId: 'a-cdb',
      ticker: 'CDB-INTER',
      nome: 'CDB Inter',
      moeda: 'BRL',
      valorAtualBRL: 15000,
    },
    atual: {
      categoria: 'rendaFixaFundos',
      abaId: 'renda-fixa',
      subgrupo: 'pos-fixada',
      subgrupoLabel: 'Pós-fixada',
      override: false,
    },
    movido: null,
    original: null,
    modelo: 'curva',
    grupo: 'caixaRf',
    movivel: true,
    destinos: [
      destino('reservaEmergencia', {
        avisos: [AVISO_LIQUIDEZ_RESERVA, AVISO_SAUDE_RESERVA, AVISO_OBJETIVO_ZERA],
      }),
      destino('reservaOportunidade', { avisos: [AVISO_OBJETIVO_ZERA] }),
      destino('rendaFixaFundos', {
        secaoAutomatica: { id: 'pos-fixada', label: 'Pós-fixada', via: 'indexador' },
      }),
      ...RV.map((c) => destino(c, { permitido: false, motivo: MOTIVO_SEM_COTACAO_BOLSA })),
    ],
    avisos: [],
  };
}

/** Conta corrente na Reserva Emergência (saldo sem título). */
function opcoesSaldoEmergencia(): MoverOpcoesResponse {
  return {
    ...opcoesCdbRf(),
    item: {
      tipo: 'posicao',
      id: 'pf-cc',
      assetId: 'a-cc',
      ticker: 'CONTA-CORRENTE-EMERG',
      nome: 'Conta corrente',
      moeda: 'BRL',
      valorAtualBRL: 2000,
    },
    atual: {
      categoria: 'reservaEmergencia',
      abaId: 'reserva-emergencia',
      subgrupo: null,
      subgrupoLabel: null,
      override: false,
    },
    destinos: [
      destino('reservaEmergencia'),
      destino('reservaOportunidade', { avisos: [AVISO_SAUDE_RESERVA] }),
      destino('rendaFixaFundos', { permitido: false, motivo: MOTIVO_SALDO_SEM_TITULO }),
      ...RV.map((c) => destino(c, { permitido: false, motivo: MOTIVO_SALDO_SEM_COTACAO_BOLSA })),
    ],
  };
}

/** KDIF11 (FII) com a chave LIGADA: as 3 do trio vêm recusadas com MOTIVO_COM_COTACAO. */
function opcoesKdifChaveLigada(): MoverOpcoesResponse {
  const base = opcoesKdif();
  return {
    ...base,
    grupo: 'rv',
    destinos: [
      destino('reservaEmergencia', { permitido: false, motivo: MOTIVO_COM_COTACAO }),
      destino('reservaOportunidade', { permitido: false, motivo: MOTIVO_COM_COTACAO }),
      destino('rendaFixaFundos', { permitido: false, motivo: MOTIVO_COM_COTACAO }),
      ...base.destinos,
    ],
  };
}

const SAUDE = {
  indicadores: { benchmarks: { reservaEmergencia: { necessario: 30000, atual: 18400 } } },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

function rotas(opcoes: MoverOpcoesResponse, { saudeStatus = 200 } = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('/api/carteira/mover?')) return Promise.resolve(jsonResponse(opcoes));
    if (u === '/api/saude-financeira') {
      return Promise.resolve(
        saudeStatus === 200 ? jsonResponse(SAUDE) : jsonResponse({ error: 'x' }, saudeStatus),
      );
    }
    if (u === '/api/carteira/mover' && init?.method === 'POST') {
      return Promise.resolve(
        jsonResponse({
          ok: true,
          origem: { categoria: opcoes.atual.categoria, subgrupo: opcoes.atual.subgrupo },
          destino: { categoria: 'reservaEmergencia', subgrupo: null },
          objetivoZerado: false,
          historicoId: 'h1',
        }),
      );
    }
    return Promise.resolve(jsonResponse({ secoes: [] }));
  });
}

const novoClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });

function comClient(ui: React.ReactElement, queryClient = novoClient()) {
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

const postBody = () =>
  JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1].body as string);

beforeEach(() => {
  belowLg.value = false;
  categoriaEfetiva.value = { categoria: null, override: false };
  fetchMock.mockReset();
  mostrarToastMover.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Bandeja ─────────────────────────────────────────────────────────────────────────────────

describe('chipsDaBandeja — fase 2', () => {
  it('CDB na Renda Fixa: só as 2 Reservas, sem chip travado, detalhe "sem seções"', () => {
    const chips = chipsDaBandeja('rendaFixaFundos', opcoesCdbRf());
    expect(chips.map((c) => [c.categoria, c.permitido, c.detalhe])).toEqual([
      ['reservaEmergencia', true, 'sem seções'],
      ['reservaOportunidade', true, 'sem seções'],
    ]);
  });

  it('item da Reserva: o chip da Renda Fixa diz a seção que ele terá (nunca "0 seções")', () => {
    const opcoes = opcoesCdbRf();
    opcoes.atual = { ...opcoes.atual, categoria: 'reservaOportunidade', subgrupo: null };
    const chips = chipsDaBandeja('reservaOportunidade', opcoes);
    expect(chips.map((c) => c.detalhe)).toEqual(['sem seções', 'entra em Pós-fixada']);
    // Antes das opções chegarem: "seção automática".
    expect(chipsDaBandeja('reservaOportunidade', undefined)[1].detalhe).toBe('seção automática');
  });

  it('saldo em conta: a Renda Fixa vem travada (motivo próprio) no fim', () => {
    const chips = chipsDaBandeja('reservaEmergencia', opcoesSaldoEmergencia());
    expect(chips.map((c) => [c.categoria, c.permitido])).toEqual([
      ['reservaOportunidade', true],
      ['rendaFixaFundos', false],
    ]);
    expect(chips[1].motivo).toBe(MOTIVO_SALDO_SEM_TITULO);
  });

  it('FII: bandeja IDÊNTICA à fase 1 com a chave ligada ou desligada (sem chips novos)', () => {
    const desligada = chipsDaBandeja('fiis', opcoesKdif());
    const ligada = chipsDaBandeja('fiis', opcoesKdifChaveLigada());
    expect(ligada).toEqual(desligada);
    expect(desligada.map((c) => c.categoria)).toEqual([
      'fimFia',
      'acoes',
      'etfs',
      'stocks',
      'reits',
    ]);
    expect(desligada.every((c) => !('detalhe' in c))).toBe(true);
  });
});

// ── Confirmação ao soltar ───────────────────────────────────────────────────────────────────

const ALVO_CDB: MoverAlvo = {
  tipo: 'posicao',
  id: 'pf-cdb',
  categoria: 'rendaFixaFundos',
  secaoAtual: 'pos-fixada',
  label: 'CDB Inter',
};

function montarPopover(destinoCat: CategoriaMovivel, opcoes: MoverOpcoesResponse, saude = 200) {
  rotas(opcoes, { saudeStatus: saude });
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  comClient(
    <EscolherSecaoPopover
      alvo={ALVO_CDB}
      destino={destinoCat}
      anchorEl={anchor}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmarMoverCard (soltar numa aba do trio)', () => {
  it('Reserva Emergência: sem chips de seção; S com antes → depois, !, A, F e = em ordem', async () => {
    const { onConfirm } = montarPopover('reservaEmergencia', opcoesCdbRf());
    const dialog = await screen.findByRole('dialog', { name: 'Mover para Reserva Emergência?' });
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
    expect(dialog).toHaveTextContent('CDB Inter sai de Renda Fixa › Pós-fixada.');
    expect(dialog).toHaveTextContent('A Reserva não tem seções.');

    await waitFor(() => expect(dialog).toHaveTextContent('R$ 18.400,00 → R$ 33.400,00'));
    const itens = within(dialog).getAllByRole('listitem');
    expect(itens.map((li) => li.getAttribute('data-marcador'))).toEqual(['S', '!', 'A', 'F', '=']);
    expect(itens[0]).toHaveTextContent('necessário R$ 30.000,00');
    expect(itens[0]).toHaveTextContent('deixa de aparecer');
    expect(itens[1]).toHaveTextContent('Liquidez: sem liquidez diária');
    expect(itens[2]).toHaveTextContent(AVISO_OBJETIVO_ZERA);
    expect(itens[3]).toHaveTextContent(
      '“Renda Fixa & Fundos Renda Fixa” para “Reserva Emergência”',
    );

    const mover = within(dialog).getByRole('button', { name: 'Mover' });
    expect(mover.className).toContain('min-h-11');
    expect(within(dialog).getByRole('button', { name: 'Cancelar' }).className).toContain(
      'min-h-11',
    );
    await waitFor(() => expect(mover).toHaveFocus());
    fireEvent.click(mover);
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('usa a saudePrevia do GET /mover e não busca a Saúde Financeira', async () => {
    montarPopover('reservaEmergencia', {
      ...opcoesCdbRf(),
      saudePrevia: { reservaAtual: 10000, necessario: 30000 },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Mover para Reserva Emergência?' });
    await waitFor(() => expect(dialog).toHaveTextContent('R$ 10.000,00 → R$ 25.000,00'));
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/saude-financeira')).toBe(false);
  });

  it('sem a Saúde (erro): a linha S cai na frase fixa', async () => {
    montarPopover('reservaEmergencia', opcoesCdbRf(), 500);
    const dialog = await screen.findByRole('dialog', { name: 'Mover para Reserva Emergência?' });
    await waitFor(() =>
      expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4),
    );
    await waitFor(() =>
      expect(dialog.querySelector('[data-marcador="S"]')).toHaveTextContent(AVISO_SAUDE_RESERVA),
    );
  });

  it('Reserva Oportunidade a partir da RF: sem S (a Emergência não muda) e a Saúde nem é pedida', async () => {
    montarPopover('reservaOportunidade', opcoesCdbRf());
    const dialog = await screen.findByRole('dialog', { name: 'Mover para Reserva Oportunidade?' });
    await waitFor(() => expect(within(dialog).getAllByRole('listitem').length).toBe(3));
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-marcador')),
    ).toEqual(['A', 'F', '=']);
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/saude-financeira')).toBe(false);
  });

  it('item de bolsa (fase 1) continua com os chips de seção', async () => {
    rotas(opcoesKdif());
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    comClient(
      <EscolherSecaoPopover
        alvo={{
          tipo: 'posicao',
          id: 'pf-kdif',
          categoria: 'fiis',
          secaoAtual: 'fofi',
          label: 'KDIF11',
        }}
        destino="fimFia"
        anchorEl={anchor}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Mover KDIF11 para Fundos' });
    expect(within(dialog).getAllByRole('radio').length).toBeGreaterThan(0);
    expect(dialog.querySelector('[data-mf-efeitos-mover]')).toBeNull();
  });
});

// ── Diálogo e painel "Mover para…" ──────────────────────────────────────────────────────────

function montarDialogo(opcoes: MoverOpcoesResponse) {
  rotas(opcoes);
  return comClient(
    <MoverInvestimento alvo={{ tipo: 'posicao', id: opcoes.item.id }} open onClose={vi.fn()} />,
  );
}

describe('MoverInvestimento — fase 2 (computador)', () => {
  it('grupo "Abas de renda fixa" com rádios-chip de 44px, sem passo de seção', async () => {
    montarDialogo(opcoesCdbRf());
    const dialog = await screen.findByRole('dialog', { name: 'Mover CDB-INTER' });
    const grupo = await within(dialog).findByRole('group', { name: /Abas de renda fixa/ });
    const radios = within(grupo).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
      'rendaFixaFundos',
      'reservaEmergencia',
      'reservaOportunidade',
    ]);
    expect(radios[0]).toBeDisabled();
    expect(grupo.querySelectorAll('.min-h-11')).toHaveLength(3);
    expect(dialog).toHaveTextContent(
      'Escolha uma aba para ver o efeito na Saúde Financeira, na Alocação e no Fluxo.',
    );
    // Bloqueados: as 6 de bolsa/fundos + as 4 fora da fase, num details com summary de 44px.
    const resumo = within(dialog).getByText('10 abas não aceitam este título');
    expect(resumo.tagName).toBe('SUMMARY');
    expect(resumo.className).toContain('min-h-11');
    const lista = resumo.closest('details')!;
    expect(lista).toHaveTextContent(`FII's: ${MOTIVO_SEM_COTACAO_BOLSA}`);
    expect(lista).toHaveTextContent('Opções: Ainda não dá para mover ativos para esta aba');
  });

  it('escolher a Reserva mostra os efeitos no rodapé e o POST vai sem subgrupo', async () => {
    montarDialogo(opcoesCdbRf());
    const dialog = await screen.findByRole('dialog', { name: 'Mover CDB-INTER' });
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'Reserva Emergência' }));
    const efeitos = dialog.querySelector('[data-mf-mover-impacto="caixaRf"]')!;
    await waitFor(() => expect(efeitos).toHaveTextContent('R$ 18.400,00 → R$ 33.400,00'));
    // O aviso de liquidez/Saúde/objetivo do servidor não se repete fora da lista.
    expect(efeitos.querySelectorAll('p')).toHaveLength(0);
    const primario = within(dialog).getByRole('button', { name: 'Mover para Reserva Emergência' });
    fireEvent.click(primario);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true),
    );
    expect(postBody()).toEqual({
      acao: 'mover',
      tipo: 'posicao',
      id: 'pf-cdb',
      categoria: 'reservaEmergencia',
    });
  });

  it('Reserva → Renda Fixa: selo "Pós-fixada · pelo indexador" e a linha §', async () => {
    const opcoes = opcoesCdbRf();
    opcoes.atual = {
      categoria: 'reservaOportunidade',
      abaId: 'reserva-oportunidade',
      subgrupo: null,
      subgrupoLabel: null,
      override: true,
    };
    montarDialogo(opcoes);
    const dialog = await screen.findByRole('dialog', { name: 'Mover CDB-INTER' });
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'Renda Fixa' }));
    expect(within(dialog).getByText('Pós-fixada · pelo indexador')).toBeInTheDocument();
    await waitFor(() =>
      expect(dialog.querySelector('[data-marcador="§"]')).toHaveTextContent(
        'Seção: entra em Pós-fixada, pelo indexador.',
      ),
    );
  });

  it('saldo em conta: só a outra Reserva; Renda Fixa entre os bloqueados ("este saldo")', async () => {
    montarDialogo(opcoesSaldoEmergencia());
    const dialog = await screen.findByRole('dialog', { name: 'Mover CONTA-CORRENTE-EMERG' });
    const grupo = await within(dialog).findByRole('group', { name: /Abas de renda fixa/ });
    expect(within(grupo).getAllByRole('radio')).toHaveLength(2);
    const lista = within(dialog).getByText('11 abas não aceitam este saldo').closest('details')!;
    expect(lista).toHaveTextContent(`Renda Fixa: ${MOTIVO_SALDO_SEM_TITULO}`);
  });

  it('FII com a chave ligada: diálogo da fase 1, trio entre os bloqueados com "Tem cotação de mercado"', async () => {
    montarDialogo(opcoesKdifChaveLigada());
    const resumo = await screen.findByText(/abas não aceitam KDIF11/);
    const lista = resumo.closest('details')!;
    expect(lista).toHaveTextContent(`Renda Fixa: ${MOTIVO_COM_COTACAO}`);
    expect(lista).toHaveTextContent(`Reserva Emergência: ${MOTIVO_COM_COTACAO}`);
    expect(screen.queryByRole('group', { name: /Abas de renda fixa/ })).toBeNull();
  });

  it('chave desligada: CDB não é movível (frase, sem botão de mover)', async () => {
    const opcoes = opcoesCdbRf();
    montarDialogo({
      ...opcoes,
      modelo: 'fixo',
      movivel: false,
      grupo: undefined,
      motivo: 'Renda Fixa ainda não pode ser movida para outra aba',
      destinos: [],
    });
    const dialog = await screen.findByRole('dialog', { name: 'Mover CDB-INTER' });
    expect(
      await within(dialog).findByText('Renda Fixa ainda não pode ser movida para outra aba.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Mover/ })).toBeNull();
  });
});

describe('MoverInvestimento — fase 2 (celular)', () => {
  it('opções de 56px com descrição e efeitos na área rolável', async () => {
    belowLg.value = true;
    const opcoes = opcoesCdbRf();
    opcoes.atual = { ...opcoes.atual, categoria: 'reservaEmergencia', subgrupo: null };
    montarDialogo(opcoes);
    const grupo = await screen.findByRole('radiogroup', { name: 'Abas de renda fixa' });
    const radios = within(grupo).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'Reserva EmergênciaAtual',
      'Reserva OportunidadeLista única, sem seções',
      'Renda FixaEntra em Pós-fixada, pelo indexador',
    ]);
    radios.forEach((r) => expect(r.className).toContain('min-h-14'));
    expect(radios[0]).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(radios[2]);
    await waitFor(() =>
      expect(document.querySelector('[data-marcador="§"]')).toHaveTextContent('Pós-fixada'),
    );
    expect(screen.getByRole('button', { name: 'Mover para Renda Fixa' })).toBeEnabled();
  });
});

// ── Otimista e chaves de cache ──────────────────────────────────────────────────────────────

describe('otimista e cache das Reservas', () => {
  it('queryKeyDaAba: Reservas em queryKeys.reserva.*, RF e fase 1 em assets.type', () => {
    expect(queryKeyDaAba('reservaEmergencia')).toEqual(queryKeys.reserva.emergencia());
    expect(queryKeyDaAba('reservaOportunidade')).toEqual(queryKeys.reserva.oportunidade());
    expect(queryKeyDaAba('rendaFixaFundos')).toEqual(queryKeys.assets.type('renda-fixa'));
    expect(queryKeyDaAba('fiis')).toEqual(queryKeys.assets.type('fii'));
    expect(CATEGORIAS_MOVIVEIS_TODAS.every((c) => queryKeyDaAba(c).length > 0)).toBe(true);
  });

  it('removerLinhaReserva tira a linha de {ativos} e desconta saldo e rendimento', () => {
    const dados = {
      ativos: [
        { id: 'a', valorInicial: 1000, aporte: 0, resgate: 0, valorAtualizado: 1100 },
        { id: 'b', valorInicial: 500, aporte: 100, resgate: 0, valorAtualizado: 650 },
      ],
      saldoInicioMes: 1500,
      rendimento: 150,
      rentabilidade: 9,
    };
    const novo = removerLinhaReserva(dados, 'b');
    expect(novo.ativos.map((a) => a.id)).toEqual(['a']);
    expect(novo.saldoInicioMes).toBe(1000);
    expect(novo.rendimento).toBe(100);
    expect(dados.ativos).toHaveLength(2);
  });

  it('useMoverInvestimento: sai da Reserva no cache (otimista) e invalida a Saúde', async () => {
    let resolverPost: ((r: Response) => void) | null = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/carteira/mover' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolverPost = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ ativos: [] }));
    });
    const queryClient = novoClient();
    queryClient.setQueryData(queryKeys.reserva.emergencia(), {
      ativos: [{ id: 'pf-cdb', valorInicial: 1000, valorAtualizado: 1000, aporte: 0, resgate: 0 }],
      saldoInicioMes: 1000,
      rendimento: 0,
      rentabilidade: 0,
    });
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMoverInvestimento(), { wrapper });
    const alvo: MoverAlvo = {
      tipo: 'posicao',
      id: 'pf-cdb',
      categoria: 'reservaEmergencia',
      secaoAtual: '',
      label: 'CDB Inter',
    };
    let promessa!: Promise<unknown>;
    act(() => {
      promessa = result.current.mover({ alvo, categoria: 'rendaFixaFundos', subgrupo: '' });
    });
    await waitFor(() => expect(resolverPost).not.toBeNull());
    expect(
      (queryClient.getQueryData(queryKeys.reserva.emergencia()) as { ativos: unknown[] }).ativos,
    ).toHaveLength(0);
    expect(postBody()).toEqual({
      acao: 'mover',
      tipo: 'posicao',
      id: 'pf-cdb',
      categoria: 'rendaFixaFundos',
    });
    await act(async () => {
      resolverPost!(
        jsonResponse({
          ok: true,
          origem: { categoria: 'reservaEmergencia', subgrupo: null },
          destino: { categoria: 'rendaFixaFundos', subgrupo: 'pos-fixada' },
          objetivoZerado: false,
          historicoId: 'h1',
        }),
      );
      await promessa;
    });
    expect(mostrarToastMover.mock.calls[0][0]).toMatchObject({
      tipo: 'ok',
      mensagem: 'CDB Inter movido para Renda Fixa › Pós-fixada.',
      ver: { label: 'Ver em Renda Fixa' },
    });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toContain(JSON.stringify(queryKeys.saudeFinanceira.all));
    expect(chaves).toContain(JSON.stringify(queryKeys.reserva.emergencia()));
  });

  it('erro: a linha volta para a Reserva (rollback) e o aviso diz só a aba', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/carteira/mover' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ error: 'Falhou' }, 500));
      }
      return Promise.resolve(jsonResponse({ ativos: [] }));
    });
    const queryClient = novoClient();
    const dados = { ativos: [{ id: 'pf-cc', valorInicial: 10, valorAtualizado: 10 }] };
    queryClient.setQueryData(queryKeys.reserva.oportunidade(), dados);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMoverInvestimento(), { wrapper });
    await act(async () => {
      await result.current
        .mover({
          alvo: {
            tipo: 'posicao',
            id: 'pf-cc',
            categoria: 'reservaOportunidade',
            secaoAtual: '',
            label: 'Conta',
          },
          categoria: 'reservaEmergencia',
          subgrupo: '',
        })
        .catch(() => {});
    });
    expect(mostrarToastMover.mock.calls[0][0].mensagem).toBe(
      'Não foi possível mover Conta. Ele continua em Reserva Oportunidade.',
    );
  });
});

// ── Efeitos (entrada a partir do GET /mover) ───────────────────────────────────────────────

describe('entradaDosEfeitos', () => {
  it('fora do trio ou sem troca de aba → null', () => {
    expect(entradaDosEfeitos(opcoesKdif(), 'fimFia')).toBeNull();
    expect(entradaDosEfeitos(opcoesCdbRf(), 'rendaFixaFundos')).toBeNull();
    expect(entradaDosEfeitos(undefined, 'reservaEmergencia')).toBeNull();
  });

  it('lê valor, liquidez, objetivo e saldo sem título do payload', () => {
    expect(entradaDosEfeitos(opcoesCdbRf(), 'reservaEmergencia')).toMatchObject({
      origem: 'rendaFixaFundos',
      destino: 'reservaEmergencia',
      valorItem: 15000,
      objetivoPosicao: 1,
      liquidez: { noVencimento: false },
      semTitulo: false,
    });
    expect(entradaDosEfeitos(opcoesSaldoEmergencia(), 'reservaOportunidade')).toMatchObject({
      semTitulo: true,
      liquidez: null,
    });
  });
});

// ── Step4 Tesouro com override ──────────────────────────────────────────────────────────────

describe('Step4TesouroDiretoFields — título movido', () => {
  const ASSET_ID = '11111111-2222-3333-4444-555555555555';
  const montarStep4 = (tesouroDestino?: string) => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          asset: { name: 'Tesouro Prefixado 2029', bondType: 'Tesouro Prefixado' },
          price: null,
        }),
      ),
    );
    const handleInputChange = vi.fn();
    render(
      <Step4TesouroDiretoFields
        {...({
          formData: { assetId: ASSET_ID, tesouroDestino },
          errors: {},
          handleInputChange,
          onFormDataChange: vi.fn(),
        } as unknown as React.ComponentProps<typeof Step4TesouroDiretoFields>)}
      />,
    );
    return { handleInputChange };
  };

  it('com override no trio: esconde o select, mostra a frase e o destino segue a aba', async () => {
    categoriaEfetiva.value = { categoria: 'reservaEmergencia', override: true };
    const { handleInputChange } = montarStep4('renda-fixa-prefixada');
    expect(
      screen.getByText(
        'Este título está em Reserva Emergência (movido). A compra entra lá; para trocar, use Mover.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Onde este título deve aparecer *')).toBeNull();
    await waitFor(() =>
      expect(handleInputChange).toHaveBeenCalledWith('tesouroDestino', 'reserva-emergencia'),
    );
  });

  it('movido para a Renda Fixa: seção pelo tipo do título', async () => {
    categoriaEfetiva.value = { categoria: 'rendaFixaFundos', override: true };
    const { handleInputChange } = montarStep4('reserva-oportunidade');
    await waitFor(() =>
      expect(handleInputChange).toHaveBeenCalledWith('tesouroDestino', 'renda-fixa-prefixada'),
    );
    expect(screen.getByText(/Este título está em Renda Fixa \(movido\)/)).toBeInTheDocument();
  });

  it('sem override (ou chave desligada): o select continua', () => {
    categoriaEfetiva.value = { categoria: null, override: false };
    montarStep4();
    expect(screen.getByText('Onde este título deve aparecer *')).toBeInTheDocument();
  });

  it('destinoTesouroDaAba', () => {
    expect(destinoTesouroDaAba('reservaOportunidade', null)).toBe('reserva-oportunidade');
    expect(destinoTesouroDaAba('rendaFixaFundos', 'Tesouro Selic')).toBe('renda-fixa-posfixada');
    expect(destinoTesouroDaAba('rendaFixaFundos', 'Tesouro IPCA+ com Juros Semestrais')).toBe(
      'renda-fixa-hibrida',
    );
    expect(destinoTesouroDaAba('rendaFixaFundos', 'Tesouro Renda+')).toBe('renda-fixa-hibrida');
    expect(destinoTesouroDaAba('rendaFixaFundos', null)).toBeNull();
    expect(destinoTesouroDaAba('fiis', 'x')).toBeNull();
  });
});
