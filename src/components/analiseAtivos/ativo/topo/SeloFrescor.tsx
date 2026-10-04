'use client';

/**
 * Selo de frescor (fatia B): 'Dados: cotação B3 de 29/09 · CVM DFP 2025 / ITR 2T26 · informe FII
 * ago/26'. Camada atrasada no painel da Fase 0: ícone + texto 'atualização em atraso' (nunca só
 * cor).
 *
 * Bloco C (fatia B): `SeloFrescorBloco` = selo POR BLOCO no rodapé de cada card (12px, app-muted,
 * linha fina acima, relógio 14px): 'Fonte · referência'; atrasado = triângulo + 'atualização em
 * atraso' (app-strong 600) + o documento esperado. `RodapeFrescorBloco` lê o frescor do bloco do
 * contexto da página (só existe com params v2) e, com o relato ligado, as linhas "Você reportou"
 * do bloco (LinhasVoceReportou, fatia D; uma só consulta por ticker, dividida entre os blocos).
 */
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { LinhasVoceReportou } from '@/components/analiseAtivos/reporte/MeusRelatos';
import type { BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { FrescorBloco, SeloFrescorProps } from '@/types/analiseAtivosApi';

export type { SeloFrescorProps };

export default function SeloFrescor({ frescor }: SeloFrescorProps) {
  const partes = [frescor.cotacao, frescor.fundamentos, frescor.fii].filter(
    (p): p is string => !!p,
  );
  return (
    <p
      data-bloco="frescor"
      data-atrasado={frescor.painelAtrasado || undefined}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>
        {TEXTOS_TELA.blocos.frescor}: {partes.join(' · ')}
      </span>
      {frescor.painelAtrasado ? (
        <span className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3 2 21h20L12 3z" />
            <path d="M12 10v5M12 18h.01" />
          </svg>
          {TEXTOS_TELA.ativo.frescorAtrasado}
        </span>
      ) : null}
    </p>
  );
}

function Relogio() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Triangulo() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0"
    >
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5M12 18h.01" />
    </svg>
  );
}

export function SeloFrescorBloco({ frescor }: { frescor: FrescorBloco }) {
  const t = TEXTOS_TELA.conferencia.frescor;
  const atrasado = frescor.status === 'atrasado';
  const partes = [
    frescor.fonte,
    frescor.referencia ?? (frescor.status === 'sem_dado' ? t.semDado : null),
  ]
    .filter((p): p is string => !!p)
    .join(' · ');
  return (
    <p
      data-frescor-bloco={frescor.status}
      aria-label={TEXTOS_TELA.telaConferencia.rodapeAria}
      className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-gray-100 pt-2.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"
    >
      <span className="inline-flex items-center gap-1.5">
        {atrasado ? <Triangulo /> : <Relogio />}
        <span>{partes}</span>
      </span>
      {atrasado ? (
        <span className="inline-flex flex-wrap items-center gap-x-1">
          <span className="font-semibold text-gray-800 dark:text-white/90">{t.atrasado}</span>
          {frescor.documentoEsperado ? (
            <span>
              ({formatarTexto(t.documentoEsperado, { valor: frescor.documentoEsperado })})
            </span>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}

/** Selo de frescor do bloco (contexto da página); nada sem frescor por bloco (params v1). */
export function RodapeFrescorBloco({ bloco }: { bloco: BlocoReporte }) {
  const ctx = useConferenciaPagina();
  const frescor = ctx?.frescorBlocos?.[bloco];
  const relatos = ctx?.reporteHabilitado ? (
    <LinhasVoceReportou ticker={ctx.ticker} bloco={bloco} habilitado />
  ) : null;
  if (!frescor) return relatos;
  return (
    <>
      {relatos}
      <SeloFrescorBloco frescor={frescor} />
    </>
  );
}
