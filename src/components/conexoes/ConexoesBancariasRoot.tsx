'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEXTO_CONSENTIMENTO_ATUAL } from '@/lib/openFinanceConsentimento';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import {
  useAtualizarConexao,
  useConexoes,
  useConnectToken,
  useConsentimentos,
  useExcluirConexao,
  useRegistrarConexao,
  useRegistrarConsentimento,
  useRegistrarEventoConsentimento,
  type BankAccountDTO,
  type BankConnectionDTO,
  type ConnectTokenResposta,
  type ConsentimentoDTO,
  type RegistroResposta,
} from '@/hooks/useConexoesBancarias';
import ConexaoRealizadaModal from './ConexaoRealizadaModal';
import AutorizacaoModal, { dataHora, ROTULO_MOTIVO } from './AutorizacaoModal';
import ConectarBancoModal from './ConectarBancoModal';
import CaixaEntrada from './CaixaEntrada';
import CarteiraImportada from './CarteiraImportada';
import ConexaoCard from './ConexaoCard';
import ExtratoConta from './ExtratoConta';
import PluggyConnectWidget from './PluggyConnectWidget';

type Widget = { token: ConnectTokenResposta; updateItem?: string; consentimentoId: string } | null;
/** Jornada antes do widget: aviso → consentimento → redirecionamento. */
type Jornada = { reconexaoDe: BankConnectionDTO | null; consentimentoId: string | null } | null;

/**
 * Tela "Conexões bancárias": conectar banco pelo Pluggy Connect, ver contas
 * e saldos, atualizar, reconectar, excluir e abrir o extrato importado.
 * Só o próprio cliente (consultor recebe 403 da API).
 */
export default function ConexoesBancariasRoot() {
  const { data: conexoes, isLoading, isError, error } = useConexoes();
  const { data: consentimentos } = useConsentimentos(!isError);
  const registrarConsentimento = useRegistrarConsentimento();
  const registrarEvento = useRegistrarEventoConsentimento();
  // O widget pode avisar "fechou" depois do sucesso: não marcar como não concluído.
  const concluiuRef = useRef(false);
  const [realizada, setRealizada] = useState<RegistroResposta | null>(null);
  const connectToken = useConnectToken();
  const registrar = useRegistrarConexao();
  const atualizar = useAtualizarConexao();
  const excluir = useExcluirConexao();

  const [widget, setWidget] = useState<Widget>(null);
  const [jornada, setJornada] = useState<Jornada>(null);
  const [erroJornada, setErroJornada] = useState<string | null>(null);
  const [autorizacaoAberta, setAutorizacaoAberta] = useState<ConsentimentoDTO | null>(null);
  const [contaExtrato, setContaExtrato] = useState<BankAccountDTO | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ocupada =
    connectToken.isPending ||
    registrarConsentimento.isPending ||
    registrar.isPending ||
    atualizar.isPending ||
    excluir.isPending;

  const autorizacaoAtiva = useMemo(() => {
    const m = new Map<string, ConsentimentoDTO>();
    for (const c of consentimentos ?? []) {
      if (c.status === 'ativo' && c.connectionId) m.set(c.connectionId, c);
    }
    return m;
  }, [consentimentos]);
  const encerradas = (consentimentos ?? []).filter((c) => c.status !== 'ativo');

  const abrirJornada = useCallback((reconexaoDe?: BankConnectionDTO) => {
    setAviso(null);
    setErroJornada(null);
    setJornada({ reconexaoDe: reconexaoDe ?? null, consentimentoId: null });
  }, []);

  // Etapa 2: "Li e autorizo" + "Autorizar e continuar" → grava o aceite.
  const onAutorizar = useCallback(async () => {
    if (!jornada) return false;
    setErroJornada(null);
    try {
      const { consentimentoId } = await registrarConsentimento.mutateAsync({
        versao: TEXTO_CONSENTIMENTO_ATUAL.versao,
        ...(jornada.reconexaoDe ? { reconexaoDe: jornada.reconexaoDe.id } : {}),
      });
      setJornada({ ...jornada, consentimentoId });
      return true;
    } catch (e) {
      setErroJornada(e instanceof Error ? e.message : 'Não foi possível registrar a autorização');
      return false;
    }
  }, [jornada, registrarConsentimento]);

  // Etapa 3: depois do aviso de redirecionamento, abre o widget do Pluggy.
  const onContinuar = useCallback(async () => {
    if (!jornada?.consentimentoId) return;
    setErroJornada(null);
    const updateItem = jornada.reconexaoDe?.providerItemId;
    try {
      const token = await connectToken.mutateAsync({
        consentimentoId: jornada.consentimentoId,
        ...(updateItem ? { itemId: updateItem } : {}),
      });
      concluiuRef.current = false;
      setWidget({ token, updateItem, consentimentoId: jornada.consentimentoId });
      setJornada(null);
    } catch (e) {
      setErroJornada(e instanceof Error ? e.message : 'Não foi possível abrir a conexão');
    }
  }, [jornada, connectToken]);

  const onSuccess = useCallback(
    async ({ item }: { item: { id: string } }) => {
      if (!widget) return;
      concluiuRef.current = true;
      registrarEvento(widget.consentimentoId, { evento: 'CONCLUIDO' });
      setWidget(null);
      try {
        const r = await registrar.mutateAsync({
          itemId: item.id,
          consentimentoId: widget.consentimentoId,
        });
        // Tela de retorno: "Conexão realizada. Os seguintes dados serão importados".
        setRealizada(r);
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'A conexão foi criada, mas o registro falhou');
      }
    },
    [registrar, registrarEvento, widget],
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
        `Desconectar ${c.connectorName}?\n\n` +
          'A autorização é revogada e o My Finance para de receber dados desse banco. ' +
          'O extrato importado é apagado; o que você já aplicou no Fluxo de Caixa, na Carteira ' +
          'ou em Dívidas continua. O registro desta autorização fica no seu histórico.',
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

  // Vindo do card da Carteira/Fluxo (?conectar=1): abre a jornada uma vez e limpa a URL.
  useEffect(() => {
    if (isLoading || isError) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('conectar') !== '1') return;
    url.searchParams.delete('conectar');
    window.history.replaceState(null, '', url.toString());
    abrirJornada();
  }, [isLoading, isError, abrirJornada]);

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
          banco, sem senha aqui, e você pode desconectar quando quiser. O My Finance só lê; nunca
          movimenta dinheiro. Banco que já está na lista? Use &quot;Reconectar&quot; nele em vez de
          conectar de novo. Dúvidas sobre seus dados:{' '}
          <a href="mailto:privacidade@appmyfinance.com.br" className="text-brand-500 underline">
            privacidade@appmyfinance.com.br
          </a>
          .
        </p>
        <Button onClick={() => abrirJornada()} disabled={ocupada}>
          Conectar banco
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
      {lista.length > 0 ? <CarteiraImportada onAviso={setAviso} /> : null}

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
              autorizacao={autorizacaoAtiva.get(c.id) ?? null}
              onVerAutorizacao={setAutorizacaoAberta}
              onReconectar={(cx) => abrirJornada(cx)}
              onExcluir={onExcluir}
            />
          ))}
        </div>
        {contaExtrato ? (
          <ExtratoConta conta={contaExtrato} onFechar={() => setContaExtrato(null)} />
        ) : null}
      </div>

      {encerradas.length > 0 ? (
        <details className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
            Autorizações encerradas ({encerradas.length})
          </summary>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {encerradas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-gray-700 dark:text-gray-300">
                  {c.connectorName ?? 'Banco'} · autorizada em {dataHora(c.aceitoEm)} · encerrada em{' '}
                  {dataHora(c.revogadoEm)}
                  {c.motivoRevogacao
                    ? ` (${ROTULO_MOTIVO[c.motivoRevogacao] ?? c.motivoRevogacao})`
                    : ''}
                </span>
                <button
                  type="button"
                  className="text-xs text-brand-500 underline"
                  onClick={() => setAutorizacaoAberta(c)}
                >
                  Ver autorização
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {jornada ? (
        <ConectarBancoModal
          reconexaoDe={jornada.reconexaoDe}
          ocupada={registrarConsentimento.isPending || connectToken.isPending}
          erro={erroJornada}
          onAutorizar={onAutorizar}
          onContinuar={onContinuar}
          onFechar={() => setJornada(null)}
        />
      ) : null}

      {realizada ? (
        <ConexaoRealizadaModal
          conexao={realizada.connection}
          importados={realizada.importados}
          aviso={realizada.aviso}
          onFechar={() => setRealizada(null)}
        />
      ) : null}

      {autorizacaoAberta ? (
        <AutorizacaoModal
          consentimento={autorizacaoAberta}
          onFechar={() => setAutorizacaoAberta(null)}
        />
      ) : null}

      {widget ? (
        <PluggyConnectWidget
          connectToken={widget.token.accessToken}
          includeSandbox={widget.token.includeSandbox}
          products={widget.token.products as PluggyConnectWidgetProducts}
          updateItem={widget.updateItem}
          onSuccess={onSuccess}
          onOpen={() => registrarEvento(widget.consentimentoId, { evento: 'WIDGET_ABERTO' })}
          // Marcos da etapa Pluggy/instituição (o My Finance não vê as telas, só isto).
          onEvent={(p) =>
            registrarEvento(widget.consentimentoId, {
              evento: p.event,
              em: new Date(p.timestamp).toISOString(),
              ...(p.event === 'SELECTED_INSTITUTION' && p.connector
                ? { instituicao: p.connector.name }
                : {}),
            })
          }
          onError={(e) => {
            registrarEvento(widget.consentimentoId, {
              evento: 'ERRO',
              ...(e?.message ? { detalhe: e.message } : {}),
            });
            setWidget(null);
            setAviso(e?.message ?? 'O banco não concluiu a conexão. Tente de novo.');
          }}
          onClose={() => {
            if (!concluiuRef.current) {
              registrarEvento(widget.consentimentoId, { evento: 'FECHADO_SEM_CONCLUIR' });
            }
            setWidget(null);
          }}
        />
      ) : null}
    </div>
  );
}

type PluggyConnectWidgetProducts = NonNullable<
  React.ComponentProps<typeof PluggyConnectWidget>['products']
>;
