'use client';

/**
 * "Adicionar" do Comparador. Computador: slot tracejado (ou botão, no estado vazio) que abre um
 * popover de 340px com a busca da área restrita à classe (a outra classe aparece desabilitada com
 * o motivo; ativo já incluído também) e as sugestões do mesmo segmento. Celular: botão de largura
 * toda que abre um BottomSheet de 86% da altura (useMobileHistoryLayer: "voltar" fecha o sheet).
 * Resultados com 52px; todo controle com 44px.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import BuscaAtivos from '@/components/analiseAtivos/busca/BuscaAtivos';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { useIndiceBusca } from '@/hooks/useAnaliseAtivos';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TS = TEXTOS_COMPARADOR.slots;
const TB = TEXTOS_COMPARADOR.busca;
export const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

export function IconeMais({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function rotuloAdicionar(classe: ClasseQuadro): string {
  return classe === 'fii' ? TS.adicionarFii : TS.adicionarAcao;
}

export interface SlotAdicionarProps {
  classe: ClasseQuadro;
  slots: readonly string[];
  /** até 3 tickers do mesmo segmento/tipo (fora dos slots) */
  sugestoes: readonly string[];
  onAdicionar: (ticker: string) => void;
  /** 'slot' (tracejado, grade), 'botao' (estado vazio, computador) ou 'celular' */
  variante: 'slot' | 'botao' | 'celular';
  celular: boolean;
}

function ListaSugestoes({
  sugestoes,
  nomes,
  onEscolher,
}: {
  sugestoes: readonly string[];
  nomes: Map<string, string>;
  onEscolher: (t: string) => void;
}) {
  if (sugestoes.length === 0) return null;
  return (
    <div className="flex flex-col" role="group" aria-label={TS.sugestoes}>
      <span className="px-2 pt-1.5 pb-0.5 text-xs text-gray-500 dark:text-gray-400">
        {TS.sugestoes}
      </span>
      {sugestoes.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onEscolher(t)}
          data-sugestao={t}
          className={`flex min-h-[52px] items-center gap-2.5 rounded-[10px] px-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] ${FOCO}`}
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[9.5px] font-semibold text-[#314666] dark:bg-white/[0.06] dark:text-[#6E9DC4]"
          >
            {t.slice(0, 4)}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
              {t}
            </span>
            {nomes.get(t) ? (
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                {nomes.get(t)}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function SlotAdicionar({
  classe,
  slots,
  sugestoes,
  onAdicionar,
  variante,
  celular,
}: SlotAdicionarProps) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const indice = useIndiceBusca({ enabled: aberto });
  const nomes = useMemo(
    () => new Map((indice.data?.itens ?? []).map((i) => [i.t, i.n])),
    [indice.data],
  );
  const indisponiveis = useMemo(
    () => Object.fromEntries(slots.map((t) => [t, TB.jaIncluido])),
    [slots],
  );
  const cheio = slots.length >= MAX_ATIVOS_COMPARADOR;
  const rotulo = rotuloAdicionar(classe);

  const escolher = useCallback(
    (t: string) => {
      fecharEntao(() => onAdicionar(t));
    },
    [fecharEntao, onAdicionar],
  );

  // computador: Esc e clique fora fecham o popover
  useEffect(() => {
    if (!aberto || celular) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    const onFora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onFora);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onFora);
    };
  }, [aberto, celular]);

  const busca = (
    <div className="flex flex-col gap-1">
      {cheio ? (
        <p className="px-2 py-2 text-sm text-gray-700 dark:text-gray-300">
          {formatarTexto(TB.cheio, { max: String(MAX_ATIVOS_COMPARADOR) })}
        </p>
      ) : (
        <BuscaAtivos
          variante="compacta"
          embutida
          autoFocus
          classe={classe}
          desabilitarOutraClasse
          indisponiveis={indisponiveis}
          rotulo={classe === 'fii' ? TB.placeholderFii : TB.placeholderAcao}
          placeholder={classe === 'fii' ? TB.placeholderFii : TB.placeholderAcao}
          onSelecionar={escolher}
          semConsulta={<ListaSugestoes sugestoes={sugestoes} nomes={nomes} onEscolher={escolher} />}
        />
      )}
      <span className="px-2 pt-1 pb-0.5 text-xs text-gray-500 dark:text-gray-400">
        {classe === 'fii' ? TB.soFiis : TB.soAcoes}
      </span>
    </div>
  );

  const contagem = formatarTexto(TS.contagem, {
    n: String(slots.length),
    max: String(MAX_ATIVOS_COMPARADOR),
  });

  const gatilho =
    variante === 'celular' ? (
      <button
        ref={botao}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-[15px] font-semibold text-[#396CAA] dark:border-gray-700 dark:bg-white/[0.03] dark:text-[#6E9DC4] ${FOCO}`}
      >
        <IconeMais />
        {slots.length > 0 ? `${rotulo} ${contagem}` : rotulo}
      </button>
    ) : variante === 'botao' ? (
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#396CAA] px-4 text-sm font-semibold text-white hover:bg-[#314666] ${FOCO}`}
      >
        <IconeMais />
        {rotulo}
      </button>
    ) : (
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[14.5px] font-semibold text-[#396CAA] dark:text-[#6E9DC4] ${FOCO}`}
      >
        <IconeMais />
        {rotulo}
      </button>
    );

  if (celular) {
    return (
      <>
        {gatilho}
        <BottomSheet isOpen={aberto} onClose={fechar} title={rotulo} className="h-[86dvh]">
          {busca}
        </BottomSheet>
      </>
    );
  }

  const popover = aberto ? (
    <div
      role="dialog"
      aria-label={rotulo}
      className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[340px] max-w-[calc(100vw-48px)] flex-col rounded-[14px] border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-[#1F1F22]"
    >
      {busca}
    </div>
  ) : null;

  if (variante === 'botao') {
    return (
      <div ref={raiz} className="relative max-w-[420px]">
        {gatilho}
        {popover}
      </div>
    );
  }

  return (
    <div
      ref={raiz}
      data-slot-adicionar=""
      className="relative flex min-h-[118px] min-w-0 flex-col items-start justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-gray-400 p-3 dark:border-gray-500"
    >
      {gatilho}
      {sugestoes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={TS.sugestoes}>
          {sugestoes.map((t) => (
            <button
              key={t}
              type="button"
              data-sugestao={t}
              onClick={() => onAdicionar(t)}
              className={`inline-flex min-h-11 items-center rounded-full border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 ${FOCO}`}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {formatarTexto(TS.vagas, {
          n: String(MAX_ATIVOS_COMPARADOR - slots.length),
          max: String(MAX_ATIVOS_COMPARADOR),
        })}
      </span>
      {popover}
    </div>
  );
}
