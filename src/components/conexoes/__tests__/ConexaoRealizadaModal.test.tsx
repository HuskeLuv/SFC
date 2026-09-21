// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConexaoRealizadaModal from '../ConexaoRealizadaModal';
import type { BankConnectionDTO } from '@/hooks/useConexoesBancarias';

const conexao = {
  connectorName: 'Banco X',
  consentExpiresAt: '2027-09-21T00:00:00.000Z',
} as BankConnectionDTO;

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('ConexaoRealizadaModal', () => {
  it('diz o que chegou, onde está e o que ficou para cadastrar', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{
          contas: 1,
          cartoes: 2,
          transacoes: 33,
          investimentos: 5,
          investimentosParaCadastrar: 1,
          emprestimos: 1,
          emprestimosParaCadastrar: 0,
        }}
        aviso={null}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByText('Conexão realizada')).toBeInTheDocument();
    const t = texto();
    expect(t).toContain('Banco X está conectado ao My Finance, em modo leitura');
    expect(t).toContain('1 conta com saldo');
    expect(t).toContain('2 cartões de crédito com limite e fatura');
    expect(t).toContain('33 transações dos últimos 12 meses');
    expect(t).toContain('5 investimentos');
    expect(t).toContain('já entraram na Carteira');
    expect(t).toContain('1 empréstimo ou financiamento');
    expect(t).toContain('já entrou em Dívidas');
    expect(t).toContain('1 item que não conseguimos trazer sozinhos');
    expect(t).toContain('A autorização vale até 21/09/2027');
  });

  it('sem investimentos nem empréstimos não lista essas linhas', () => {
    render(
      <ConexaoRealizadaModal
        conexao={{ ...conexao, consentExpiresAt: null }}
        importados={{
          contas: 1,
          cartoes: 0,
          transacoes: 0,
          investimentos: 0,
          investimentosParaCadastrar: 0,
          emprestimos: 0,
          emprestimosParaCadastrar: 0,
        }}
        aviso={null}
        onFechar={vi.fn()}
      />,
    );
    const t = texto();
    expect(t).toContain('Transações (nenhuma no período por enquanto)');
    expect(t).not.toContain('Carteira,');
    expect(t).not.toContain('Dívidas');
    expect(t).not.toContain('vale até');
  });
});
