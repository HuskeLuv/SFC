// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConexaoNaoConcluidaModal from '../ConexaoNaoConcluidaModal';

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('ConexaoNaoConcluidaModal', () => {
  it('pede para conferir a instituição e o acesso usados', () => {
    render(
      <ConexaoNaoConcluidaModal
        instituicao="BTGPactual"
        detalhe={null}
        onTentarDeNovo={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByText('A conexão com BTGPactual não foi concluída')).toBeInTheDocument();
    const t = texto();
    expect(t).toContain('"BTGPactual" e "BTGPactual Investimentos"');
    expect(t).toContain('O token da conta de investimentos não autoriza a conta corrente');
    expect(t).not.toContain('Mensagem recebida');
  });

  it('mostra a mensagem do widget e aciona os botões', () => {
    const onTentarDeNovo = vi.fn();
    const onFechar = vi.fn();
    render(
      <ConexaoNaoConcluidaModal
        instituicao="Caixa Econômica Federal"
        detalhe="User requested input had expired"
        onTentarDeNovo={onTentarDeNovo}
        onFechar={onFechar}
      />,
    );
    expect(texto()).toContain('Mensagem recebida: User requested input had expired');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    const fechar = screen.getAllByRole('button', { name: 'Fechar' });
    fireEvent.click(fechar[fechar.length - 1]);
    expect(onFechar).toHaveBeenCalled();
  });
});
