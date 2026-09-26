/**
 * Cor do valor da coluna "Quanto Falta" nas abas da carteira (pedido do
 * Wellington, 16/09/2026):
 *   ≥ 1%            → azul `outside` (falta comprar; mesma convenção de valor
 *                     positivo do Fluxo de Caixa)
 *   entre 0% e 1%   → âmbar (quase no objetivo)
 *   < 0%            → vermelho (acima do objetivo)
 *   exatamente 0%   → sem cor (no objetivo)
 * Azul e vermelho seguem `VALUE_POSITIVE_CLASS`/`VALUE_NEGATIVE_CLASS`; o
 * âmbar é semântico (fora da paleta, como o verde/vermelho já aceitos).
 */
export function quantoFaltaClass(valor: number | null | undefined): string {
  const v = Number(valor);
  if (!Number.isFinite(v) || v === 0) return '';
  if (v >= 1) return 'text-[#0079F2] dark:text-[#80BCF8]';
  if (v > 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export type QuantoFaltaMobileLabel = 'Falta' | 'Acima' | 'No objetivo' | '—';
export type QuantoFaltaMobileTone = 'falta' | 'quase' | 'acima' | 'ok' | 'none';

export interface QuantoFaltaMobile {
  /** Palavra da pílula: a cor nunca é o único sinal. */
  label: QuantoFaltaMobileLabel;
  tone: QuantoFaltaMobileTone;
  /** Cor do TEXTO (AA no claro e no escuro). */
  textClass: string;
  /** Cor do PONTO (elemento não textual: aqui vale o #0079F2). */
  dotClass: string;
}

/**
 * "Quanto Falta" no celular (PWA fase 1): pílula com ponto colorido + texto AA com a palavra.
 * Mesmas faixas de `quantoFaltaClass` (arredondado a 2 casas, como é exibido):
 *   ≥ 1%          → 'Falta', texto patrimônio/tranquilidade, ponto #0079F2;
 *   entre 0 e 1%  → 'Falta', âmbar-700 #B45309 (claro) / amber-300 (escuro), ponto âmbar;
 *   < 0%          → 'Acima', vermelho semântico #D92D20 / #F97066;
 *   0%            → 'No objetivo', neutro.
 * Valor ausente → '—'. `quantoFaltaClass` (desktop) não muda nesta fase.
 */
export function quantoFaltaMobile(valor: number | null | undefined): QuantoFaltaMobile {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
    return {
      label: '—',
      tone: 'none',
      textClass: 'text-gray-500 dark:text-gray-400',
      dotClass: 'bg-gray-300 dark:bg-gray-600',
    };
  }
  const v = Math.round(Number(valor) * 100) / 100;
  if (v === 0) {
    return {
      label: 'No objetivo',
      tone: 'ok',
      textClass: 'text-gray-700 dark:text-gray-200',
      dotClass: 'bg-gray-400 dark:bg-gray-500',
    };
  }
  if (v >= 1) {
    return {
      label: 'Falta',
      tone: 'falta',
      textClass: 'text-mf-patrimonio dark:text-mf-tranquilidade',
      dotClass: 'bg-[#0079F2]',
    };
  }
  if (v > 0) {
    return {
      label: 'Falta',
      tone: 'quase',
      textClass: 'text-[#B45309] dark:text-amber-300',
      dotClass: 'bg-[#D97706] dark:bg-[#FBBF24]',
    };
  }
  return {
    label: 'Acima',
    tone: 'acima',
    textClass: 'text-[#D92D20] dark:text-[#F97066]',
    dotClass: 'bg-[#D92D20] dark:bg-[#F97066]',
  };
}

/** Nome usado nas decisões/protótipo da fase 1 (mesma função). */
export const quantoFaltaMobileClass = quantoFaltaMobile;
