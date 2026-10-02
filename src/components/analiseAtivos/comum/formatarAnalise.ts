/**
 * Formatação numérica da Análise de Ativos (fatia 0b). pt-BR, sinal tipográfico '−' (U+2212),
 * '×' nos múltiplos, '%' e 'p.p.', R$ compacto (mil/mi/bi). Use com `tabular-nums` na célula.
 *
 * Regras:
 * - zero arredondado nunca leva sinal ('0,0×', não '−0,0×');
 * - moeda negativa: o sinal vem antes do 'R$' ('−R$ 1,2 bi');
 * - não finito (NaN/Infinity) = '—'.
 */
import type { Estado, FormatoAnalise } from '@/types/analiseAtivosApi';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

export const MENOS = '−';

/** Valor absoluto formatado (sem sinal) e se o arredondado é zero. */
function absoluto(valor: number, min: number, max: number): { texto: string; zero: boolean } {
  const texto = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
  const zero = Number(texto.replace(/\./g, '').replace(',', '.')) === 0;
  return { texto, zero };
}

/** Número com '−' quando negativo (zero arredondado sem sinal). */
function num(valor: number, min: number, max: number): string {
  const { texto, zero } = absoluto(valor, min, max);
  return valor < 0 && !zero ? `${MENOS}${texto}` : texto;
}

/** Número sempre com sinal ('+4,3' / '−0,4'); zero arredondado sem sinal. */
function comSinal(valor: number, casas: number): string {
  const { texto, zero } = absoluto(valor, casas, casas);
  if (zero) return texto;
  return valor > 0 ? `+${texto}` : `${MENOS}${texto}`;
}

function moeda(valor: number, corpo: string, zero: boolean): string {
  return valor < 0 && !zero ? `${MENOS}R$ ${corpo}` : `R$ ${corpo}`;
}

function moedaCompacta(valor: number): string {
  const abs = Math.abs(valor);
  const escalas: Array<[number, string]> = [
    [1e9, 'bi'],
    [1e6, 'mi'],
    [1e3, 'mil'],
  ];
  for (const [base, sufixo] of escalas) {
    if (abs >= base) {
      const { texto, zero } = absoluto(valor / base, 1, 1);
      return `${moeda(valor, texto, zero)} ${sufixo}`;
    }
  }
  const { texto, zero } = absoluto(valor, 2, 2);
  return moeda(valor, texto, zero);
}

/** Número formatado pt-BR com o sinal tipográfico '−' (ex.: '−0,4×', '3,98%', '+4,3 p.p.'). */
export function formatarAnalise(valor: number, formato: FormatoAnalise): string {
  if (!Number.isFinite(valor)) return TEXTOS_TELA.formato.semDado;
  switch (formato) {
    case 'numero':
      return num(valor, 1, 1);
    case 'numero2':
      return num(valor, 2, 2);
    case 'inteiro':
      return num(valor, 0, 0);
    case 'pct':
      return `${num(valor, 1, 2)}%`;
    case 'pctSinal':
      return `${comSinal(valor, 1)}%`;
    case 'pp':
      return `${comSinal(valor, 1)} p.p.`;
    case 'multiplo':
      return `${num(valor, 1, 1)}×`;
    case 'moeda': {
      const { texto, zero } = absoluto(valor, 2, 2);
      return moeda(valor, texto, zero);
    }
    case 'moedaCompacta':
      return moedaCompacta(valor);
    case 'moedaMi':
      return num(valor, 0, 0);
    default:
      return num(valor, 1, 2);
  }
}

/** Estado<number> → texto: ok formatado; ausente '—'; não se aplica 'n/a'. */
export function formatarEstado(valor: Estado<number>, formato: FormatoAnalise): string {
  if (valor.estado === 'ok') return formatarAnalise(valor.valor, formato);
  return valor.estado === 'ausente' ? TEXTOS_TELA.formato.semDado : TEXTOS_TELA.formato.naoSeAplica;
}
