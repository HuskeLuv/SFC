import React from 'react';
import { twMerge } from 'tailwind-merge';
import type { MovidoBadgeProps } from '@/types/carteiraMover';

/** dd/mm/aaaa no fuso de São Paulo (a data vem do UserChangeLog, em ISO). */
export function formatarDataMovido(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

/** "movido por você em 01/10/2026" / "movido pelo consultor em …" / "Movido para cá manualmente". */
export function textoMovido({
  movidoEm,
  viaConsultor,
}: Pick<MovidoBadgeProps, 'movidoEm' | 'viaConsultor'>): string {
  const data = formatarDataMovido(movidoEm);
  if (!data) return 'Movido para cá manualmente';
  return `movido ${viaConsultor ? 'pelo consultor' : 'por você'} em ${data}`;
}

const ICONE_MOVIDO = (
  <svg className="h-[11px] w-[11px] shrink-0" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9.5 2.5 13 6l-3.5 3.5-1-1L10.3 6.7H6a2.5 2.5 0 0 0 0 5h1V13H6a3.75 3.75 0 0 1 0-7.5h4.3L8.5 3.5l1-1Z"
    />
  </svg>
);

/**
 * Selo "movido" (só troca de ABA — decisão 10): tranquilidade a 18% com texto segurança
 * (escuro: 14% com texto escolha). A data e o autor vêm do Histórico de alterações; o texto
 * completo vai no tooltip e no leitor de tela. Em linha planejada, o contorno é tracejado.
 */
export function MovidoBadge({
  movidoEm,
  viaConsultor,
  planejado,
  className,
}: MovidoBadgeProps & { className?: string }) {
  const texto = textoMovido({ movidoEm, viaConsultor });
  return (
    <span
      title={texto.charAt(0).toUpperCase() + texto.slice(1)}
      data-mf-movido=""
      className={twMerge(
        'inline-flex items-center gap-1 rounded-full border border-transparent bg-mf-tranquilidade/[0.18] px-[7px] py-px text-[11px] leading-4 font-medium whitespace-nowrap text-mf-seguranca dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha',
        planejado && 'border-dashed border-mf-tranquilidade',
        className,
      )}
    >
      {ICONE_MOVIDO}
      movido
      <span className="sr-only">, {texto}</span>
    </span>
  );
}

/**
 * Selo "Soltar aqui" da faixa de seção durante o arrasto (Fatia E): fundo segurança e texto
 * branco (10:1) — sobre a faixa tranquilidade, branco puro dava 2,9:1.
 */
export function SoltarAquiChip({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={twMerge(
        'ml-2 inline-flex items-center rounded-full bg-mf-seguranca px-2 py-px text-[11px] font-semibold text-white',
        className,
      )}
    >
      Soltar aqui
    </span>
  );
}

export default MovidoBadge;
