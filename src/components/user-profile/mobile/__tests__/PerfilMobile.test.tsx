// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

import PerfilMobile from '../PerfilMobile';
import PrivacyControls from '../../PrivacyControls';
import TwoFactorAuth from '../../TwoFactorAuth';

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const USER = { id: 'u1', name: 'Ana Ribeiro', email: 'ana@exemplo.com' };

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = url.includes('/api/auth/totp/status')
        ? { enabled: false }
        : url.includes('/api/agenda/preferencias')
          ? { lembretes: true, icalToken: null }
          : {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }),
  );
}

const dialog = () => screen.getByRole('dialog');

describe('PerfilMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMatchMedia(true);
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error — limpa o stub do jsdom
    delete window.matchMedia;
  });

  it('mostra nome, e-mail e as 7 linhas de ajuste, com Excluir por último', () => {
    render(<PerfilMobile user={USER} />);
    expect(screen.getByText('Ana Ribeiro')).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    const itens = Array.from(document.querySelectorAll('[data-perfil-item]')).map((el) =>
      el.getAttribute('data-perfil-item'),
    );
    expect(itens).toEqual(['nome', 'senha', '2fa', 'sessoes', 'agenda', 'dados', 'excluir']);
  });

  it.each([
    ['nome', 'Informações pessoais', 'Nome completo'],
    ['senha', 'Alterar senha', 'Nova senha (mín. 8 caracteres)'],
    ['dados', 'Baixar meus dados', 'Baixar JSON'],
    ['excluir', 'Excluir minha conta', 'Senha atual (pra confirmar)'],
  ])('linha %s abre o sheet "%s" com o formulário de hoje', (id, titulo, texto) => {
    render(<PerfilMobile user={USER} />);
    fireEvent.click(document.querySelector(`[data-perfil-item="${id}"]`)!);
    expect(within(dialog()).getByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(within(dialog()).getByText(texto)).toBeInTheDocument();
    expect(dialog().querySelector(`[data-privacy-section="${id}"]`)).not.toBeNull();
  });

  it('Sessões ativas: confirmação em dois passos, sem chamar a API ao cancelar', () => {
    render(<PerfilMobile user={USER} />);
    fireEvent.click(document.querySelector('[data-perfil-item="sessoes"]')!);
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Sair de todos os dispositivos' }),
    );
    expect(within(dialog()).getByRole('alertdialog')).toBeInTheDocument();
    const cancelar = within(dialog()).getByRole('button', { name: 'Cancelar' });
    expect(cancelar).toHaveFocus();
    fireEvent.click(cancelar);
    expect(within(dialog()).queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  it('Verificação em duas etapas abre o cartão de 2FA', async () => {
    render(<PerfilMobile user={USER} />);
    fireEvent.click(document.querySelector('[data-perfil-item="2fa"]')!);
    expect(
      await within(dialog()).findByRole('button', { name: 'Configurar 2FA' }),
    ).toBeInTheDocument();
  });

  it('Lembretes e iCal abre as preferências da Agenda', async () => {
    render(<PerfilMobile user={USER} />);
    fireEvent.click(document.querySelector('[data-perfil-item="agenda"]')!);
    expect(within(dialog()).getByLabelText('Receber lembretes da Agenda')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog()).getByLabelText('Receber lembretes da Agenda')).not.toBeDisabled(),
    );
  });

  it('um sheet por vez: fechar e abrir outro troca o conteúdo', () => {
    render(<PerfilMobile user={USER} />);
    fireEvent.click(document.querySelector('[data-perfil-item="nome"]')!);
    fireEvent.click(within(dialog()).getByRole('button', { name: /fechar/i }));
    fireEvent.click(document.querySelector('[data-perfil-item="senha"]')!);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog().querySelector('[data-privacy-section="senha"]')).not.toBeNull();
  });
});

describe('PrivacyControls section', () => {
  it("section='senha' renderiza só o bloco de senha, sem cartão nem título", () => {
    const { container } = render(<PrivacyControls user={USER} section="senha" />);
    expect(screen.getByText('Senha atual')).toBeInTheDocument();
    expect(screen.queryByText('Nome completo')).not.toBeInTheDocument();
    expect(screen.queryByText('Baixar JSON')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('section')).toBeNull();
  });

  it("'all' (padrão) mantém o DOM de hoje", () => {
    const { container } = render(<PrivacyControls user={USER} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('TwoFactorAuth no celular', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMatchMedia(true);
  });

  it('QR + link otpauth + Copiar chave + código one-time-code', async () => {
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          secret: 'JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/png;base64,AAAA',
          otpauthUrl: 'otpauth://totp/MyFinance:ana?secret=JBSWY3DPEHPK3PXP&issuer=MyFinance',
        }),
    });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<TwoFactorAuth initialEnabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));

    const link = await screen.findByRole('link', { name: 'Abrir no app autenticador' });
    expect(link).toHaveAttribute(
      'href',
      'otpauth://totp/MyFinance:ana?secret=JBSWY3DPEHPK3PXP&issuer=MyFinance',
    );
    expect(screen.getByAltText('QR Code 2FA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar chave' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP'));
    expect(await screen.findByRole('button', { name: 'Copiada!' })).toBeInTheDocument();

    const codigo = screen.getByLabelText('Digite o código de 6 dígitos');
    expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codigo).toHaveAttribute('inputmode', 'numeric');
    expect(codigo).toHaveAttribute('maxlength', '6');
    // Mesma validação de hoje: Ativar só com 6 dígitos.
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeDisabled();
  });
});
