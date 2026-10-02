/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Stub: só o número com aria-label; a 0b desenha o anel (conic-gradient outside).
 */
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { AnelIndiceProps } from '@/types/analiseAtivosApi';

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

export default function AnelIndice({ valor, estado, tamanho, className }: AnelIndiceProps) {
  const semNumero = valor === null || estado === 'sem_score' || estado === 'fora_do_indice';
  return (
    <span
      role="img"
      aria-label={rotuloAnelIndice(valor, estado)}
      data-stub="AnelIndice"
      data-estado={estado}
      style={{ minWidth: tamanho }}
      className={`inline-flex items-center justify-center tabular-nums text-gray-800 dark:text-white ${className ?? ''}`}
    >
      {semNumero
        ? TEXTOS_TELA.formato.semDado
        : valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}
