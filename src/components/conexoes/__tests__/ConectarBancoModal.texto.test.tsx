// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TEXTO_CONSENTIMENTO_ATUAL } from '@/lib/openFinanceConsentimento';
import ConectarBancoModal from '../ConectarBancoModal';

/**
 * PWA fase 3: a jornada Open Finance muda só de layout no celular (sheet alto, rodapé fixo). Em
 * qualquer largura, cada etapa mostra TODOS os textos da versão vigente, os mesmos rótulos, e o
 * "Autorizar e continuar" só ativa com "Li e autorizo".
 */

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

const texto = TEXTO_CONSENTIMENTO_ATUAL;
const corpo = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const norm = (t: string) => t.replace(/\s+/g, ' ');

function renderModal() {
  const props = {
    ocupada: false,
    erro: null,
    onAutorizar: vi.fn(async () => true),
    onContinuar: vi.fn(),
    onFechar: vi.fn(),
  };
  render(<ConectarBancoModal {...props} />);
  return props;
}

afterEach(() => {
  // @ts-expect-error — remove o stub
  delete window.matchMedia;
});

for (const [nome, mobile] of [
  ['celular', true],
  ['desktop', false],
] as const) {
  describe(`ConectarBancoModal — textos da ${texto.versao} (${nome})`, () => {
    it('etapa 1 → 2 → 3 com todos os textos e os mesmos rótulos', async () => {
      stubMatchMedia(mobile);
      const props = renderModal();

      expect(screen.getByText('Etapa 1 de 3')).toBeTruthy();
      expect(corpo()).toContain(norm(texto.aviso.titulo));
      expect(corpo()).toContain(norm(texto.aviso.texto));
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

      expect(screen.getByText('Etapa 2 de 3')).toBeTruthy();
      expect(corpo()).toContain(norm(texto.consentimento.titulo));
      for (const s of texto.consentimento.secoes) {
        expect(corpo()).toContain(norm(s.titulo));
        if (s.texto) expect(corpo()).toContain(norm(s.texto));
        for (const i of s.itens ?? []) expect(corpo()).toContain(norm(i));
      }
      expect(corpo()).toContain(norm(texto.consentimento.aceite));
      expect(screen.getByRole('button', { name: 'Não autorizo' })).toBeTruthy();

      const autorizar = screen.getByRole('button', { name: 'Autorizar e continuar' });
      expect((autorizar as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByLabelText(texto.consentimento.aceite));
      expect((autorizar as HTMLButtonElement).disabled).toBe(false);
      await act(async () => {
        fireEvent.click(autorizar);
      });
      expect(props.onAutorizar).toHaveBeenCalledTimes(1);

      expect(screen.getByText('Etapa 3 de 3')).toBeTruthy();
      expect(corpo()).toContain(norm(texto.redirecionamento.titulo));
      expect(corpo()).toContain(norm(texto.redirecionamento.texto));
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar para a Pluggy' }));
      expect(props.onContinuar).toHaveBeenCalledTimes(1);
    });

    it('"Não autorizo" fecha sem registrar o aceite', () => {
      stubMatchMedia(mobile);
      const props = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Não autorizo' }));
      expect(props.onFechar).toHaveBeenCalledTimes(1);
      expect(props.onAutorizar).not.toHaveBeenCalled();
    });
  });
}
