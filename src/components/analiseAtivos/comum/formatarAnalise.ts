/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Versão mínima funcional; a 0b fecha os casos (ver testes da spec).
 */
import type { Estado, FormatoAnalise } from '@/types/analiseAtivosApi';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

const MENOS = '\u2212';

function num(valor: number, min: number, max: number): string {
  return valor
    .toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
    .replace('-', MENOS);
}

function comSinal(valor: number, casas: number): string {
  const s = num(Math.abs(valor), casas, casas);
  if (valor > 0) return `+${s}`;
  if (valor < 0) return `${MENOS}${s}`;
  return s;
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
    case 'moeda':
      return `R$ ${num(valor, 2, 2)}`;
    case 'moedaCompacta': {
      const abs = Math.abs(valor);
      if (abs >= 1e9) return `R$ ${num(valor / 1e9, 1, 1)} bi`;
      if (abs >= 1e6) return `R$ ${num(valor / 1e6, 1, 1)} mi`;
      if (abs >= 1e3) return `R$ ${num(valor / 1e3, 1, 1)} mil`;
      return `R$ ${num(valor, 2, 2)}`;
    }
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
