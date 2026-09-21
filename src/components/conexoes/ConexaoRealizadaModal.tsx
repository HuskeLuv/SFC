'use client';

import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import type { BankConnectionDTO, ResumoImportado } from '@/hooks/useConexoesBancarias';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Tela de retorno (adequação jurídica, etapa 4): "Conexão realizada. Os
 * seguintes dados serão importados: [lista]" — com quantidades reais do que
 * chegou, onde cada coisa aparece, a validade e como desconectar.
 */
export default function ConexaoRealizadaModal({
  conexao,
  importados,
  aviso,
  onFechar,
}: {
  conexao: BankConnectionDTO;
  importados: ResumoImportado;
  aviso: string | null;
  onFechar: () => void;
}) {
  const linhas: Array<{ dado: string; onde: string }> = [];
  if (importados.contas > 0) {
    linhas.push({
      dado: `${plural(importados.contas, 'conta', 'contas')} com saldo`,
      onde: 'nesta tela, em Conexões bancárias',
    });
  }
  if (importados.cartoes > 0) {
    linhas.push({
      dado: `${plural(importados.cartoes, 'cartão de crédito', 'cartões de crédito')} com limite e fatura`,
      onde: 'nesta tela, em Conexões bancárias',
    });
  }
  linhas.push({
    dado:
      importados.transacoes > 0
        ? `${plural(importados.transacoes, 'transação', 'transações')} dos últimos 12 meses`
        : 'Transações (nenhuma no período por enquanto)',
    onde: 'na Caixa de entrada, para você revisar e levar ao Fluxo de Caixa',
  });
  if (importados.investimentos > 0) {
    linhas.push({
      dado: plural(importados.investimentos, 'investimento', 'investimentos'),
      onde: 'já entraram na Carteira, marcados como importados do banco',
    });
  }
  if (importados.emprestimos > 0) {
    linhas.push({
      dado: plural(
        importados.emprestimos,
        'empréstimo ou financiamento',
        'empréstimos e financiamentos',
      ),
      onde: 'já entraram em Dívidas, com as parcelas no Fluxo de Caixa',
    });
  }
  const paraCadastrar = importados.investimentosParaCadastrar + importados.emprestimosParaCadastrar;
  if (paraCadastrar > 0) {
    linhas.push({
      dado: `${plural(paraCadastrar, 'item', 'itens')} que não conseguimos trazer sozinhos`,
      onde: 'em "Investimentos e empréstimos do banco", para você cadastrar',
    });
  }

  return (
    <Modal isOpen onClose={onFechar} className="m-4 max-w-lg">
      <div className="p-6 sm:p-8">
        <h3 className="mb-1 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
          Conexão realizada
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          {conexao.connectorName} está conectado ao My Finance, em modo leitura. Os seguintes dados
          serão importados:
        </p>
        <ul className="space-y-2 text-sm">
          {linhas.map((l) => (
            <li key={l.dado} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
              <span className="font-medium text-gray-800 dark:text-white/90">{l.dado}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{l.onde}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          {conexao.consentExpiresAt
            ? `A autorização vale até ${new Date(conexao.consentExpiresAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}. `
            : ''}
          Os dados novos chegam automaticamente enquanto a autorização valer. Você pode desconectar
          a qualquer momento nesta tela.
        </p>
        {aviso ? (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            {aviso}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end">
          <Button size="sm" onClick={onFechar}>
            Entendi
          </Button>
        </div>
      </div>
    </Modal>
  );
}
