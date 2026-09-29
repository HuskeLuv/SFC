// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PushInviteSheet, {
  PUSH_INVITE_ADIADO_KEY,
  conviteAdiado,
  deveConvidarParaPush,
} from '../PushInviteSheet';

/**
 * Convite C1 pós-lembrete (PWA fase 5, fatia C): elegibilidade sem pedir permissão, "Agora não"
 * silencia 14 dias por aparelho, "Ativar avisos" é o ÚNICO caminho até assinarPush, e iOS sem PWA
 * (ou 'erro' do assinarPush) mostra o passo a passo de instalação.
 */

const mocks = vi.hoisted(() => ({
  isPushSupported: vi.fn(() => true),
  isIosSemPwa: vi.fn(() => false),
  permissaoAtual: vi.fn<[], NotificationPermission | 'unsupported'>(() => 'default'),
  assinarPush: vi.fn(async () => 'ok' as const),
  csrfFetch: vi.fn(),
}));

vi.mock('@/lib/pwa/pushClient', () => ({
  isPushSupported: mocks.isPushSupported,
  isIosSemPwa: mocks.isIosSemPwa,
  permissaoAtual: mocks.permissaoAtual,
  assinarPush: mocks.assinarPush,
  cancelarAssinatura: vi.fn(),
  PUSH_SUBSCRIPTIONS_URL: '/api/push/subscriptions',
}));

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mocks.csrfFetch, getCsrfToken: () => 'token' }),
}));

function stubPrefs(habilitado = true, vapidPublicKey: string | null = 'BChave') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ habilitado, vapidPublicKey }),
    })) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.isPushSupported.mockReturnValue(true);
  mocks.isIosSemPwa.mockReturnValue(false);
  mocks.permissaoAtual.mockReturnValue('default');
  mocks.assinarPush.mockResolvedValue('ok');
  stubPrefs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('deveConvidarParaPush', () => {
  it('true com permissão default e push suportado', () => {
    expect(deveConvidarParaPush()).toBe(true);
  });

  it('false com adiamento recente (14 dias)', () => {
    window.localStorage.setItem(PUSH_INVITE_ADIADO_KEY, String(Date.now()));
    expect(conviteAdiado()).toBe(true);
    expect(deveConvidarParaPush()).toBe(false);
  });

  it('adiamento vencido (>14 dias) volta a convidar', () => {
    window.localStorage.setItem(
      PUSH_INVITE_ADIADO_KEY,
      String(Date.now() - 15 * 24 * 60 * 60 * 1000),
    );
    expect(deveConvidarParaPush()).toBe(true);
  });

  it('false com permissão já decidida (granted/denied)', () => {
    mocks.permissaoAtual.mockReturnValue('granted');
    expect(deveConvidarParaPush()).toBe(false);
    mocks.permissaoAtual.mockReturnValue('denied');
    expect(deveConvidarParaPush()).toBe(false);
  });

  it('false sem suporte a push; true em iOS sem PWA (ganha o passo a passo)', () => {
    mocks.isPushSupported.mockReturnValue(false);
    expect(deveConvidarParaPush()).toBe(false);
    mocks.isIosSemPwa.mockReturnValue(true);
    expect(deveConvidarParaPush()).toBe(true);
  });
});

describe('PushInviteSheet', () => {
  it('mostra a prévia sem R$ e não chama assinarPush na abertura', () => {
    render(<PushInviteSheet aberto onClose={() => {}} />);
    expect(screen.getByText('Receber lembretes no celular?')).toBeInTheDocument();
    expect(screen.getByText('Lembrete: IPTU parcela 9')).toBeInTheDocument();
    expect(screen.getByText('Toque para ver os detalhes na agenda.')).toBeInTheDocument();
    // "Agora não" vem primeiro no DOM.
    const acoes = document.querySelector('[data-push-invite-acoes]');
    expect(acoes?.firstElementChild).toHaveTextContent('Agora não');
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  it("'Agora não' grava o adiamento de 14 dias e fecha", () => {
    const onClose = vi.fn();
    render(<PushInviteSheet aberto onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(conviteAdiado()).toBe(true);
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  /** A chave chega na ABERTURA (WebKit: rede entre o gesto e o requestPermission mata a
   *  ativação transitória); o botão fica desabilitado até ela chegar. */
  async function esperaBotaoAtivar() {
    const botao = await screen.findByRole('button', { name: 'Ativar avisos' });
    await waitFor(() => expect(botao).toBeEnabled());
    return botao;
  }

  it("'Ativar avisos' chama assinarPush no gesto (chave já pré-carregada) e mostra o sucesso", async () => {
    render(<PushInviteSheet aberto onClose={() => {}} />);
    // A busca da chave acontece na abertura, nunca dentro do clique.
    await waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(await esperaBotaoAtivar());
    await waitFor(() => expect(mocks.assinarPush).toHaveBeenCalledTimes(1));
    expect(mocks.assinarPush).toHaveBeenCalledWith('BChave', mocks.csrfFetch);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Avisos ligados' })).toBeInTheDocument(),
    );
  });

  it('permissão recusada no diálogo do sistema mostra o caminho do Perfil', async () => {
    mocks.assinarPush.mockResolvedValue('negado');
    render(<PushInviteSheet aberto onClose={() => {}} />);
    fireEvent.click(await esperaBotaoAtivar());
    await waitFor(() => expect(screen.getByText(/ficou sem permissão/)).toBeInTheDocument());
  });

  it("'erro' do assinarPush cai no passo a passo de instalação (fallback)", async () => {
    mocks.assinarPush.mockResolvedValue('erro');
    render(<PushInviteSheet aberto onClose={() => {}} />);
    fireEvent.click(await esperaBotaoAtivar());
    await waitFor(() => expect(screen.getByText('Adicionar à Tela de Início')).toBeInTheDocument());
  });

  it('iOS sem PWA abre direto no passo a passo, sem pedir permissão', () => {
    mocks.isIosSemPwa.mockReturnValue(true);
    render(<PushInviteSheet aberto onClose={() => {}} />);
    expect(screen.getByText('Instale o app para receber avisos')).toBeInTheDocument();
    expect(screen.getByText('Adicionar à Tela de Início')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar avisos' })).toBeNull();
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  it("fechar o passo a passo ('Entendi') também silencia por 14 dias", () => {
    mocks.isIosSemPwa.mockReturnValue(true);
    const onClose = vi.fn();
    render(<PushInviteSheet aberto onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(conviteAdiado()).toBe(true);
  });

  it('chave VAPID indisponível: não pede permissão e cai na orientação', async () => {
    stubPrefs(false, null);
    render(<PushInviteSheet aberto onClose={() => {}} />);
    fireEvent.click(await esperaBotaoAtivar());
    await waitFor(() =>
      expect(screen.getByText('Instale o app para receber avisos')).toBeInTheDocument(),
    );
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });
});
