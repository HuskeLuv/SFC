'use client';

/**
 * Estados da página Salvos (bloco 1, fatia C): sem listas, lista vazia, lista sem ativos da classe
 * (atalho para a outra aba), modo consultor e erro com "Tentar de novo". A cópia vem de
 * textosSalvos.pagina; aqui só a moldura (ícone num quadrado tingido, título, texto e ações).
 * Também o esqueleto do carregando (chips + linhas), com aria-busy.
 */
import type { ReactNode } from 'react';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Secundário de 44px dos estados (Ir para o Quadro, Ver FIIs…). */
export const BOTAO_SECUNDARIO_SALVOS = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;

export function IconeMarcador({ className = '' }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 4h12v16l-6-4-6 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface EstadoVazioSalvosProps {
  titulo: string;
  texto?: ReactNode;
  acoes?: ReactNode;
  /** compacto: dentro da aba (lista vazia, sem ativos da classe) */
  compacto?: boolean;
  /** identifica o estado (testes/e2e) */
  estado: string;
}

export default function EstadoVazioSalvos({
  titulo,
  texto,
  acoes,
  compacto = false,
  estado,
}: EstadoVazioSalvosProps) {
  return (
    <div
      data-salvos-estado={estado}
      className={`flex flex-col items-center gap-2.5 text-center ${compacto ? 'px-4 py-7' : 'px-4 py-11'}`}
    >
      <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-[#396CAA]/10 text-[#314666] dark:bg-[#396CAA]/[0.18] dark:text-[#6E9DC4]">
        <IconeMarcador />
      </span>
      <h3 className="mt-1 text-base font-semibold text-balance text-gray-800 dark:text-white/90">
        {titulo}
      </h3>
      {texto ? (
        <p className="max-w-[56ch] text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {texto}
        </p>
      ) : null}
      {acoes ? <div className="mt-1.5 flex flex-wrap justify-center gap-2">{acoes}</div> : null}
    </div>
  );
}

/** Falha ao carregar (role=alert) com "Tentar de novo". */
export function ErroSalvos({ onTentar }: { onTentar: () => void }) {
  const t = TEXTOS_SALVOS.pagina.erro;
  return (
    <div
      role="alert"
      data-salvos-estado="erro"
      className="flex items-start gap-3 rounded-2xl border border-[#D92D20]/30 bg-[#D92D20]/[0.04] p-4 dark:border-[#F97066]/30 dark:bg-[#F97066]/[0.06]"
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#D92D20] text-sm font-bold text-white dark:bg-[#F97066] dark:text-gray-900"
      >
        !
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{t.titulo}</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t.texto}</p>
        <button type="button" onClick={onTentar} className={`${BOTAO_SECUNDARIO_SALVOS} mt-3`}>
          {t.tentar}
        </button>
      </div>
    </div>
  );
}

const SKEL = 'animate-pulse rounded-[10px] bg-gray-100 dark:bg-white/[0.06]';

/** Carregando: 3 chips + n linhas. */
export function EsqueletoSalvos({ linhas = 5 }: { linhas?: number }) {
  return (
    <div
      aria-busy="true"
      data-salvos-estado="carregando"
      className="flex flex-col gap-3"
      aria-label={TEXTOS_SALVOS.pagina.carregando}
      role="status"
    >
      <div className="flex gap-2">
        {[120, 96, 140].map((w) => (
          <span key={w} className={`${SKEL} h-11`} style={{ width: w }} />
        ))}
      </div>
      <span className={`${SKEL} h-6 w-48`} />
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className={`${SKEL} h-12 w-full`} />
      ))}
    </div>
  );
}
