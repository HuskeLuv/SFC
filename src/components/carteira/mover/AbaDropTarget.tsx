'use client';
import React from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import {
  CATEGORIAS_CAIXA_RF,
  CATEGORIAS_MOVIVEIS,
  MOTIVO_EM_DOLAR,
  MOTIVO_EM_REAIS,
  MOTIVO_EM_VALIDACAO,
  MOTIVO_SALDO_SEM_TITULO,
  MOTIVO_SEM_COTACAO,
  SUBGRUPOS_POR_CATEGORIA,
  isCategoriaCaixaRf,
  rotuloCategoria,
  type CategoriaMovivel,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import type { MoverAlvo } from '@/types/carteiraMover';
import { useMoverOpcoes } from '@/hooks/useMoverOpcoes';
import { abaDropId, type AbaDropData } from './CarteiraDnd';

/**
 * Bandeja "Outra aba" (decisão 1 do Wellington, 01/10/2026): aparece fixa no rodapé da viewport
 * só enquanto dura o arrasto (e enquanto o popover de seção está aberto, que se ancora no chip).
 * Substitui a barra de abas como alvo — ela rola, corta abas e some com a tabela rolada.
 *
 * Um chip por aba movível diferente da atual: compatível com contorno tracejado `outside`; sob o
 * ponteiro, contorno sólido + tinta 16%; recusado com cadeado e o motivo curto (e o motivo
 * inteiro para o leitor de tela). A compatibilidade vem do `useMoverOpcoes` (Fatia D), que o
 * início do arrasto já dispara; até chegar, os chips aceitam o soltar e o servidor valida.
 *
 * Fase 2 (decisão 4 do Wellington, 02/10/2026): item de Reserva ou Renda Fixa mostra SÓ as
 * outras abas do trio (sem chip travado de bolsa/fundos — o motivo delas fica no diálogo). Só a
 * Renda Fixa de um saldo em conta aparece travada, com o motivo próprio. O detalhe do chip diz
 * "entra em <seção>"/"seção automática" (RF) ou "sem seções" (Reservas). Itens de bolsa e fundos
 * continuam IDÊNTICOS à fase 1.
 */

const MOTIVO_CURTO: Record<string, string> = {
  [MOTIVO_EM_DOLAR]: 'em dólar',
  [MOTIVO_EM_REAIS]: 'em reais',
  [MOTIVO_SEM_COTACAO]: 'sem cotação',
  [MOTIVO_EM_VALIDACAO]: 'em validação',
  [MOTIVO_SALDO_SEM_TITULO]: 'saldo não é título',
};

export const motivoCurto = (motivo: string | undefined): string =>
  (motivo && MOTIVO_CURTO[motivo]) || 'indisponível';

export interface ChipAba {
  categoria: CategoriaMovivel;
  label: string;
  permitido: boolean | null;
  motivo?: string;
  /** Fase 2: texto fixo do detalhe ("entra em Pós-fixada", "sem seções"). Ausente = fase 1. */
  detalhe?: string;
}

/** Detalhe do chip do trio: nunca "0 seções". */
const detalheCaixaRf = (
  categoria: CategoriaMovivel,
  opcoes: Pick<MoverOpcoesResponse, 'destinos'> | undefined,
): string => {
  if (categoria !== 'rendaFixaFundos') return 'sem seções';
  const secao = opcoes?.destinos.find((d) => d.categoria === categoria)?.secaoAutomatica;
  return secao ? `entra em ${secao.label}` : 'seção automática';
};

/** Chips da bandeja: abas aceitas (ou ainda sem resposta) primeiro, recusadas no fim. */
export function chipsDaBandeja(
  atual: CategoriaMovivel,
  opcoes: Pick<MoverOpcoesResponse, 'destinos'> | undefined,
): ChipAba[] {
  const caixaRf = isCategoriaCaixaRf(atual);
  const lista: readonly CategoriaMovivel[] = caixaRf ? CATEGORIAS_CAIXA_RF : CATEGORIAS_MOVIVEIS;
  const chips = lista
    .filter((c) => c !== atual)
    .map((categoria): ChipAba => {
      const d = opcoes?.destinos.find((x) => x.categoria === categoria);
      return {
        categoria,
        label: rotuloCategoria(categoria),
        permitido: d ? d.permitido : null,
        motivo: d && !d.permitido ? d.motivo : undefined,
        ...(caixaRf ? { detalhe: detalheCaixaRf(categoria, opcoes) } : {}),
      };
    });
  return [
    ...chips.filter((c) => c.permitido !== false),
    ...chips.filter((c) => c.permitido === false),
  ];
}

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export function AbaDropTarget({ chip, carregando }: { chip: ChipAba; carregando: boolean }) {
  const data: AbaDropData = {
    kind: 'aba',
    categoria: chip.categoria,
    label: chip.label,
    permitido: chip.permitido,
    motivo: chip.motivo,
  };
  const { setNodeRef, isOver } = useDroppable({ id: abaDropId(chip.categoria), data });
  const recusado = chip.permitido === false;
  const base =
    'inline-flex min-h-12 min-w-[104px] flex-col justify-center rounded-[10px] px-3.5 py-1 text-left text-sm leading-tight';
  const estilo = recusado
    ? isOver
      ? 'border-2 border-[#D92D20] bg-[#D92D20]/[0.08] font-medium text-gray-800 dark:border-[#F97066] dark:bg-[#F97066]/10 dark:text-gray-100'
      : 'cursor-not-allowed border border-gray-200 bg-gray-50 font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400'
    : isOver
      ? 'border-2 border-solid border-[#0079F2] bg-[#0079F2]/[0.16] font-semibold text-gray-800 dark:border-mf-tranquilidade dark:bg-[#0079F2]/[0.26] dark:text-gray-100'
      : 'border-[1.5px] border-dashed border-[#0079F2] bg-white font-semibold text-gray-800 dark:border-mf-tranquilidade dark:bg-gray-900 dark:text-gray-100';
  const detalhe = recusado
    ? motivoCurto(chip.motivo)
    : chip.permitido === null && carregando
      ? 'verificando…'
      : (chip.detalhe ?? `${SUBGRUPOS_POR_CATEGORIA[chip.categoria].length} seções`);
  return (
    <div
      ref={setNodeRef}
      data-aba-drop={chip.categoria}
      data-recusado={recusado ? 'true' : undefined}
      aria-disabled={recusado || undefined}
      className={`${base} ${estilo}`}
    >
      <span className="inline-flex items-center gap-1.5">
        {recusado ? <LockIcon /> : null}
        {chip.label}
        {recusado ? (
          <span className="sr-only">, indisponível: {chip.motivo ?? 'não aceita este ativo'}</span>
        ) : null}
      </span>
      <small
        className={`text-[11.5px] font-normal ${chip.detalhe !== undefined ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
        aria-hidden
      >
        {detalhe}
      </small>
    </div>
  );
}

interface BandejaOutraAbaProps {
  alvo: MoverAlvo;
  /** Centro horizontal da área de conteúdo (a bandeja centraliza nele; null = viewport). */
  centroX: number | null;
  /** false = arrasto acabou e só o popover segura a bandeja (sem a dica de arrasto). */
  arrastando: boolean;
}

export function BandejaOutraAba({ alvo, centroX, arrastando }: BandejaOutraAbaProps) {
  const { data, isLoading } = useMoverOpcoes(alvo.tipo, alvo.id);
  const chips = chipsDaBandeja(alvo.categoria, data);
  // Fase 2: RF e Reservas não têm seção como alvo — solta-se só nas abas.
  const dica = isCategoriaCaixaRf(alvo.categoria)
    ? `${alvo.categoria === 'rendaFixaFundos' ? 'A seção vem do título. ' : ''}Solte numa aba. Esc cancela.`
    : 'Solte numa seção da tabela ou numa aba abaixo. Esc cancela.';
  if (typeof document === 'undefined') return null;
  // Faixa simétrica em volta de centroX (até a borda mais próxima): a bandeja centraliza na área
  // de conteúdo sem ser espremida pela borda direita.
  const vw = window.innerWidth;
  const c = centroX ?? vw / 2;
  const faixa = { left: Math.max(0, 2 * c - vw) + 12, right: Math.max(0, vw - 2 * c) + 12 };
  return createPortal(
    <div
      className="pointer-events-none fixed bottom-[calc(14px+env(safe-area-inset-bottom))] z-[90] flex justify-center"
      style={faixa}
      data-mover-bandeja=""
    >
      <div
        role="group"
        aria-label="Mover para outra aba"
        className="pointer-events-auto flex flex-col gap-2 rounded-[14px] border border-gray-200 bg-white px-3 pt-2.5 pb-3 shadow-[0_12px_32px_rgba(45,45,45,0.18)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      >
        <div className="flex justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <b className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100">Outra aba</b>
          {arrastando ? (
            <span
              className={
                isCategoriaCaixaRf(alvo.categoria) ? 'text-gray-600 dark:text-gray-300' : undefined
              }
            >
              {dica}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <AbaDropTarget key={chip.categoria} chip={chip} carregando={isLoading} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
