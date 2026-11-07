// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { ASSINATURA_ME_DESLIGADA, type AssinaturaMe } from '@/types/assinatura';
import { temAcesso, type Plano } from '@/lib/planos';

const mocks = vi.hoisted(() => ({
  plano: {
    habilitado: false,
    carregando: false,
    assinatura: null as unknown,
  },
  acting: null as null | { id: string; name: string; email: string },
  search: new URLSearchParams(),
}));

vi.mock('@/hooks/usePlano', () => ({
  PLANO_QUERY_KEY: ['assinaturas', 'me'],
  buscarAssinaturaMe: vi.fn(),
  usePlano: () => {
    const me = (mocks.plano.assinatura ?? ASSINATURA_ME_DESLIGADA) as AssinaturaMe;
    const habilitado = mocks.plano.habilitado;
    const plano: Plano = habilitado ? me.plano : 'adv';
    return {
      plano,
      habilitado,
      assinatura: me,
      carregando: mocks.plano.carregando,
      libera: (need: Plano) => !mocks.plano.carregando && (!habilitado || temAcesso(plano, need)),
    };
  },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ actingClient: mocks.acting, user: { email: 'ana@exemplo.com' } }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.search }));

import GatePlano from '../GatePlano';
import CadeadoPlano from '../CadeadoPlano';
import PlanosPage from '../PlanosPage';
import { ehErroPlano, ehErroLimitePlano, respostaEhErroPlano } from '../ehErroPlano';
import { resumoDoValor } from '../ConfirmarAssinaturaModal';
import MinhaAssinatura, { estadoDaAssinatura } from '@/components/user-profile/MinhaAssinatura';

const ANTES = new Date('2026-11-20T12:00:00-03:00');
const DEPOIS = new Date('2026-12-06T12:00:00-03:00');

const me = (extra: Partial<AssinaturaMe>): AssinaturaMe => ({
  ...ASSINATURA_ME_DESLIGADA,
  podeAssinar: true,
  habilitado: true,
  ...extra,
});
const ME_BASIC = me({ plano: 'basic', origem: 'basic' });
const ME_PRO = me({
  plano: 'pro',
  origem: 'assinatura',
  status: 'active',
  planoAssinatura: 'pro',
  intervalo: 'ano',
  currentPeriodEnd: '2027-11-07T15:00:00Z',
  podeDesistirAte: '2026-11-14T15:00:00Z',
});

function ligar(assinatura: AssinaturaMe) {
  mocks.plano.habilitado = true;
  mocks.plano.assinatura = assinatura;
}

const comQuery = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  mocks.plano.habilitado = false;
  mocks.plano.carregando = false;
  mocks.plano.assinatura = null;
  mocks.acting = null;
  mocks.search = new URLSearchParams();
});

describe('GatePlano', () => {
  it('chave desligada: sempre os filhos', () => {
    render(
      <GatePlano need="adv">
        <p>conteúdo</p>
      </GatePlano>,
    );
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('carregando: segura os filhos (nenhum hook de dentro dispara)', () => {
    mocks.plano.carregando = true;
    ligar(ME_BASIC);
    render(
      <GatePlano need="pro" carregando={<p>esperando</p>}>
        <p>conteúdo</p>
      </GatePlano>,
    );
    expect(screen.getByText('esperando')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).toBeNull();
  });

  it('sem o plano: cadeado no lugar e os filhos nem montam', () => {
    ligar(ME_BASIC);
    const Filho = vi.fn(() => <p>conteúdo</p>);
    const { container } = render(
      <GatePlano need="pro" variante="bloco">
        <Filho />
      </GatePlano>,
    );
    expect(Filho).not.toHaveBeenCalled();
    expect(container.querySelector('[data-mf-cadeado="bloco"][data-need="pro"]')).not.toBeNull();
  });

  it('com o plano: os filhos', () => {
    ligar(ME_PRO);
    render(
      <GatePlano need="pro">
        <p>conteúdo</p>
      </GatePlano>,
    );
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});

describe('CadeadoPlano', () => {
  it('venda com a oferta vigente: título, 3 itens, oferta e Ver planos → /planos?need=', () => {
    ligar(ME_BASIC);
    const { container } = render(<CadeadoPlano need="pro" agora={ANTES} />);
    expect(screen.getByRole('heading', { name: 'Disponível no Pro' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-mf-cadeado-cartao="venda"] li')).toHaveLength(3);
    expect(container.querySelector('[data-mf-cadeado-oferta]')!.textContent).toBe(
      'Black Friday até 05/12: anual 20% abaixo de 12 mensalidadesR$ 479,04 no primeiro ano, equivale a R$ 39,92 por mês.',
    );
    expect(screen.getByRole('link', { name: 'Ver planos' }).getAttribute('href')).toBe(
      '/planos?need=pro',
    );
    // A prévia é fictícia, escondida do leitor de tela e sem foco.
    const previa = container.querySelector('[aria-hidden="true"]')!;
    expect(previa.hasAttribute('inert')).toBe(true);
  });

  it('depois de 05/12 (SP): sem a faixa da oferta', () => {
    ligar(ME_BASIC);
    const { container } = render(<CadeadoPlano need="adv" agora={DEPOIS} />);
    expect(container.querySelector('[data-mf-cadeado-oferta]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Disponível no Advanced' })).toBeInTheDocument();
  });

  it('consultor agindo pelo cliente: texto próprio, sem CTA', () => {
    ligar(ME_BASIC);
    mocks.acting = { id: 'c1', name: 'Marina Costa', email: 'm@x.com' };
    render(<CadeadoPlano need="pro" recurso="A Análise de Ativos" agora={ANTES} />);
    expect(
      screen.getByRole('heading', { name: 'Este recurso não está no plano do cliente nem no seu' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Só Marina Costa pode mudar o plano dele/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('past_due com assinatura que cobriria o recurso: Atualizar pagamento', () => {
    ligar(me({ plano: 'basic', origem: 'basic', status: 'past_due', planoAssinatura: 'adv' }));
    render(<CadeadoPlano need="pro" agora={ANTES} />);
    expect(screen.getByRole('heading', { name: 'Pagamento pendente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar pagamento' })).toBeInTheDocument();
  });
});

describe('ehErroPlano', () => {
  it('reconhece o 403 de plano e o de limite', async () => {
    const corpo = { error: 'x', codigo: 'plano_insuficiente', need: 'pro', plano: 'basic' };
    expect(ehErroPlano(corpo)).toBe(true);
    expect(ehErroPlano({ ...corpo, need: 'basic' })).toBe(false);
    expect(ehErroPlano(null)).toBe(false);
    expect(
      ehErroLimitePlano({ codigo: 'limite_plano', plano: 'basic', limite: 1, recurso: 'conexoes' }),
    ).toBe(true);
    const res = new Response(JSON.stringify(corpo), { status: 403 });
    expect(await respostaEhErroPlano(res)).toEqual(corpo);
    expect(await res.json()).toEqual(corpo); // o corpo original continua legível
    expect(await respostaEhErroPlano(new Response('{}', { status: 500 }))).toBeNull();
  });
});

describe('resumoDoValor (modal de aceite)', () => {
  it('mensal nunca tem desconto; anual com a oferta mostra o cupom do 1º ano', () => {
    expect(resumoDoValor('pro', 'mes', ANTES)).toMatchObject({
      linhas: [['Pro mensal', 'R$ 49,90']],
      total: 'R$ 49,90',
    });
    const anual = resumoDoValor('adv', 'ano', ANTES);
    expect(anual.linhas).toEqual([
      ['Advanced anual', 'R$ 1.714,80'],
      ['Desconto Black Friday (30%, só no 1º ano)', '−R$ 516,00'],
    ]);
    expect(anual.total).toBe('R$ 1.198,80');
    expect(anual.renovacao).toContain('por R$ 1.714,80 (preço normal vigente)');
    expect(resumoDoValor('pro', 'ano', DEPOIS).total).toBe('R$ 598,80');
  });
});

describe('PlanosPage', () => {
  it('3 cartões, Pro recomendado, anual pré-selecionado na oferta e sem "de/por" riscado', () => {
    ligar(ME_BASIC);
    const { container } = render(<PlanosPage agora={ANTES} />);
    expect(container.querySelectorAll('[data-mf-plano]')).toHaveLength(3);
    expect(container.querySelector('[data-mf-plano="pro"]')!.textContent).toContain('Recomendado');
    expect(container.querySelector('[data-mf-plano="basic"]')!.textContent).toContain('Seu plano');
    expect(screen.getByRole('button', { name: /Anual/ })).toHaveAttribute('aria-pressed', 'true');
    const pro = container.querySelector('[data-mf-plano="pro"]')!.textContent!;
    expect(pro).toContain('R$ 479,04');
    expect(pro).toContain('12 mensalidades: R$ 598,80 · você paga 20% a menos no 1º ano');
    expect(container.querySelector('s, del, .line-through')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mensal' }));
    expect(container.querySelector('[data-mf-plano="pro"]')!.textContent).toContain('R$ 49,90');
  });

  it('Assinar abre o modal; o botão só libera com o aceite', () => {
    ligar(ME_BASIC);
    comQuery(<PlanosPage agora={ANTES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assinar o Pro' }));
    const ir = screen.getByRole('button', { name: 'Ir para o pagamento' });
    expect(ir).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(ir).not.toBeDisabled();
  });

  it('?checkout=cancelado mostra "Nada foi cobrado"; consultor não assina', () => {
    ligar(ME_BASIC);
    mocks.search = new URLSearchParams('checkout=cancelado');
    mocks.acting = { id: 'c1', name: 'Marina', email: 'm@x.com' };
    render(<PlanosPage agora={DEPOIS} />);
    expect(screen.getByText(/Nada foi cobrado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar o Pro' })).toBeDisabled();
    // Sem a oferta: sem faixa e Mensal pré-selecionado.
    expect(document.querySelector('[data-mf-faixa-oferta]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mensal' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('MinhaAssinatura', () => {
  it('chave desligada: não aparece', () => {
    const { container } = comQuery(<MinhaAssinatura />);
    expect(container.innerHTML).toBe('');
  });

  it('estados a partir do /me', () => {
    expect(estadoDaAssinatura(ME_PRO, false)).toBe('ativa');
    expect(estadoDaAssinatura({ ...ME_PRO, cancelAtPeriodEnd: true }, false)).toBe('cancelada');
    expect(estadoDaAssinatura({ ...ME_PRO, status: 'past_due' }, false)).toBe('falha');
    expect(estadoDaAssinatura(me({ plano: 'adv', origem: 'legado' }), false)).toBe('cortesia');
    expect(estadoDaAssinatura(me({ plano: 'adv', origem: 'lancamento' }), false)).toBe(
      'lancamento',
    );
    expect(estadoDaAssinatura(ME_BASIC, false)).toBe('basic');
    expect(estadoDaAssinatura(ME_PRO, true)).toBe('consultor');
  });

  it('ativa dentro dos 7 dias: Desistir com confirmação e POST do arrependimento', async () => {
    ligar(ME_PRO);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    comQuery(<MinhaAssinatura agora={new Date('2026-11-10T12:00:00Z')} />);
    expect(screen.getByText('Próxima renovação')).toBeInTheDocument();
    expect(screen.getByText('R$ 598,80 (preço normal)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desistir da compra (até 14/11)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desistência' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/assinaturas/arrependimento',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    vi.unstubAllGlobals();
  });

  it('fora dos 7 dias ou com pedido aberto: sem o botão; o pedido mostra o protocolo', () => {
    ligar(ME_PRO);
    const { unmount } = comQuery(<MinhaAssinatura agora={new Date('2026-11-20T12:00:00Z')} />);
    expect(screen.queryByRole('button', { name: /Desistir da compra/ })).toBeNull();
    unmount();
    // Contrato do /me: com pedido desta assinatura, o servidor zera podeDesistirAte.
    ligar({
      ...ME_PRO,
      podeDesistirAte: null,
      pedidoArrependimento: {
        protocolo: 'ped_123',
        status: 'aberto',
        criadoEm: '2026-11-09T15:00:00Z',
        atendidoEm: null,
      },
    });
    comQuery(<MinhaAssinatura agora={new Date('2026-11-10T12:00:00Z')} />);
    expect(screen.queryByRole('button', { name: /Desistir da compra/ })).toBeNull();
    expect(
      screen.getByText(/Pedido de desistência recebido em 09\/11, protocolo ped_123/),
    ).toBeInTheDocument();
  });

  it('assinatura nova depois de uma desistência anterior: o botão Desistir volta', () => {
    // /me de uma compra nova: podeDesistirAte preenchido e nenhum pedido desta assinatura.
    ligar({ ...ME_PRO, pedidoArrependimento: null });
    comQuery(<MinhaAssinatura agora={new Date('2026-11-10T12:00:00Z')} />);
    expect(
      screen.getByRole('button', { name: 'Desistir da compra (até 14/11)' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Desistência concluída/)).toBeNull();
  });

  it('basic: Ver planos e nada de Portal; consultor: só leitura', () => {
    ligar(ME_BASIC);
    const { unmount } = comQuery(<MinhaAssinatura />);
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/planos');
    expect(screen.queryByRole('button', { name: /Gerenciar/ })).toBeNull();
    unmount();
    ligar(ME_PRO);
    mocks.acting = { id: 'c1', name: 'Marina Costa', email: 'm@x.com' };
    comQuery(<MinhaAssinatura />);
    expect(screen.getByText(/Você está vendo a conta de/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mudar de plano' })).toBeNull();
  });
});
