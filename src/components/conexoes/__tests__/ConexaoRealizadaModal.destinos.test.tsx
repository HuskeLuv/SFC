// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConexaoRealizadaModal from '../ConexaoRealizadaModal';
import type { BankConnectionDTO, ResumoImportado } from '@/hooks/useConexoesBancarias';
import type { AplicarDestinosResponse } from '@/lib/pluggyDestinos';

/**
 * Escolher o destino na importação (fatia D): "Conexão realizada" continua sendo a 1ª tela, com o
 * texto jurídico intacto, e ganha "Escolher onde ficam (N)"; fechar ou salvar a revisão volta a
 * ela. Sem os campos novos (chave PLUGGY_DESTINOS_HABILITADO desligada) a tela é a de hoje.
 */

const conexao = {
  id: '11111111-1111-4111-8111-111111111111',
  connectorName: 'Banco X',
  consentExpiresAt: '2027-09-21T00:00:00.000Z',
  accounts: [],
} as unknown as BankConnectionDTO;

const base: ResumoImportado = {
  contas: 1,
  cartoes: 0,
  transacoes: 12,
  investimentos: 10,
  investimentosParaCadastrar: 2,
  emprestimos: 0,
  emprestimosParaCadastrar: 0,
};

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

/** Partes do texto da adequação jurídica que não podem sumir em nenhum estado. */
function expectTextoJuridico() {
  const t = texto();
  expect(screen.getByText('Conexão realizada')).toBeInTheDocument();
  expect(t).toContain(
    'Banco X está conectado ao My Finance, em modo leitura. Os seguintes dados serão importados:',
  );
  expect(t).toContain('10 investimentos');
  expect(t).toContain('já entraram na Carteira, marcados como importados do banco');
  expect(t).toContain('2 itens que não conseguimos trazer sozinhos');
  expect(t).toContain('A autorização vale até 21/09/2027');
  expect(t).toContain('Você pode desconectar a qualquer momento nesta tela.');
  expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
}

describe('ConexaoRealizadaModal — destinos', () => {
  it('chave desligada (sem investimentosParaRevisar): tela de hoje, sem o quadro', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={base}
        aviso={null}
        onFechar={vi.fn()}
        onConferirDestinos={vi.fn()}
      />,
    );
    expectTextoJuridico();
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
    expect(document.querySelector('[data-destinos-quadro]')).toBeNull();
  });

  it('N = 0 não mostra o quadro', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 0 }}
        aviso={null}
        onFechar={vi.fn()}
        onConferirDestinos={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
  });

  it('N > 0 sem a prop não mostra o botão', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 9 }}
        aviso={null}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
  });

  it('N > 0 com a prop: quadro com "Escolher onde ficam (N)" e o texto jurídico intacto', () => {
    const onConferir = vi.fn();
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 9 }}
        aviso="Aviso da conexão"
        onFechar={vi.fn()}
        onConferirDestinos={onConferir}
      />,
    );
    expectTextoJuridico();
    expect(texto()).toContain('Aviso da conexão');
    expect(texto()).toContain('9 investimentos podem ficar em mais de um lugar.');
    expect(texto()).toContain('agora ou depois, em Conexões bancárias');
    const botao = screen.getByRole('button', { name: 'Escolher onde ficam (9)' });
    expect(botao.className).toContain('min-h-11');
    fireEvent.click(botao);
    expect(onConferir).toHaveBeenCalledTimes(1);
  });

  it('N = 1 no singular', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 1 }}
        aviso={null}
        onFechar={vi.fn()}
        onConferirDestinos={vi.fn()}
      />,
    );
    expect(texto()).toContain('1 investimento pode ficar em mais de um lugar.');
    expect(screen.getByRole('button', { name: 'Escolher onde ficam (1)' })).toBeInTheDocument();
  });

  it('na volta da revisão salva: "Destinos conferidos" com N no lugar escolhido, só "Entendi"', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 9 }}
        aviso={null}
        onFechar={vi.fn()}
        onConferirDestinos={vi.fn()}
        destinosAplicados={3}
      />,
    );
    expectTextoJuridico();
    expect(texto()).toContain('Destinos conferidos.');
    expect(texto()).toContain('3 investimentos no lugar que você escolheu.');
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toContain('Entendi');
  });

  it('"Está tudo certo" (0 mudanças) também vira "Destinos conferidos"', () => {
    render(
      <ConexaoRealizadaModal
        conexao={conexao}
        importados={{ ...base, investimentosParaRevisar: 9 }}
        aviso={null}
        onFechar={vi.fn()}
        onConferirDestinos={vi.fn()}
        destinosAplicados={0}
      />,
    );
    expect(texto()).toContain('Destinos conferidos.');
    expect(texto()).not.toContain('no lugar que você escolheu');
  });
});

// ── Root: a revisão aberta pela "Conexão realizada" volta a ela ─────────────────────────────

const h = vi.hoisted(() => ({
  registro: null as unknown,
  revisaoProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));
vi.mock('@/hooks/useMobileHistoryView', () => ({
  useMobileHistoryView: () => ({ value: null, open: vi.fn(), close: vi.fn() }),
}));
vi.mock('@/components/ui/sheet/useResponsiveConfirm', () => ({
  useResponsiveConfirm: () => ({ confirm: vi.fn(async () => true), confirmSheet: null }),
}));
vi.mock('@/hooks/useConexoesBancarias', () => {
  const mut = (valor: unknown) => ({ mutateAsync: vi.fn(async () => valor), isPending: false });
  return {
    useConexoes: () => ({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          connectorName: 'Banco X',
          accounts: [],
          status: 'UPDATED',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    }),
    useConsentimentos: () => ({ data: [] }),
    useRegistrarConsentimento: () => mut({ consentimentoId: 'c1' }),
    useRegistrarEventoConsentimento: () => vi.fn(),
    useConnectToken: () =>
      mut({ accessToken: 'tok', includeSandbox: false, products: ['ACCOUNTS'] }),
    useRegistrarConexao: () => ({
      mutateAsync: vi.fn(async () => h.registro),
      isPending: false,
    }),
    useAtualizarConexao: () => mut({}),
    useExcluirConexao: () => mut(undefined),
    useCaixaEntrada: () => ({ data: undefined }),
  };
});
vi.mock('../CaixaEntrada', () => ({
  default: () => null,
  ehIgnoravel: () => false,
  temSugestaoDeLinha: () => false,
}));
vi.mock('../mobile/CaixaEntradaResumo', () => ({ default: () => null }));
vi.mock('../ConexaoCard', () => ({ default: () => null }));
vi.mock('../ExtratoConta', () => ({ default: () => null }));
vi.mock('../CarteiraImportada', () => ({
  default: ({ onConferirDestinos }: { onConferirDestinos?: () => void }) => (
    <button type="button" onClick={onConferirDestinos}>
      Conferir destinos (2)
    </button>
  ),
}));
vi.mock('../ConectarBancoModal', () => ({
  default: ({
    onAutorizar,
    onContinuar,
  }: {
    onAutorizar: () => Promise<boolean>;
    onContinuar: () => Promise<void>;
  }) => (
    <div>
      <button type="button" onClick={() => void onAutorizar()}>
        mock autorizar
      </button>
      <button type="button" onClick={() => void onContinuar()}>
        mock continuar
      </button>
    </div>
  ),
}));
vi.mock('../PluggyConnectWidget', () => ({
  default: ({ onSuccess }: { onSuccess: (p: { item: { id: string } }) => void }) => (
    <button type="button" onClick={() => onSuccess({ item: { id: 'item-1' } })}>
      mock widget sucesso
    </button>
  ),
}));
vi.mock('@/components/conexoes/destinos/RevisarDestinos', () => ({
  default: (props: {
    aberto: boolean;
    connectionId?: string;
    somenteNovos?: boolean;
    onFechar: () => void;
    onConcluido: (r: AplicarDestinosResponse) => void;
  }) => {
    h.revisaoProps.push(props as unknown as Record<string, unknown>);
    if (!props.aberto) return null;
    return (
      <div role="dialog" aria-label="Revisão">
        <h3>Confira onde seus investimentos entraram</h3>
        <button type="button" onClick={props.onFechar}>
          Conferir depois
        </button>
        <button
          type="button"
          onClick={() =>
            props.onConcluido({
              aplicados: 3,
              semMudanca: 0,
              confirmados: 9,
              parcial: false,
              erros: [],
              historicoIds: ['h1', 'h2', 'h3'],
            })
          }
        >
          Salvar 3 mudanças
        </button>
      </div>
    );
  },
}));

// Import depois dos mocks (vi.mock é içado; o import estático também funcionaria).
import ConexoesBancariasRoot from '../ConexoesBancariasRoot';

async function conectar() {
  fireEvent.click(screen.getByRole('button', { name: 'Conectar banco' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'mock autorizar' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'mock continuar' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'mock widget sucesso' }));
  });
  await waitFor(() => expect(screen.getByText('Conexão realizada')).toBeInTheDocument());
}

describe('ConexoesBancariasRoot — revisão dos destinos', () => {
  beforeEach(() => {
    h.revisaoProps = [];
    h.registro = {
      connection: conexao,
      reaproveitada: false,
      aviso: null,
      importados: { ...base, investimentosParaRevisar: 9 },
    };
  });

  it('"Escolher onde ficam" esconde o resumo; "Conferir depois" volta a ele', async () => {
    render(<ConexoesBancariasRoot />);
    await conectar();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher onde ficam (9)' }));
    expect(screen.getByText('Confira onde seus investimentos entraram')).toBeInTheDocument();
    expect(screen.queryByText('Conexão realizada')).toBeNull();
    const ultima = h.revisaoProps.at(-1)!;
    expect(ultima.connectionId).toBe(conexao.id);
    expect(ultima.somenteNovos).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Conferir depois' }));
    expect(screen.queryByText('Confira onde seus investimentos entraram')).toBeNull();
    expect(screen.getByText('Conexão realizada')).toBeInTheDocument();
    // Ainda dá para escolher (nada foi salvo).
    expect(screen.getByRole('button', { name: 'Escolher onde ficam (9)' })).toBeInTheDocument();
  });

  it('salvar volta ao resumo com "Destinos conferidos"; "Entendi" fecha', async () => {
    render(<ConexoesBancariasRoot />);
    await conectar();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher onde ficam (9)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 3 mudanças' }));
    expect(screen.getByText('Conexão realizada')).toBeInTheDocument();
    expect(texto()).toContain('3 investimentos no lugar que você escolheu.');
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
    // A revisão continua montada (fechada) para o toast com Desfazer sobreviver.
    expect(h.revisaoProps.at(-1)!.aberto).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByText('Conexão realizada')).toBeNull();
  });

  it('chave desligada (sem investimentosParaRevisar): resumo de hoje e a revisão nunca monta', async () => {
    h.registro = { connection: conexao, reaproveitada: false, aviso: null, importados: base };
    render(<ConexoesBancariasRoot />);
    await conectar();
    expect(screen.queryByRole('button', { name: /Escolher onde ficam/ })).toBeNull();
    expect(h.revisaoProps).toHaveLength(0);
  });

  it('"Conferir destinos" de Conexões abre só os novos e, ao salvar, avisa sem abrir o resumo', async () => {
    render(<ConexoesBancariasRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Conferir destinos (2)' }));
    const ultima = h.revisaoProps.at(-1)!;
    expect(ultima.somenteNovos).toBe(true);
    expect(ultima.connectionId).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 3 mudanças' }));
    expect(screen.queryByText('Conexão realizada')).toBeNull();
    expect(texto()).toContain('3 investimentos no lugar que você escolheu.');
  });
});
