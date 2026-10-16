// @vitest-environment jsdom
/**
 * Bloco 1, fatia C: página Salvos. Lista as listas (ordem de criação), troca lista e classe pela
 * URL, remove com Desfazer, renomeia, apaga com confirmação, "antes n de 6", segmento Alertas só
 * com o recurso, estados vazio/erro/consultor, varredura do DOM e notFound sem a flag.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';

const h = vi.hoisted(() => ({
  cfg: { data: undefined as unknown },
  auth: { actingClient: null as null | { id: string; name: string } },
  params: new URLSearchParams(),
  replace: vi.fn(),
  celular: false,
  flag: true,
  listas: {} as Record<string, unknown>,
  linhas: {} as Record<string, unknown>,
  linhasParams: [] as unknown[],
  alertas: { data: undefined as unknown },
  remover: vi.fn(),
  adicionar: vi.fn(),
  apagar: vi.fn(),
  renomear: vi.fn(),
  toasts: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => h.params,
  usePathname: () => '/analise-ativos/salvos',
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('@/hooks/useMediaQuery', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useMediaQuery')>()),
  useIsBelowLg: () => h.celular,
}));
vi.mock('@/hooks/useAnaliseAtivos', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useAnaliseAtivos')>()),
  useAnaliseAtivosConfig: () => h.cfg,
}));
vi.mock('@/hooks/useAnaliseAtivosSalvos', () => ({
  useListas: () => h.listas,
  useLinhasLista: (_id: string | null, p: unknown) => {
    h.linhasParams.push(p);
    return h.linhas;
  },
  useAlertas: () => h.alertas,
  useRemoverItem: () => ({ mutate: h.remover }),
  useAdicionarItem: () => ({ mutate: h.adicionar }),
  useApagarLista: () => ({ mutate: h.apagar, isPending: false }),
  useCriarLista: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRenomearLista: () => ({ mutateAsync: h.renomear, isPending: false }),
}));
vi.mock('@/components/analiseAtivos/quadro/CelulaNaCarteira', async (orig) => ({
  ...(await orig<typeof import('@/components/analiseAtivos/quadro/CelulaNaCarteira')>()),
  useNaCarteira: () => ({ fonte: null, info: () => ({ estado: 'fora' }), conjunto: new Set() }),
}));
vi.mock('@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo', () => ({
  mostrarToastSalvo: (d: Record<string, unknown>) => {
    h.toasts.push(d);
    return h.toasts.length;
  },
}));
vi.mock('@/components/analiseAtivos/salvos/compartilhados/ListaComparacoesSalvas', () => ({
  default: (p: { classe?: string }) => <div data-testid="comparacoes" data-classe={p.classe} />,
}));
vi.mock('@/components/analiseAtivos/salvos/AbaAlertas', () => ({
  default: (p: { classe: string }) => <div data-testid="aba-alertas" data-classe={p.classe} />,
}));
vi.mock('@/lib/analiseAtivosConfig', async (orig) => ({
  ...(await orig<typeof import('@/lib/analiseAtivosConfig')>()),
  analiseAtivosSalvosHabilitado: () => h.flag,
}));

import PaginaSalvos, {
  escreverEstadoSalvos,
  lerEstadoSalvos,
} from '@/components/analiseAtivos/salvos/PaginaSalvos';
import SalvosPage from '@/app/(admin)/(others-pages)/analise-ativos/salvos/page';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { comTipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import { LINHA_ITUB4, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import type { LinhaLista, ResumoLista } from '@/types/analiseAtivosSalvos';

const ALERTAS_PADRAO = { resultado: true, provento: true, criterios: false };
const DIVIDENDOS: ResumoLista = {
  id: 'l1',
  nome: 'Dividendos',
  contagem: { acao: 2, fii: 1 },
  alertas: ALERTAS_PADRAO,
  criadaEm: '2026-10-02T12:00:00Z',
};
const ESTUDAR: ResumoLista = {
  id: 'l2',
  nome: 'Para estudar',
  contagem: { acao: 0, fii: 2 },
  alertas: { resultado: false, provento: false, criterios: false },
  criadaEm: '2026-10-10T12:00:00Z',
};

const linhasBase = [LINHA_WEGE3, LINHA_ITUB4].map((l) => comTipoFiiExibido(paraLinhaQuadroApi(l)));
const LINHAS: LinhaLista[] = [
  { ...linhasBase[0], adicionadoEm: '2026-10-03T12:00:00Z' },
  {
    ...linhasBase[1],
    adicionadoEm: '2026-10-04T12:00:00Z',
    criteriosAnterior: { atendidos: 5, aplicaveis: 6, mudouEm: '2026-10-16T12:00:00Z' },
  },
];

function recursos(r: Partial<Record<'comparador' | 'salvos' | 'alertas', boolean>> = {}) {
  return {
    data: {
      habilitada: true,
      recursos: {
        raioX: false,
        cenarios: false,
        comparador: false,
        salvos: true,
        alertas: false,
        pdfComparador: false,
        ...r,
      },
    },
  };
}

function okListas(listas: ResumoLista[]) {
  return {
    data: { listas, limites: LIMITES_SALVOS, podeSalvar: true, motivoSemSalvar: null },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function okLinhas(lista: ResumoLista, classe: 'acao' | 'fii', linhas: LinhaLista[]) {
  return {
    data: {
      lista,
      classe,
      janela: 5,
      contagem: lista.contagem,
      linhas,
      foraDoQuadro: [],
      definicoes: [],
    },
    isPending: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

function montar() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PaginaSalvos />
    </QueryClientProvider>,
  );
}

/** Último replace da URL, como URLSearchParams. */
function ultimaUrl(): URLSearchParams {
  const arg = h.replace.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(arg.split('?')[1] ?? '');
}

beforeEach(() => {
  h.cfg = recursos();
  h.auth.actingClient = null;
  h.params = new URLSearchParams();
  h.celular = false;
  h.flag = true;
  h.listas = okListas([DIVIDENDOS, ESTUDAR]);
  h.linhas = okLinhas(DIVIDENDOS, 'acao', LINHAS);
  h.alertas = { data: undefined };
  h.linhasParams = [];
  h.toasts = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('estado na URL', () => {
  it('lê e escreve com padrões fora da URL', () => {
    const e = lerEstadoSalvos(new URLSearchParams('lista=l2&classe=fii&janela=10&modo=detalhado'));
    expect(e).toMatchObject({ lista: 'l2', classe: 'fii', janela: 10, modo: 'detalhado' });
    expect(e.ordem).toBe('ticker');
    expect(e.aba).toBe('listas');
    expect(escreverEstadoSalvos(e).toString()).toBe('lista=l2&classe=fii&modo=detalhado&janela=10');
    const lixo = lerEstadoSalvos(new URLSearchParams('janela=7&classe=x&ordem=zzz&lista=a b'));
    expect(lixo).toMatchObject({ lista: null, classe: 'acao', janela: 5, ordem: 'ticker' });
    expect(escreverEstadoSalvos(lixo).toString()).toBe('');
  });
});

describe('PaginaSalvos', () => {
  it('rail em ordem de criação, cabeçalho e abas com contador; colunas do Quadro + Adicionado em', () => {
    const { container } = montar();
    const rail = screen.getByRole('list', { name: 'Suas listas' });
    const chips = within(rail).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Dividendos3', 'Para estudar2', 'Nova lista']);
    expect(chips[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Dividendos' })).toBeInTheDocument();
    expect(screen.getByText('3 ativos · criada em 02/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FIIs 1' })).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('Ações da lista Dividendos')).toBeInTheDocument();
    expect(within(tabela).getByRole('columnheader', { name: /Adicionado em/ })).toBeInTheDocument();
    expect(within(tabela).getByText('03/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover WEGE3 de Dividendos' })).toBeInTheDocument();
    // "antes n de 6" só onde a contagem mudou depois de entrar na lista
    expect(screen.getAllByText('antes 5 de 6 · 16/10')).toHaveLength(1);
    // sem recursos.alertas: nada de segmento nem "Alertas da lista"
    expect(screen.queryByRole('group', { name: 'Ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alertas da lista' })).toBeNull();
    expect(screen.queryByTestId('comparacoes')).toBeNull();
    esperarDomLimpo(container);
  });

  it('pede as linhas com o zod do Quadro (classe, janela, ordem, modo)', () => {
    h.params = new URLSearchParams('lista=l1&classe=acao&janela=10&ordem=roe&dir=desc');
    montar();
    expect(h.linhasParams.at(-1)).toEqual({
      classe: 'acao',
      janela: 10,
      ordem: 'roe',
      dir: 'desc',
      modo: 'resumo',
    });
    // "antes n de 6" só na janela de 5 anos (a do marco)
    expect(screen.queryByText(/antes 5 de 6/)).toBeNull();
  });

  it('troca de lista e de classe pela URL (classe volta para A–Z)', () => {
    h.params = new URLSearchParams('lista=l1&ordem=roe&dir=desc');
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Para estudar/ }));
    expect(ultimaUrl().get('lista')).toBe('l2');
    fireEvent.click(screen.getByRole('button', { name: 'FIIs 1' }));
    const u = ultimaUrl();
    expect(u.get('classe')).toBe('fii');
    expect(u.get('ordem')).toBeNull();
  });

  it('remover: some na hora, aviso com Desfazer que recoloca (POST do item)', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Remover WEGE3 de Dividendos' }));
    expect(h.remover).toHaveBeenCalledWith(
      { listaId: 'l1', ticker: 'WEGE3' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.queryByRole('button', { name: 'Remover WEGE3 de Dividendos' })).toBeNull();
    const opts = h.remover.mock.calls[0][1] as { onSuccess: () => void };
    React.act(() => opts.onSuccess());
    const toast = h.toasts.at(-1)!;
    expect(toast).toMatchObject({ tipo: 'removido', ticker: 'WEGE3', lista: 'Dividendos' });
    React.act(() => (toast.desfazer as () => void)());
    expect(h.adicionar).toHaveBeenCalledWith({ listaId: 'l1', ticker: 'WEGE3' }, expect.anything());
    expect(screen.getByRole('button', { name: 'Remover WEGE3 de Dividendos' })).toBeInTheDocument();
  });

  it('remover com erro: a linha volta e o aviso oferece Tentar de novo', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Remover ITUB4 de Dividendos' }));
    const opts = h.remover.mock.calls[0][1] as { onError: () => void };
    React.act(() => opts.onError());
    expect(screen.getByRole('button', { name: 'Remover ITUB4 de Dividendos' })).toBeInTheDocument();
    expect(h.toasts.at(-1)).toMatchObject({
      tipo: 'erro',
      mensagem: 'Não foi possível remover ITUB4. Tente de novo.',
    });
  });

  it('celular: cartões com o mesmo "×" e "adicionado em"', () => {
    h.celular = true;
    montar();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover WEGE3 de Dividendos' })).toBeInTheDocument();
    expect(screen.getByText('adicionado em 03/10/2026')).toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: /Remover|Renomear|Apagar/ })) {
      expect(b.className).toMatch(/h-11|min-h-11/);
    }
  });

  it('renomear abre o modal com o nome e envia o PATCH', async () => {
    h.renomear.mockResolvedValue({ ...DIVIDENDOS, nome: 'Renda' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear lista' }));
    const dlg = screen.getByRole('dialog', { name: 'Renomear lista' });
    const campo = within(dlg).getByLabelText('Nome da lista');
    expect(campo).toHaveValue('Dividendos');
    fireEvent.change(campo, { target: { value: 'Renda' } });
    await React.act(async () => {
      fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar nome' }));
    });
    expect(h.renomear).toHaveBeenCalledWith({ id: 'l1', nome: 'Renda' });
  });

  it('apagar pede confirmação com o texto do que sai e do que continua', () => {
    h.params = new URLSearchParams('lista=l1');
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar lista' }));
    const dlg = screen.getByRole('dialog', { name: 'Apagar a lista "Dividendos"?' });
    expect(dlg).toHaveTextContent('Os 3 ativos saem desta lista.');
    expect(dlg).toHaveTextContent('continuam nas outras listas e na sua Carteira');
    expect(h.apagar).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Apagar lista' }));
    const opts = h.apagar.mock.calls[0][1] as { onSuccess: () => void };
    expect(h.apagar.mock.calls[0][0]).toEqual({ id: 'l1' });
    React.act(() => opts.onSuccess());
    expect(h.toasts.at(-1)).toMatchObject({ mensagem: 'Lista Dividendos apagada.' });
    expect(ultimaUrl().get('lista')).toBeNull();
  });

  it('com recursos.alertas: segmento Listas | Alertas, sino no chip e "Alertas da lista"', () => {
    h.cfg = recursos({ alertas: true });
    h.alertas = { data: { avisos: [], naoLidos: 3, podeSalvar: true, motivoSemSalvar: null } };
    montar();
    const seg = screen.getByRole('group', { name: 'Ver' });
    expect(within(seg).getByRole('button', { name: /Listas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(seg).getByLabelText('3 novos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alertas da lista' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dividendos.*alertas ligados/ })).toBeInTheDocument();
    expect(
      screen.getByText(
        '3 ativos · criada em 02/10/2026 · alertas: resultado entregue, provento anunciado',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(seg).getByRole('button', { name: /Alertas/ }));
    expect(ultimaUrl().get('aba')).toBe('alertas');
  });

  it('aba=alertas renderiza a AbaAlertas só com o recurso', () => {
    h.params = new URLSearchParams('aba=alertas&classe=fii');
    h.cfg = recursos({ alertas: true });
    const a = montar();
    expect(screen.getByTestId('aba-alertas')).toHaveAttribute('data-classe', 'fii');
    expect(screen.queryByRole('table')).toBeNull();
    a.unmount();
    h.cfg = recursos({ alertas: false });
    h.linhas = okLinhas(DIVIDENDOS, 'fii', []);
    montar();
    expect(screen.queryByTestId('aba-alertas')).toBeNull();
  });

  it('comparações salvas da classe só com recursos.comparador', () => {
    h.cfg = recursos({ comparador: true });
    h.params = new URLSearchParams('classe=fii');
    h.linhas = okLinhas(DIVIDENDOS, 'fii', []);
    montar();
    expect(screen.getByTestId('comparacoes')).toHaveAttribute('data-classe', 'fii');
  });

  it('sem listas: estado vazio com Criar lista e Ir para o Quadro', () => {
    h.listas = okListas([]);
    const { container } = montar();
    expect(screen.getByRole('heading', { name: 'Você ainda não tem listas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar lista' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o Quadro' })).toHaveAttribute(
      'href',
      '/analise-ativos',
    );
    esperarDomLimpo(container);
  });

  it('lista sem ativos da classe: atalho para a outra aba', () => {
    h.params = new URLSearchParams('lista=l2');
    h.linhas = okLinhas(ESTUDAR, 'acao', []);
    montar();
    expect(
      screen.getByRole('heading', { name: 'Nenhuma ação em Para estudar' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Esta lista tem 2 FIIs.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver FIIs' }));
    expect(ultimaUrl().get('classe')).toBe('fii');
  });

  it('lista vazia', () => {
    const vazia = { ...ESTUDAR, contagem: { acao: 0, fii: 0 } };
    h.listas = okListas([vazia]);
    h.linhas = okLinhas(vazia, 'acao', []);
    montar();
    expect(screen.getByRole('heading', { name: 'A lista está vazia' })).toBeInTheDocument();
    expect(screen.getByText(/escolha "Para estudar"/)).toBeInTheDocument();
  });

  it('erro ao carregar as listas: Tentar de novo', () => {
    const refetch = vi.fn();
    h.listas = { data: undefined, isPending: false, isError: true, refetch };
    montar();
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar suas listas');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('carregando: esqueleto com aria-busy', () => {
    h.listas = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    const { container } = montar();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('modo consultor: aviso das listas pessoais e nenhuma lista', () => {
    h.auth.actingClient = { id: 'c1', name: 'Ana' };
    const { container } = montar();
    expect(
      screen.getByRole('heading', { name: 'Salvos não aparece no modo consultor' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o Quadro' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suas listas' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    esperarDomLimpo(container);
  });
});

describe('page.tsx', () => {
  it('sem a flag: notFound()', () => {
    h.flag = false;
    expect(() => SalvosPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('com a flag: casca variante salvos', () => {
    h.flag = true;
    const el = SalvosPage() as React.ReactElement<{ variante: string }>;
    expect(el.props.variante).toBe('salvos');
  });
});
