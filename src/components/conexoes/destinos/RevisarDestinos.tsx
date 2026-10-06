'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useCsrf } from '@/hooks/useCsrf';
import {
  desfazerEAtualizar,
  useAplicarDestinos,
  useDestinosImportados,
} from '@/hooks/useDestinosImportacao';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import type {
  AplicarDestinosResponse,
  DestinoImportadoItem,
  ErroDestinoItem,
} from '@/lib/pluggyDestinos';
import type { CategoriaMovivel } from '@/lib/carteiraMover';
import AplicarLoteBarra from './AplicarLoteBarra';
import DestinoImportadoSheet, { type AlvoSheet } from './DestinoImportadoSheet';
import DestinosCartoesMobile from './DestinosCartoesMobile';
import DestinosTabela from './DestinosTabela';
import { mensagemSalvo, mostrarToastDestinos } from './destinosToast';
import {
  agruparFaixas,
  alternarSelecao,
  aplicarLote,
  aposParcial,
  comFalhas,
  contarMudancas,
  corpoDoPost,
  destinosDoLote,
  ehRevisavel,
  escolher,
  estadoInicial,
  limparSelecao,
  marcados,
  marcarVarios,
  mudancas,
  plural,
  rotuloItem,
  voltarASugestao,
  type EscolhaItem,
  type EstadoDestinos,
  type ItemRevisavel,
} from './destinosEstado';

/**
 * Revisão "Confira onde seus investimentos entraram" (destino na importação Open Finance,
 * out/2026 — docs/pluggy-importar-destino/, decisões em decisoes.md).
 *
 * Os investimentos JÁ estão na Carteira no lugar sugerido ("entra e confere"); aqui o usuário
 * troca o que quiser. Computador: diálogo de até 980px (raio 18, rodapé fixo) com a tabela
 * agrupada, painel na linha e lote por interseção. Abaixo de lg: tela cheia com cartões e o
 * BottomSheet. Destinos e motivos vêm só do servidor (`item.opcoes`).
 *
 * Salvar: um POST com { itens: só o que mudou, confirmarIds: os 'para-revisar' exibidos }. 409 =
 * nada mudou (alerta por item, escolhas preservadas). Parcial (só por concorrência): os que
 * deram certo ficam "salvo", os que falharam mantêm a escolha e o primário vira "Tentar de
 * novo". Sucesso → `onConcluido` + aviso "N investimentos mudaram de lugar · Desfazer".
 * Fechar depois de um parcial também conclui (algo já foi gravado).
 *
 * A lista é a FOTO do momento em que a revisão abriu: o que chegar por outra sincronização
 * com ela aberta não entra (nem em confirmarIds) e continua na fila.
 */
export interface RevisarDestinosProps {
  aberto: boolean;
  /** Só os investimentos desta conexão (logo depois de conectar). */
  connectionId?: string;
  /** Só os 'para-revisar' (aviso de Conexões: novos de sincronizações). */
  somenteNovos?: boolean;
  /** Fechar sem gravar ("Conferir depois", X, Esc, Voltar): a fila continua. */
  onFechar: () => void;
  onConcluido: (r: AplicarDestinosResponse) => void;
}

export const TITULO_REVISAO = 'Confira onde seus investimentos entraram';
export const SUBTITULO_REVISAO =
  'Eles já estão na Carteira no lugar que sugerimos. Troque o que quiser — dá para mudar depois em Mover na Carteira.';
export const TEXTO_409 = 'Nenhum investimento mudou de lugar; eles continuam onde entraram.';

export default function RevisarDestinos(props: RevisarDestinosProps) {
  if (!props.aberto) return null;
  return <RevisaoAberta {...props} />;
}

type Aviso =
  | { tipo: '409'; erros: ErroDestinoItem[] }
  | { tipo: 'parcial'; aplicados: number; erros: ErroDestinoItem[] }
  | { tipo: 'erro' };

const RESPOSTA_VAZIA: AplicarDestinosResponse = {
  aplicados: 0,
  semMudanca: 0,
  confirmados: 0,
  parcial: false,
  erros: [],
  historicoIds: [],
};

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export const SPINNER = (
  <svg
    className="h-4 w-4 shrink-0 motion-safe:animate-spin motion-reduce:animate-[spin_2s_linear_infinite]"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const ICONE_X = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ICONE_VOLTAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const BOTAO_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 outline-none hover:bg-gray-50 focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/[0.04] dark:focus-visible:ring-mf-tranquilidade';
const BOTAO_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mf-patrimonio px-4 text-sm font-semibold text-white outline-none hover:bg-mf-seguranca focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-mf-tranquilidade';

const somar = (
  a: AplicarDestinosResponse,
  b: AplicarDestinosResponse,
): AplicarDestinosResponse => ({
  aplicados: a.aplicados + b.aplicados,
  semMudanca: a.semMudanca + b.semMudanca,
  confirmados: a.confirmados + b.confirmados,
  parcial: false,
  erros: [],
  historicoIds: [...a.historicoIds, ...b.historicoIds],
});

function RevisaoAberta({
  connectionId,
  somenteNovos,
  onFechar,
  onConcluido,
}: RevisarDestinosProps) {
  const abaixoLg = useIsBelowLg();
  const tituloId = useId();
  const descId = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  const consulta = useDestinosImportados({
    connectionId,
    paraRevisar: somenteNovos,
    enabled: true,
  });
  const [itens, setItens] = useState<DestinoImportadoItem[] | null>(null);
  // Foto da lista na abertura (o refetch depois de salvar não troca as linhas da revisão). Só
  // com dado FRESCO: o cache de uma abertura anterior (gcTime) traria itens já conferidos e
  // esconderia os novos — espera o refetch da montagem terminar.
  if (itens === null && consulta.isSuccess && !consulta.isFetching) setItens(consulta.data.itens);

  const [estado, setEstado] = useState<EstadoDestinos>(estadoInicial);
  const [painel, setPainel] = useState<string | null>(null);
  const [alvoSheet, setAlvoSheet] = useState<AlvoSheet | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const acumulado = useRef<AplicarDestinosResponse>(RESPOSTA_VAZIA);
  const aplicar = useAplicarDestinos();
  const salvando = aplicar.isPending;

  const lista = itens ?? [];
  const faixas = agruparFaixas(lista);
  const nMudancas = contarMudancas(lista, estado);
  const pendentesConfirmar = lista.filter(
    (i) => i.situacao === 'para-revisar' && !estado.salvos.has(i.bankInvestmentId),
  ).length;

  const concluir = useCallback(
    (r: AplicarDestinosResponse) => {
      if (r.historicoIds.length > 0) {
        const ids = r.historicoIds;
        mostrarToastDestinos({
          mensagem: mensagemSalvo(r.aplicados),
          desfazer: () => desfazerEAtualizar(csrfFetch, queryClient, ids),
        });
      }
      onConcluido(r);
    },
    [csrfFetch, queryClient, onConcluido],
  );

  const fechar = useCallback(() => {
    if (salvando) return;
    const r = acumulado.current;
    // Depois de um parcial, algo já foi gravado: fechar também conclui.
    if (r.aplicados + r.confirmados + r.semMudanca > 0) concluir(r);
    else onFechar();
  }, [salvando, concluir, onFechar]);

  const salvar = () => {
    if (!itens || salvando) return;
    const corpo = corpoDoPost(itens, estado);
    if (corpo.itens.length + corpo.confirmarIds.length === 0) {
      fechar();
      return;
    }
    setAviso(null);
    setPainel(null);
    setEstado((e) => (Object.keys(e.falhas).length > 0 ? { ...e, falhas: {} } : e));
    aplicar.mutate(corpo, {
      onSuccess: (r) => {
        acumulado.current = somar(acumulado.current, r);
        if (r.parcial && r.erros.length > 0) {
          setEstado((e) => aposParcial(itens, e, r.erros));
          setAviso({ tipo: 'parcial', aplicados: acumulado.current.aplicados, erros: r.erros });
          return;
        }
        concluir(acumulado.current);
      },
      onError: (erro) => {
        if (erro.status === 409 && erro.erros.length > 0) {
          setEstado((e) => comFalhas(e, erro.erros));
          setAviso({ tipo: '409', erros: erro.erros });
        } else {
          setAviso({ tipo: 'erro' });
        }
      },
    });
  };

  // Abertura: trava a rolagem do fundo e leva o foco ao título; devolve ao fechar.
  useEffect(() => {
    const gatilho = document.activeElement as HTMLElement | null;
    const liberar = lockBodyScroll();
    tituloRef.current?.focus();
    return () => {
      liberar();
      if (gatilho && document.contains(gatilho)) gatilho.focus();
    };
  }, []);

  // Esc (painel aberto → fecha o painel e devolve o foco ao botão; senão "Conferir depois") e
  // foco preso. O BottomSheet do celular cuida do próprio Esc.
  const estadoTeclado = useRef({ painel, alvoSheet, fechar });
  useEffect(() => {
    estadoTeclado.current = { painel, alvoSheet, fechar };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const atual = estadoTeclado.current;
      if (atual.alvoSheet) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (atual.painel) {
          const id = atual.painel;
          setPainel(null);
          botoes.current.get(id)?.focus();
        } else {
          atual.fechar();
        }
        return;
      }
      if (event.key !== 'Tab' || !painelRef.current) return;
      const focaveis = Array.from(painelRef.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (event.shiftKey && (ativo === primeiro || !painelRef.current.contains(ativo))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && ativo === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const onEscolher = (item: ItemRevisavel, categoria: CategoriaMovivel, subgrupo: string | null) =>
    setEstado((e) => escolher(e, item, categoria, subgrupo));

  const alternarPainel = (id: string) => {
    if (painel === id) {
      setPainel(null);
      botoes.current.get(id)?.focus();
    } else setPainel(id);
  };

  const usarNoSheet = (escolha: EscolhaItem) => {
    if (!alvoSheet) return;
    const alvos = alvoSheet.tipo === 'item' ? [alvoSheet.item] : alvoSheet.itens;
    setEstado((e) => aplicarLote(alvos, e, escolha));
    setAlvoSheet(null);
  };

  if (typeof document === 'undefined') return null;

  // ── Corpo ──────────────────────────────────────────────────────────────────
  let corpo: React.ReactNode;
  if (!itens && consulta.isError) {
    corpo = (
      <div className="flex flex-col items-start gap-2 py-6 text-sm text-gray-700 dark:text-gray-200">
        <p role="alert">Não foi possível carregar os investimentos.</p>
        <button
          type="button"
          onClick={() => void consulta.refetch()}
          className="min-h-11 font-semibold text-mf-patrimonio underline underline-offset-[3px] dark:text-mf-tranquilidade"
        >
          Tentar de novo
        </button>
      </div>
    );
  } else if (!itens) {
    corpo = (
      <p className="flex items-center gap-2 py-8 text-sm text-gray-600 dark:text-gray-300">
        {SPINNER} Carregando seus investimentos…
      </p>
    );
  } else if (lista.length === 0) {
    corpo = (
      <p className="py-8 text-sm text-gray-700 dark:text-gray-200">
        Nenhum investimento para conferir agora.
      </p>
    );
  } else if (abaixoLg) {
    corpo = (
      <DestinosCartoesMobile
        faixas={faixas}
        estado={estado}
        salvando={salvando}
        onTrocar={(item) =>
          setAlvoSheet({
            tipo: 'item',
            item,
            escolha: estado.escolhas[item.bankInvestmentId] ?? null,
          })
        }
        onTrocarTodos={(faixa) =>
          setAlvoSheet({
            tipo: 'grupo',
            rotulo: faixa.rotulo,
            itens: lista.filter(
              (i): i is ItemRevisavel =>
                ehRevisavel(i) &&
                faixa.revisaveis.includes(i.bankInvestmentId) &&
                !estado.salvos.has(i.bankInvestmentId),
            ),
          })
        }
      />
    );
  } else {
    const nMarcados = marcados(lista, estado.selecionados).length;
    corpo = (
      <>
        <AplicarLoteBarra
          quantidade={nMarcados}
          comuns={destinosDoLote(lista, estado.selecionados)}
          disabled={salvando}
          onAplicar={(escolha) =>
            setEstado((e) => aplicarLote(marcados(lista, e.selecionados), e, escolha))
          }
          onLimpar={() => setEstado(limparSelecao)}
        />
        <div className="sr-only" aria-live="polite">
          {nMarcados > 0 ? plural(nMarcados, 'selecionado', 'selecionados') : ''}
        </div>
        <DestinosTabela
          faixas={faixas}
          estado={estado}
          painelAberto={painel}
          salvando={salvando}
          onAlternarPainel={alternarPainel}
          onAlternarSelecao={(id) => setEstado((e) => alternarSelecao(e, id))}
          onMarcarFaixa={(ids, marcar) => setEstado((e) => marcarVarios(e, ids, marcar))}
          onEscolher={onEscolher}
          onVoltarASugestao={(id) => setEstado((e) => voltarASugestao(e, id))}
          registrarBotao={(id, el) => {
            if (el) botoes.current.set(id, el);
            else botoes.current.delete(id);
          }}
        />
      </>
    );
  }

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  const nomesMudancas = mudancas(lista, estado).map(rotuloItem);
  const outros = Math.max(0, pendentesConfirmar - nMudancas);
  const rotuloPrimario = salvando
    ? 'Salvando…'
    : aviso?.tipo === 'parcial' && nMudancas > 0
      ? `Tentar de novo (${nMudancas})`
      : nMudancas > 0
        ? `Salvar ${plural(nMudancas, 'mudança', 'mudanças')}`
        : pendentesConfirmar > 0
          ? 'Está tudo certo'
          : 'Concluir';

  const alerta = aviso && (
    <div
      role="alert"
      data-mf-destinos-alerta={aviso.tipo}
      className="rounded-[10px] border border-[#D92D20]/40 bg-white px-3 py-2 text-[13px] text-[#B42318] dark:border-[#F97066]/50 dark:bg-transparent dark:text-[#F97066]"
    >
      {aviso.tipo === '409' && (
        <p>
          <b className="font-semibold">Não foi possível salvar.</b> {TEXTO_409}
        </p>
      )}
      {aviso.tipo === 'parcial' && (
        <p>
          <b className="font-semibold">
            {plural(aviso.aplicados, 'investimento', 'investimentos')} no lugar escolhido.
          </b>{' '}
          Não deu para mudar:
        </p>
      )}
      {aviso.tipo === 'erro' && (
        <p>
          <b className="font-semibold">Não foi possível salvar agora.</b> Nenhum investimento mudou
          de lugar. Tente de novo.
        </p>
      )}
      {aviso.tipo !== 'erro' && aviso.erros.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {aviso.erros.map((e) => (
            <li key={e.id}>
              <b className="font-semibold">{e.nome}</b> — {e.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const resumo =
    nMudancas > 0 ? (
      <>
        <b className="font-semibold text-gray-800 dark:text-white/90">
          {plural(nMudancas, 'mudança', 'mudanças')}:
        </b>{' '}
        {nomesMudancas.join(', ')}.
        {outros > 0 && ` ${plural(outros, 'outro fica', 'outros ficam')} como sugerido.`}
      </>
    ) : pendentesConfirmar > 0 ? (
      'Nenhuma mudança. Tudo fica no lugar sugerido.'
    ) : null;

  const botaoPrimario = (
    <button
      type="button"
      onClick={salvar}
      disabled={salvando || !itens}
      aria-busy={salvando || undefined}
      data-mf-destinos-salvar=""
      className={BOTAO_PRIMARIO + (abaixoLg ? ' min-h-12 flex-1 text-base' : '')}
    >
      {salvando && SPINNER}
      {rotuloPrimario}
    </button>
  );
  const botaoSecundario = (
    <button
      type="button"
      onClick={fechar}
      disabled={salvando}
      className={BOTAO_SECUNDARIO + (abaixoLg ? ' min-h-12 flex-1 text-base' : '')}
    >
      Conferir depois
    </button>
  );

  if (abaixoLg) {
    return createPortal(
      <>
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
          aria-describedby={descId}
          data-mf-revisar-destinos="mobile"
          className="fixed inset-0 z-[99980] flex flex-col bg-gray-50 font-outfit dark:bg-[#18181B]"
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-1 pt-[env(safe-area-inset-top)] dark:border-gray-800 dark:bg-[#1F1F22]">
            <button
              type="button"
              onClick={fechar}
              disabled={salvando}
              aria-label="Voltar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:opacity-60 dark:text-gray-200 dark:focus-visible:ring-mf-tranquilidade"
            >
              {ICONE_VOLTAR}
            </button>
            <h2
              id={tituloId}
              ref={tituloRef}
              tabIndex={-1}
              className="min-w-0 flex-1 py-3 pr-3 text-[17px] leading-snug font-semibold text-gray-900 outline-none dark:text-white"
            >
              {TITULO_REVISAO}
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
            <p id={descId} className="text-sm text-gray-700 dark:text-gray-200">
              {SUBTITULO_REVISAO}
            </p>
            {corpo}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] dark:border-gray-800 dark:bg-[#1F1F22]">
            {alerta}
            {resumo && (
              <p className="text-[13px] text-gray-600 dark:text-gray-300" aria-live="polite">
                {resumo}
              </p>
            )}
            <div className="flex gap-2">
              {botaoSecundario}
              {botaoPrimario}
            </div>
          </div>
        </div>
        <DestinoImportadoSheet
          alvo={alvoSheet}
          onFechar={() => setAlvoSheet(null)}
          onUsar={usarNoSheet}
          onVoltarASugestao={(id) => {
            setEstado((e) => voltarASugestao(e, id));
            setAlvoSheet(null);
          }}
        />
      </>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 font-outfit"
      data-mf-revisar-destinos="desktop"
    >
      <div className="fixed inset-0 bg-mf-potencia/45" aria-hidden="true" onClick={fechar} />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descId}
        className="relative flex max-h-[calc(100dvh-32px)] w-[min(980px,100%)] flex-col rounded-[18px] bg-white shadow-xl outline-none dark:bg-[#1F1F22]"
      >
        <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-3">
          <div className="min-w-0 flex-1">
            <h2
              id={tituloId}
              ref={tituloRef}
              tabIndex={-1}
              className="text-xl font-semibold text-gray-900 outline-none dark:text-white"
            >
              {TITULO_REVISAO}
            </h2>
            <p id={descId} className="mt-1 max-w-[720px] text-sm text-gray-700 dark:text-gray-200">
              {SUBTITULO_REVISAO}
            </p>
          </div>
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            aria-label="Fechar e conferir depois"
            className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 outline-none hover:bg-gray-100 focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:opacity-60 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:focus-visible:ring-mf-tranquilidade"
          >
            {ICONE_X}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{corpo}</div>
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-gray-100 px-6 pt-3 pb-4 dark:border-gray-800">
          {alerta}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {resumo && (
              <p
                className="mr-auto min-w-0 flex-1 text-[13px] text-gray-600 dark:text-gray-300"
                aria-live="polite"
              >
                {resumo}
              </p>
            )}
            {botaoSecundario}
            {botaoPrimario}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
