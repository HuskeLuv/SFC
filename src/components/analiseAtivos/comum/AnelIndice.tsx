/**
 * Anel do Índice MF (fatia 0b; decisão 1 do Wellington): uma cor só (outside #0079F2, elemento
 * não textual), arco proporcional a 0–10 e número no centro (gray-800 / branco).
 * - calculado: trilho sólido + arco;
 * - incompleto: trilho TRACEJADO + arco (forma própria; o texto vem do aria-label e do selo);
 * - zero_regra: anel normal (trilho sólido), número baixo — não é dado faltante;
 * - sem_score / fora_do_indice: só o trilho tracejado, sem arco, com '—' no centro.
 * Sempre role="img" com aria-label completo (rotuloAnelIndice).
 */
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { AnelIndiceProps, TamanhoAnel } from '@/types/analiseAtivosApi';

export type { AnelIndiceProps };

export function rotuloAnelIndice(valor: number | null, estado: AnelIndiceProps['estado']): string {
  const t = TEXTOS_TELA.indice;
  const v = valor === null ? '' : valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (estado === 'sem_score') return t.ariaSemScore;
  if (estado === 'fora_do_indice') return t.ariaForaDoIndice;
  if (valor === null) return t.ariaSemScore;
  if (estado === 'incompleto') return formatarTexto(t.ariaIncompleto, { valor: v });
  if (estado === 'zero_regra') return formatarTexto(t.ariaZeroRegra, { valor: v });
  return formatarTexto(t.ariaCalculado, { valor: v });
}

/** Espessura do arco e tamanho do número por tamanho do anel. */
const MEDIDAS: Record<TamanhoAnel, { traco: number; fonte: string }> = {
  32: { traco: 3.5, fonte: 'text-[11px]' },
  40: { traco: 4, fonte: 'text-[13px]' },
  96: { traco: 8, fonte: 'text-[28px]' },
};

/**
 * Incompleto: o próprio arco também sai em segmentos (traço/vão), para a forma ser distinta do
 * calculado mesmo nos anéis de 32/40px, onde o arco cobre quase todo o trilho.
 */
export function arcoSegmentado(arco: number, circunferencia: number, tamanho: TamanhoAnel): string {
  const segmento = tamanho === 96 ? 9 : 4;
  const vao = tamanho === 96 ? 4 : 2.2;
  const partes: number[] = [];
  let usado = 0;
  while (usado + segmento < arco) {
    partes.push(segmento, vao);
    usado += segmento + vao;
  }
  partes.push(Math.max(0, arco - usado), circunferencia);
  return partes.map((n) => Number(n.toFixed(2))).join(' ');
}

export default function AnelIndice({ valor, estado, tamanho, className }: AnelIndiceProps) {
  const semNumero = valor === null || estado === 'sem_score' || estado === 'fora_do_indice';
  const { traco, fonte } = MEDIDAS[tamanho] ?? MEDIDAS[40];
  const centro = tamanho / 2;
  const raio = centro - traco / 2 - 0.5;
  const circunferencia = 2 * Math.PI * raio;
  const fracao = semNumero ? 0 : Math.max(0, Math.min(10, valor)) / 10;
  // Valor > 0 sempre mostra um arco mínimo visível (ex.: AURE3 0,1 pela regra).
  const arco = fracao > 0 ? Math.max(fracao * circunferencia, traco) : 0;
  const tracejado = semNumero || estado === 'incompleto';
  const incompleto = !semNumero && estado === 'incompleto';
  const numero = semNumero
    ? TEXTOS_TELA.formato.semDado
    : valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <span
      role="img"
      aria-label={rotuloAnelIndice(valor, estado)}
      data-estado={estado}
      data-tracejado={tracejado ? 'true' : 'false'}
      style={{ width: tamanho, height: tamanho }}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
    >
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        aria-hidden="true"
        className="absolute inset-0"
      >
        {tracejado ? (
          <circle
            data-trilho="tracejado"
            cx={centro}
            cy={centro}
            r={raio}
            fill="none"
            strokeWidth={tamanho === 96 ? 2 : 1.5}
            strokeDasharray={tamanho === 96 ? '5 4' : '3 3'}
            className="stroke-gray-400 dark:stroke-gray-500"
          />
        ) : (
          <circle
            data-trilho="solido"
            cx={centro}
            cy={centro}
            r={raio}
            fill="none"
            strokeWidth={traco}
            className="stroke-gray-200 dark:stroke-[#2E3440]"
          />
        )}
        {arco > 0 ? (
          <circle
            data-arco=""
            cx={centro}
            cy={centro}
            r={raio}
            fill="none"
            strokeWidth={traco}
            strokeLinecap={incompleto ? 'butt' : 'round'}
            strokeDasharray={
              incompleto
                ? arcoSegmentado(arco, circunferencia, tamanho)
                : `${arco} ${circunferencia}`
            }
            transform={`rotate(-90 ${centro} ${centro})`}
            className="stroke-[#0079F2]"
          />
        ) : null}
      </svg>
      <span
        aria-hidden="true"
        className={`relative leading-none font-semibold tabular-nums ${fonte} ${
          semNumero ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-white'
        }`}
      >
        {numero}
      </span>
    </span>
  );
}
