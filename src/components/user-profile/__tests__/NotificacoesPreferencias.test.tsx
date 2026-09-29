// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import NotificacoesPreferencias from '../NotificacoesPreferencias';

/**
 * Perfil › Notificações (PWA fase 5, fatia C): os 4 estados do protótipo + lista de aparelhos
 * (decisão 3), toggles otimistas com rollback e o cinto de que NENHUM requestPermission roda fora
 * de gesto (o pushClient é mockado inteiro — assinarPush é o único caminho até a permissão).
 */

const mocks = vi.hoisted(() => ({
  isPushSupported: vi.fn(() => true),
  isIosSemPwa: vi.fn(() => false),
  permissaoAtual: vi.fn<[], NotificationPermission | 'unsupported'>(() => 'default'),
  assinarPush: vi.fn(async () => 'ok' as const),
  cancelarAssinatura: vi.fn(async () => true),
  csrfFetch: vi.fn(),
  confirm: vi.fn(async () => true),
}));

vi.mock('@/lib/pwa/pushClient', () => ({
  isPushSupported: mocks.isPushSupported,
  isIosSemPwa: mocks.isIosSemPwa,
  permissaoAtual: mocks.permissaoAtual,
  assinarPush: mocks.assinarPush,
  cancelarAssinatura: mocks.cancelarAssinatura,
  PUSH_SUBSCRIPTIONS_URL: '/api/push/subscriptions',
}));

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mocks.csrfFetch, getCsrfToken: () => 'token' }),
}));

vi.mock('@/components/ui/sheet/useResponsiveConfirm', () => ({
  useResponsiveConfirm: () => ({
    confirm: mocks.confirm,
    confirmAndRun: vi.fn(),
    confirmSheet: null,
  }),
}));

const ENDPOINT_LOCAL = 'https://push.exemplo/este-aparelho';

const PREFS_PADRAO = {
  habilitado: true,
  vapidPublicKey: 'BChaveExemplo',
  categorias: { orcamento: true, agenda: true, comunidade: true, conta: true },
  comunidadeVisivel: true,
};

const APARELHOS_PADRAO = [
  {
    id: 'sub-1',
    rotulo: 'Chrome · celular',
    criadoEm: '2026-09-29T12:00:00Z',
    endpoint: ENDPOINT_LOCAL,
  },
  {
    id: 'sub-2',
    rotulo: 'Chrome · computador',
    criadoEm: '2026-09-20T12:00:00Z',
    endpoint: 'https://push.exemplo/outro',
  },
];

function stubApi({
  prefs = PREFS_PADRAO,
  aparelhos = APARELHOS_PADRAO,
}: {
  prefs?: typeof PREFS_PADRAO | null;
  aparelhos?: typeof APARELHOS_PADRAO;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/push/preferencias')) {
      return { ok: prefs !== null, status: prefs ? 200 : 404, json: async () => prefs } as Response;
    }
    if (url.includes('/api/push/subscriptions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ subscriptions: aparelhos }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubServiceWorker(endpoint: string | null) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => (endpoint ? { endpoint } : null),
        },
      }),
    },
  });
}

async function esperaCarregar() {
  await waitFor(() =>
    expect(document.querySelector('[data-notif-estado="carregando"]')).toBeNull(),
  );
}

beforeEach(() => {
  mocks.isPushSupported.mockReturnValue(true);
  mocks.isIosSemPwa.mockReturnValue(false);
  mocks.permissaoAtual.mockReturnValue('default');
  mocks.assinarPush.mockResolvedValue('ok');
  mocks.cancelarAssinatura.mockResolvedValue(true);
  mocks.confirm.mockResolvedValue(true);
  mocks.csrfFetch.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) } as Response);
  stubServiceWorker(null);
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('estados', () => {
  it('P1 nunca pediu: botão Ativar, categorias visíveis porém inertes, sem assinarPush na carga', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    expect(screen.getByRole('button', { name: 'Ativar neste aparelho' })).toBeInTheDocument();
    const categoria = screen.getByRole('switch', { name: /Orçamento/ });
    expect(categoria).toHaveAttribute('aria-disabled', 'true');
    expect(categoria).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/nunca mostram valores em R\$/)).toBeInTheDocument();
    // NUNCA pede permissão na carga.
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  it('P2 ativas: master ligado, categorias ativas, lista de aparelhos e botão de teste', async () => {
    mocks.permissaoAtual.mockReturnValue('granted');
    stubServiceWorker(ENDPOINT_LOCAL);
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Avisos neste aparelho/ })).toBeInTheDocument(),
    );
    expect(screen.getByRole('switch', { name: /Avisos neste aparelho/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Este aparelho')).toBeInTheDocument();
    expect(screen.getByText('Chrome · computador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar notificação de teste' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Agenda/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('P3 negada: instrução por plataforma, sem tentar assinar na carga', async () => {
    mocks.permissaoAtual.mockReturnValue('denied');
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    expect(screen.getByText('Sem permissão')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Já liberei — verificar de novo' }),
    ).toBeInTheDocument();
    // Segmento por plataforma troca o passo a passo.
    expect(screen.getByText(/Ajustes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Android · Chrome' }));
    expect(screen.getByText(/cadeado/)).toBeInTheDocument();
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  it('C3 iOS/iPadOS sem PWA: passo a passo de instalação em vez do toggle', async () => {
    mocks.isIosSemPwa.mockReturnValue(true);
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    expect(screen.getByText('Falta instalar')).toBeInTheDocument();
    expect(screen.getByText('Adicionar à Tela de Início')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar neste aparelho' })).toBeNull();
  });

  it('indisponível (flag desligada / rota fora do ar): aviso e categorias inertes', async () => {
    stubApi({ prefs: null });
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    expect(screen.getByText(/não estão disponíveis neste navegador/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Orçamento/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('gestos', () => {
  it('Ativar chama assinarPush uma vez, só depois do clique', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    expect(mocks.assinarPush).not.toHaveBeenCalled();
    stubServiceWorker(ENDPOINT_LOCAL); // o subscribe do navegador criou a assinatura
    fireEvent.click(screen.getByRole('button', { name: 'Ativar neste aparelho' }));
    await waitFor(() => expect(mocks.assinarPush).toHaveBeenCalledTimes(1));
    expect(mocks.assinarPush).toHaveBeenCalledWith('BChaveExemplo', mocks.csrfFetch);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Avisos neste aparelho/ })).toBeInTheDocument(),
    );
  });

  it("assinarPush devolvendo 'erro' cai na orientação de instalação (fallback da crítica 8)", async () => {
    mocks.assinarPush.mockResolvedValue('erro');
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar neste aparelho' }));
    await waitFor(() => expect(screen.getByText('Falta instalar')).toBeInTheDocument());
  });

  it("'Já liberei' com permissão ainda negada não assina e avisa", async () => {
    mocks.permissaoAtual.mockReturnValue('denied');
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    fireEvent.click(screen.getByRole('button', { name: 'Já liberei — verificar de novo' }));
    await waitFor(() => expect(screen.getByText(/ainda está sem permissão/)).toBeInTheDocument());
    expect(mocks.assinarPush).not.toHaveBeenCalled();
  });

  it("'Já liberei' com permissão concedida assina na hora", async () => {
    mocks.permissaoAtual.mockReturnValue('denied');
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    mocks.permissaoAtual.mockReturnValue('granted');
    fireEvent.click(screen.getByRole('button', { name: 'Já liberei — verificar de novo' }));
    await waitFor(() => expect(mocks.assinarPush).toHaveBeenCalledTimes(1));
  });
});

describe('ativas: aparelhos, categorias e teste', () => {
  beforeEach(() => {
    mocks.permissaoAtual.mockReturnValue('granted');
    stubServiceWorker(ENDPOINT_LOCAL);
  });

  it('lixeira confirma, chama DELETE por id e tira o aparelho da lista', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    const remover = await screen.findByRole('button', {
      name: 'Remover os avisos de Chrome · computador',
    });
    fireEvent.click(remover);
    await waitFor(() =>
      expect(mocks.csrfFetch).toHaveBeenCalledWith('/api/push/subscriptions/sub-2', {
        method: 'DELETE',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Chrome · computador')).toBeNull());
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it('este aparelho não tem lixeira (desliga pelo master)', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    await screen.findByText('Este aparelho');
    expect(
      screen.queryByRole('button', { name: 'Remover os avisos de Chrome · celular' }),
    ).toBeNull();
  });

  it('toggle de categoria: PATCH otimista, rollback quando falha', async () => {
    mocks.csrfFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    const categoria = await screen.findByRole('switch', { name: /Orçamento/ });
    await waitFor(() => expect(categoria).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(categoria);
    // otimista: desliga na hora…
    expect(categoria).toHaveAttribute('aria-checked', 'false');
    expect(mocks.csrfFetch).toHaveBeenCalledWith(
      '/api/push/preferencias',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ orcamento: false }) }),
    );
    // …e volta quando o PATCH falha.
    await waitFor(() => expect(categoria).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('alert')).toHaveTextContent('Não consegui salvar a preferência.');
  });

  it('Comunidade some com comunidadeVisivel=false', async () => {
    stubApi({ prefs: { ...PREFS_PADRAO, comunidadeVisivel: false } });
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    await screen.findByRole('switch', { name: /Orçamento/ });
    expect(screen.queryByRole('switch', { name: /Comunidade/ })).toBeNull();
    expect(screen.queryByText(/A Comunidade só avisa/)).toBeNull();
  });

  it('notificação de teste: POST e cooldown de 30 s', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    const botao = await screen.findByRole('button', { name: 'Enviar notificação de teste' });
    fireEvent.click(botao);
    await waitFor(() =>
      expect(mocks.csrfFetch).toHaveBeenCalledWith('/api/push/test', { method: 'POST' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enviada — aguarde 30 s para reenviar' }),
      ).toBeDisabled(),
    );
  });

  it('desligar o master confirma e cancela a assinatura deste aparelho', async () => {
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    const master = await screen.findByRole('switch', { name: /Avisos neste aparelho/ });
    fireEvent.click(master);
    await waitFor(() => expect(mocks.cancelarAssinatura).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ativar neste aparelho' })).toBeInTheDocument(),
    );
    // a linha local sai da lista junto
    const lista = screen.queryByText('Chrome · celular');
    expect(lista).toBeNull();
  });

  it('cancelar a confirmação não desliga nada', async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<NotificacoesPreferencias />);
    await esperaCarregar();
    const master = await screen.findByRole('switch', { name: /Avisos neste aparelho/ });
    fireEvent.click(master);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.cancelarAssinatura).not.toHaveBeenCalled();
    expect(
      within(document.body).getByRole('switch', { name: /Avisos neste aparelho/ }),
    ).toBeInTheDocument();
  });
});
