'use client';

/**
 * Barra de salvamento de "Meus cenários" (Bloco D, fatia B) + o aviso flutuante (toast).
 *
 * Status: valores do ativo · alterações não salvas · salvando · salvo em dd/mm às hh:mm · erro
 * (o que foi digitado continua). "Salvar cenário" em navy #314666 (44px; 48px e largura toda no
 * celular). "Restaurar valores do ativo" SEM confirmação (decisão 13): apaga o salvo, volta ao
 * padrão e mostra o aviso com "Desfazer" por 5 s. Consultor agindo: só o texto de rascunho.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BOTAO_PRI } from '@/components/analiseAtivos/ativo/cenarios/ConfirmarObjetivoPlanejamento';
import { FOCO_CENARIOS } from '@/components/analiseAtivos/ativo/cenarios/FormPremissas';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';

const T = TEXTOS_CENARIOS.salvamento;
export const TOAST_CENARIOS_MS = 5_000;

export type StatusSalvamento = 'padrao' | 'naoSalvo' | 'salvando' | 'salvo' | 'erro';

/** 'Salvo em 08/10 às 14:32' no fuso do aparelho. */
export function textoSalvoEm(iso: string | null): string {
  if (!iso) return T.salvoEm;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return T.salvoEm;
  const p = (n: number) => String(n).padStart(2, '0');
  return formatarTexto(T.salvoEm, {
    data: `${p(d.getDate())}/${p(d.getMonth() + 1)}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`,
  });
}

const LINK_BTN = `inline-flex min-h-12 items-center justify-center rounded-xl px-3 text-sm font-medium text-[#396CAA] hover:bg-gray-50 lg:min-h-11 dark:text-[#6E9DC4] dark:hover:bg-white/[0.04] ${FOCO_CENARIOS}`;

interface Props {
  podeSalvar: boolean;
  status: StatusSalvamento;
  salvoEm: string | null;
  /** mensagem do erro ao salvar (409 = limite) */
  mensagemErro: string | null;
  /** há campo inválido (Salvar aponta os campos) */
  camposInvalidos: boolean;
  mostrarRestaurar: boolean;
  onSalvar: () => void;
  onRestaurar: () => void;
}

export default function BarraSalvamento({
  podeSalvar,
  status,
  salvoEm,
  mensagemErro,
  camposInvalidos,
  mostrarRestaurar,
  onSalvar,
  onRestaurar,
}: Props) {
  if (!podeSalvar) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-100 pt-3 text-[13px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px]">
          <rect
            x="5"
            y="10.5"
            width="14"
            height="9.5"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
        {T.rascunhoConsultor}
      </div>
    );
  }
  const texto =
    status === 'salvando'
      ? T.salvando
      : status === 'erro'
        ? (mensagemErro ?? T.erro)
        : status === 'salvo'
          ? textoSalvoEm(salvoEm)
          : status === 'naoSalvo'
            ? T.naoSalvo
            : T.valoresDoAtivo;
  const salvarDesabilitado = status === 'salvando' || status === 'salvo' || status === 'padrao';
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-gray-100 pt-3 dark:border-gray-800"
      data-barra-salvamento={status}
    >
      <span
        role={status === 'erro' ? 'alert' : 'status'}
        className={`inline-flex items-center gap-1.5 text-[13px] ${
          status === 'erro'
            ? 'text-[#D92D20] dark:text-[#F97066]'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {status === 'salvo' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px]">
            <path
              d="M5 12.5l4.2 4.2L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        {texto}
        {camposInvalidos && status !== 'erro' ? (
          <span className="text-[#D92D20] dark:text-[#F97066]">
            {' '}
            {TEXTOS_CENARIOS.validacao.camposMarcados}
          </span>
        ) : null}
      </span>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
        {mostrarRestaurar ? (
          <button
            type="button"
            onClick={onRestaurar}
            className={LINK_BTN}
            data-cenario-restaurar=""
          >
            {T.restaurar}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvarDesabilitado}
          aria-busy={status === 'salvando' || undefined}
          className={`${BOTAO_PRI} w-full sm:w-auto`}
          data-cenario-salvar=""
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
            <path
              d="M5 4h11l3 3v13H5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M8 4v5h7V4M8 20v-6h8v6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {status === 'erro' ? T.tentarNovamente : status === 'salvando' ? T.salvando : T.salvar}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast (restaurar · desfazer; objetivo criado · abrir o Planejamento)
// ---------------------------------------------------------------------------

export interface ToastCenariosDados {
  id: number;
  mensagem: string;
  desfazer?: () => void;
  link?: { rotulo: string; href: string };
}

const BOTAO_TOAST = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2.5 text-sm font-semibold text-white underline-offset-2 hover:underline outline-none focus-visible:ring-[3px] focus-visible:ring-[#6E9DC4]`;

export function ToastCenarios({
  toast,
  onFechar,
}: {
  toast: ToastCenariosDados | null;
  onFechar: () => void;
}) {
  const fechar = useRef(onFechar);
  useEffect(() => {
    fechar.current = onFechar;
  }, [onFechar]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => fechar.current(), TOAST_CENARIOS_MS);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!toast || typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="status"
      data-toast-cenarios=""
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[100000] mx-auto flex max-w-[560px] flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#314666] py-1.5 pr-1.5 pl-4 text-sm text-white shadow-lg lg:bottom-6"
    >
      <span className="min-w-0 flex-1 py-2">{toast.mensagem}</span>
      {toast.desfazer ? (
        <button
          type="button"
          className={BOTAO_TOAST}
          onClick={() => {
            toast.desfazer?.();
            onFechar();
          }}
        >
          {T.desfazer}
        </button>
      ) : null}
      {toast.link ? (
        <a href={toast.link.href} className={BOTAO_TOAST}>
          {toast.link.rotulo}
        </a>
      ) : null}
      <button type="button" className={BOTAO_TOAST} onClick={onFechar}>
        {T.fechar}
      </button>
    </div>,
    document.body,
  );
}
