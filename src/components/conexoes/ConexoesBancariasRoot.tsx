'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEXTO_CONSENTIMENTO_ATUAL } from '@/lib/openFinanceConsentimento';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryView } from '@/hooks/useMobileHistoryView';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import MobileSaveToast from '@/components/ui/sheet/MobileSaveToast';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import {
  useAtualizarConexao,
  useCaixaEntrada,
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
import ConexaoNaoConcluidaModal from './ConexaoNaoConcluidaModal';
import AutorizacaoModal, { dataHora, ROTULO_MOTIVO } from './AutorizacaoModal';
import ConectarBancoModal from './ConectarBancoModal';
import CaixaEntrada, { ehIgnoravel, temSugestaoDeLinha } from './CaixaEntrada';
import CaixaEntradaResumo from './mobile/CaixaEntradaResumo';
import CarteiraImportada from './CarteiraImportada';
import ConexaoCard from './ConexaoCard';
import ExtratoConta from './ExtratoConta';
import PluggyConnectWidget from './PluggyConnectWidget';

/** Texto da confirmação de "Desconectar" (o mesmo no window.confirm do desktop e no sheet). */
const DESCONECTAR_TEXTO =
  'A autorização é revogada e o My Finance para de receber dados desse banco. ' +
  'O extrato importado é apagado; o que você já aplicou no Fluxo de Caixa, na Carteira ' +
  'ou em Dívidas continua. O registro desta autorização fica no seu histórico.';

type Widget = { token: ConnectTokenResposta; updateItem?: string; consentimentoId: string } | null;

/** Item do Pluggy como chega nos eventos do widget (tipos do pluggy-js não instalados). */
type ItemDoWidget = {
  id?: string;
  status?: string;
  executionStatus?: string;
  error?: { code?: string; message?: string } | null;
};

/** Resumo curto do estado do item para o marco: "STATUS/EXECUTION • CODIGO: mensagem". */
function detalheDoItem(item: ItemDoWidget): string | undefined {
  const status = [item.status, item.executionStatus].filter(Boolean).join('/');
  const erro = item.error ? [item.error.code, item.error.message].filter(Boolean).join(': ') : '';
  return [status, erro].filter(Boolean).join(' • ') || undefined;
}
/** A conexão chegou à tela do banco e não voltou concluída (ver ConexaoNaoConcluidaModal). */
type NaoConcluida = {
  instituicao: string;
  detalhe: string | null;
  reconexaoDe: BankConnectionDTO | null;
} | null;

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
  // O widget reemite LOGIN_SUCCESS/ITEM_RESPONSE a cada poll (~2,5 s): por tipo de
  // evento, só mandamos o marco quando o estado do item muda (senão o timeline satura).
  const marcosEnviadosRef = useRef(new Map<string, string>());
  // Banco escolhido no widget e se o usuário já foi mandado para a autorização dele:
  // fechar/errar depois disso abre o aviso "confira se escolheu a instituição certa".
  const instituicaoRef = useRef<string | null>(null);
  const chegouAoBancoRef = useRef(false);
  const [naoConcluida, setNaoConcluida] = useState<NaoConcluida>(null);
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

  // PWA fase 3: no celular a Caixa de entrada vira um cartão-resumo que abre tela própria
  // (?caixa=1 com o voltar do sistema), o extrato abre em sheet, "Desconectar" confirma em sheet e
  // cada aviso também aparece como toast. O desktop fica como hoje (a URL não muda).
  const isBelowLg = useIsBelowLg();
  const isBelowLgRef = useRef(isBelowLg);
  useEffect(() => {
    isBelowLgRef.current = isBelowLg;
  }, [isBelowLg]);
  const caixa = useMobileHistoryView('caixa', isBelowLg);
  const { confirm, confirmSheet } = useResponsiveConfirm();
  const [toast, setToast] = useState<string | null>(null);
  const temConexoes = (conexoes?.length ?? 0) > 0;
  // Mesma query (página 1) da CaixaEntrada: as contagens do resumo são as mesmas da tela da caixa.
  const { data: caixaPagina1 } = useCaixaEntrada(1, isBelowLg && temConexoes);
  const contagensCaixa = useMemo(
    () => ({
      total: caixaPagina1?.total ?? 0,
      sugeridas: caixaPagina1?.pendentes.filter(temSugestaoDeLinha).length ?? 0,
      transferencias: caixaPagina1?.pendentes.filter(ehIgnoravel).length ?? 0,
    }),
    [caixaPagina1],
  );

  /** Aviso de hoje (banner) + o mesmo texto como toast no celular. */
  const avisar = useCallback((msg: string) => {
    setAviso(msg);
    if (isBelowLgRef.current) setToast(msg);
  }, []);

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
    setNaoConcluida(null);
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
      marcosEnviadosRef.current = new Map();
      instituicaoRef.current = null;
      chegouAoBancoRef.current = false;
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
      registrarEvento(widget.consentimentoId, { evento: 'CONCLUIDO', itemId: item.id });
      setWidget(null);
      try {
        const r = await registrar.mutateAsync({
          itemId: item.id,
          consentimentoId: widget.consentimentoId,
        });
        // Tela de retorno: "Conexão realizada. Os seguintes dados serão importados".
        setRealizada(r);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'A conexão foi criada, mas o registro falhou');
      }
    },
    [registrar, registrarEvento, widget, avisar],
  );

  const onAtualizar = useCallback(
    async (c: BankConnectionDTO) => {
      setAviso(null);
      try {
        await atualizar.mutateAsync({ id: c.id });
        avisar(`Atualização de ${c.connectorName} pedida. Os dados chegam em alguns minutos.`);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não foi possível atualizar');
      }
    },
    [atualizar, avisar],
  );

  const onExcluir = useCallback(
    async (c: BankConnectionDTO) => {
      const ok = await confirm({
        desktopMessage: `Desconectar ${c.connectorName}?\n\n${DESCONECTAR_TEXTO}`,
        title: `Desconectar ${c.connectorName}?`,
        message: DESCONECTAR_TEXTO,
        confirmLabel: 'Desconectar',
        danger: true,
      });
      if (!ok) return;
      setAviso(null);
      try {
        await excluir.mutateAsync({ id: c.id });
        if (contaExtrato && c.accounts.some((a) => a.id === contaExtrato.id)) setContaExtrato(null);
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não foi possível excluir');
      }
    },
    [excluir, contaExtrato, confirm, avisar],
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

  /** Aviso de "não concluída" se o usuário já tinha ido à autorização do banco escolhido. */
  function naoConcluidaAgora(detalhe: string | null): NaoConcluida {
    if (!chegouAoBancoRef.current) return null;
    const reconexaoDe = widget?.updateItem
      ? ((conexoes ?? []).find((c) => c.providerItemId === widget.updateItem) ?? null)
      : null;
    // Reconectar pula a escolha do banco no widget: o nome vem da conexão.
    const instituicao = instituicaoRef.current ?? reconexaoDe?.connectorName;
    if (!instituicao) return null;
    return { instituicao, detalhe, reconexaoDe };
  }

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

  const bannerAviso = aviso ? (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
      {aviso}
    </div>
  ) : null;
  const toastAviso = (
    <MobileSaveToast message={toast} durationMs={6000} onDismiss={() => setToast(null)} />
  );

  // Celular com ?caixa=1: só a tela da Caixa de entrada (o voltar do sistema volta às conexões).
  if (isBelowLg && caixa.value && lista.length > 0) {
    return (
      <div data-mf-mobile="" data-caixa-tela="" className="space-y-4">
        <button
          type="button"
          onClick={caixa.close}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
        >
          <span aria-hidden="true">←</span> Conexões
        </button>
        {bannerAviso}
        <CaixaEntrada onAviso={avisar} />
        {toastAviso}
      </div>
    );
  }

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
        <Button
          onClick={() => abrirJornada()}
          disabled={ocupada}
          className="max-lg:w-full max-lg:min-h-11"
        >
          Conectar banco
        </Button>
      </div>

      {bannerAviso}
      {registrar.isPending ? (
        <LoadingSpinner size="md" text="Importando contas e transações..." />
      ) : null}

      {lista.length > 0 ? (
        isBelowLg ? (
          <CaixaEntradaResumo contagens={contagensCaixa} onOpen={() => caixa.open('1')} />
        ) : (
          <CaixaEntrada onAviso={avisar} />
        )
      ) : null}
      {lista.length > 0 ? <CarteiraImportada onAviso={avisar} /> : null}

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
        {contaExtrato && !isBelowLg ? (
          <ExtratoConta conta={contaExtrato} onFechar={() => setContaExtrato(null)} />
        ) : null}
      </div>

      {encerradas.length > 0 ? (
        <details className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300 max-lg:-my-1 max-lg:py-3">
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
                  className="text-xs text-brand-500 underline max-lg:-my-2 max-lg:min-h-11 max-lg:px-2 max-lg:text-sm max-lg:text-mf-patrimonio dark:max-lg:text-mf-tranquilidade"
                  onClick={() => setAutorizacaoAberta(c)}
                >
                  Ver autorização
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {isBelowLg && contaExtrato ? (
        <BottomSheet
          isOpen
          onClose={() => setContaExtrato(null)}
          title={`Extrato · ${contaExtrato.name}`}
        >
          <ExtratoConta
            conta={contaExtrato}
            onFechar={() => setContaExtrato(null)}
            variant="sheet"
          />
        </BottomSheet>
      ) : null}

      {confirmSheet}
      {toastAviso}

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

      {naoConcluida ? (
        <ConexaoNaoConcluidaModal
          instituicao={naoConcluida.instituicao}
          detalhe={naoConcluida.detalhe}
          onTentarDeNovo={() => abrirJornada(naoConcluida.reconexaoDe ?? undefined)}
          onFechar={() => setNaoConcluida(null)}
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
          // Eventos que carregam o item levam o itemId + status/erro (diagnóstico Pluggy).
          onEvent={(p) => {
            const item: ItemDoWidget | null =
              'item' in p && p.item ? (p.item as ItemDoWidget) : null;
            const detalhe = item ? detalheDoItem(item) : undefined;
            if (p.event === 'SELECTED_INSTITUTION') {
              instituicaoRef.current = p.connector?.name ?? null;
              chegouAoBancoRef.current = false;
            }
            if (p.event === 'LOGIN_SUCCESS' || item?.status === 'WAITING_USER_INPUT') {
              chegouAoBancoRef.current = true;
            }
            if (item) {
              const assinatura = `${item.id ?? ''}|${detalhe ?? ''}`;
              if (marcosEnviadosRef.current.get(p.event) === assinatura) return;
              marcosEnviadosRef.current.set(p.event, assinatura);
            }
            registrarEvento(widget.consentimentoId, {
              evento: p.event,
              em: new Date(p.timestamp).toISOString(),
              ...(p.event === 'SELECTED_INSTITUTION' && p.connector
                ? { instituicao: p.connector.name }
                : {}),
              ...(item?.id ? { itemId: item.id } : {}),
              ...(detalhe ? { detalhe } : {}),
            });
          }}
          onError={(e) => {
            const item: ItemDoWidget | undefined = e?.data?.item as ItemDoWidget | undefined;
            const detalheItem = item ? detalheDoItem(item) : undefined;
            registrarEvento(widget.consentimentoId, {
              evento: 'ERRO',
              ...(item?.id ? { itemId: item.id } : {}),
              ...(e?.message || detalheItem
                ? { detalhe: [e?.message, detalheItem].filter(Boolean).join(' • ') }
                : {}),
            });
            setWidget(null);
            const naoConcluiu = naoConcluidaAgora(e?.message ?? null);
            if (naoConcluiu) setNaoConcluida(naoConcluiu);
            else avisar(e?.message ?? 'O banco não concluiu a conexão. Tente de novo.');
          }}
          onClose={() => {
            if (!concluiuRef.current) {
              registrarEvento(widget.consentimentoId, { evento: 'FECHADO_SEM_CONCLUIR' });
              const naoConcluiu = naoConcluidaAgora(null);
              // O widget também fecha depois de um onError: não troca o aviso que já abriu.
              if (naoConcluiu) setNaoConcluida((atual) => atual ?? naoConcluiu);
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
