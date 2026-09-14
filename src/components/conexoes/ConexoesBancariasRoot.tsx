'use client';

import { useCallback, useState } from 'react';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import {
  useAtualizarConexao,
  useConexoes,
  useConnectToken,
  useExcluirConexao,
  useRegistrarConexao,
  type BankAccountDTO,
  type BankConnectionDTO,
  type ConnectTokenResposta,
} from '@/hooks/useConexoesBancarias';
import CaixaEntrada from './CaixaEntrada';
import ConexaoCard from './ConexaoCard';
import ExtratoConta from './ExtratoConta';
import PluggyConnectWidget from './PluggyConnectWidget';

type Widget = { token: ConnectTokenResposta; updateItem?: string } | null;

/**
 * Tela "Conexões bancárias": conectar banco pelo Pluggy Connect, ver contas
 * e saldos, atualizar, reconectar, excluir e abrir o extrato importado.
 * Só o próprio cliente (consultor recebe 403 da API).
 */
export default function ConexoesBancariasRoot() {
  const { data: conexoes, isLoading, isError, error } = useConexoes();
  const connectToken = useConnectToken();
  const registrar = useRegistrarConexao();
  const atualizar = useAtualizarConexao();
  const excluir = useExcluirConexao();

  const [widget, setWidget] = useState<Widget>(null);
  const [contaExtrato, setContaExtrato] = useState<BankAccountDTO | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ocupada =
    connectToken.isPending || registrar.isPending || atualizar.isPending || excluir.isPending;

  const abrirWidget = useCallback(
    async (updateItem?: string) => {
      setAviso(null);
      try {
        const token = await connectToken.mutateAsync(
          updateItem ? { itemId: updateItem } : undefined,
        );
        setWidget({ token, updateItem });
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'Não foi possível abrir a conexão');
      }
    },
    [connectToken],
  );

  const onSuccess = useCallback(
    async ({ item }: { item: { id: string } }) => {
      setWidget(null);
      try {
        await registrar.mutateAsync({ itemId: item.id });
        setAviso('Banco conectado. As transações dos últimos 12 meses foram importadas.');
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'A conexão foi criada, mas o registro falhou');
      }
    },
    [registrar],
  );

  const onAtualizar = useCallback(
    async (c: BankConnectionDTO) => {
      setAviso(null);
      try {
        await atualizar.mutateAsync({ id: c.id });
        setAviso(`Atualização de ${c.connectorName} pedida. Os dados chegam em alguns minutos.`);
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'Não foi possível atualizar');
      }
    },
    [atualizar],
  );

  const onExcluir = useCallback(
    async (c: BankConnectionDTO) => {
      const ok = window.confirm(
        `Excluir a conexão com ${c.connectorName}? O consentimento no banco é revogado e as transações importadas são apagadas do MyFinance.`,
      );
      if (!ok) return;
      setAviso(null);
      try {
        await excluir.mutateAsync({ id: c.id });
        if (contaExtrato && c.accounts.some((a) => a.id === contaExtrato.id)) setContaExtrato(null);
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'Não foi possível excluir');
      }
    },
    [excluir, contaExtrato],
  );

  if (isLoading) return <LoadingSpinner size="lg" text="Carregando conexões..." />;

  if (isError) {
    const desligada = error?.status === 503;
    const semAcesso = error?.status === 403;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        {desligada
          ? 'A conexão bancária ainda não está disponível neste ambiente.'
          : semAcesso
            ? 'As conexões bancárias só podem ser acessadas pelo próprio cliente.'
            : error?.message}
      </div>
    );
  }

  const lista = conexoes ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-300">
          Conecte suas contas e cartões pelo Open Finance. A autorização acontece no app do seu
          banco, sem senha aqui, e você pode revogar quando quiser. O MyFinance só lê; nunca
          movimenta dinheiro.
        </p>
        <Button onClick={() => abrirWidget()} disabled={ocupada}>
          {connectToken.isPending ? 'Preparando…' : 'Conectar banco'}
        </Button>
      </div>

      {aviso ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          {aviso}
        </div>
      ) : null}
      {registrar.isPending ? (
        <LoadingSpinner size="md" text="Importando contas e transações..." />
      ) : null}

      {lista.length > 0 ? <CaixaEntrada onAviso={setAviso} /> : null}

      {lista.length === 0 && !registrar.isPending ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Nenhum banco conectado ainda.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {lista.map((c) => (
            <ConexaoCard
              key={c.id}
              conexao={c}
              contaSelecionada={contaExtrato?.id ?? null}
              ocupada={ocupada}
              onVerExtrato={setContaExtrato}
              onAtualizar={onAtualizar}
              onReconectar={(cx) => abrirWidget(cx.providerItemId)}
              onExcluir={onExcluir}
            />
          ))}
        </div>
        {contaExtrato ? (
          <ExtratoConta conta={contaExtrato} onFechar={() => setContaExtrato(null)} />
        ) : null}
      </div>

      {widget ? (
        <PluggyConnectWidget
          connectToken={widget.token.accessToken}
          includeSandbox={widget.token.includeSandbox}
          products={widget.token.products as PluggyConnectWidgetProducts}
          updateItem={widget.updateItem}
          onSuccess={onSuccess}
          onError={(e) => {
            setWidget(null);
            setAviso(e?.message ?? 'O banco não concluiu a conexão. Tente de novo.');
          }}
          onClose={() => setWidget(null)}
        />
      ) : null}
    </div>
  );
}

type PluggyConnectWidgetProducts = NonNullable<
  React.ComponentProps<typeof PluggyConnectWidget>['products']
>;
