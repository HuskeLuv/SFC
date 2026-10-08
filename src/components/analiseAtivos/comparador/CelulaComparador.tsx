'use client';

/**
 * Célula de um critério × ativo do Comparador (tabela e cartões).
 * - ★ (decisão: nunca só cor): fundo #EDF2F8 (escuro: patrimonio a 22%) + filete de 3px + ícone de
 *   14px + o texto "destaque" + sr-only "destaque: valor numericamente mais favorável";
 * - conferência: 'ocultar' = '—' + chip; 'selo' = valor + chip; hachura; nunca ★;
 * - n/a (misto, financeira) em cinza; negativo em #D92D20 / #F97066;
 * - selos "fonte CVM" e "critério provisório" sob o valor quando a linha os pede.
 */
import { Fragment, type ReactNode } from 'react';
import ChipConferencia, { HACHURA } from '@/components/analiseAtivos/comum/ChipConferencia';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTO_NEGATIVO } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { LinhaComparador } from '@/types/analiseAtivosBlocoD';

const TC = TEXTOS_COMPARADOR;

/** Fundo + filete do ★ (tabela: filete à esquerda; cartão: no topo). */
export const FUNDO_DESTAQUE = 'bg-[#EDF2F8] dark:bg-[#396CAA]/[0.22]';
export const FILETE_ESQUERDA = 'shadow-[inset_3px_0_0_#396CAA] dark:shadow-[inset_3px_0_0_#6E9DC4]';
export const FILETE_TOPO = 'shadow-[inset_0_3px_0_#396CAA] dark:shadow-[inset_0_3px_0_#6E9DC4]';

export function IconeEstrela({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 text-[#396CAA] dark:text-[#6E9DC4] ${className}`}
    >
      <path
        fill="currentColor"
        d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1l-5.6 2.9 1.1-6.2L2.9 9.4l6.3-.9z"
      />
    </svg>
  );
}

export interface InfoCelula {
  texto: string;
  destaque: boolean;
  naoSeAplica: boolean;
  negativo: boolean;
  conferencia: LinhaComparador['conferencia'][string];
  /** selo de fonte sob o valor (só com valor) */
  fonteCvm: boolean;
}

export function infoCelula(linha: LinhaComparador, ticker: string): InfoCelula {
  const v = linha.valores[ticker] ?? {
    estado: 'ausente' as const,
    motivo: 'sem_dado_fonte',
    texto: TC.celula.semDado,
  };
  return {
    texto: formatarEstado(v, linha.formato),
    destaque: linha.destaque === ticker,
    naoSeAplica: v.estado === 'nao_se_aplica',
    // vermelho só em percentual (margem, ROE): dívida líquida negativa é caixa líquido, não perda
    negativo: v.estado === 'ok' && v.valor < 0 && linha.formato === 'pct',
    conferencia: linha.conferencia[ticker] ?? null,
    fonteCvm: linha.fonteCvmAviso && v.estado === 'ok',
  };
}

/** Classes da célula (td ou caixa do cartão) conforme o estado. */
export function classesCelula(i: InfoCelula, filete: 'esquerda' | 'topo'): string {
  if (i.destaque)
    return `${FUNDO_DESTAQUE} ${filete === 'esquerda' ? FILETE_ESQUERDA : FILETE_TOPO}`;
  if (i.conferencia) return HACHURA;
  return '';
}

/** Texto com <wbr> depois de cada '.' de milhar (quebra preferida nos cartões estreitos). */
function comQuebras(texto: string): ReactNode {
  // sem lookbehind (Safari < 16.4 não compila a regex e derrubaria o bundle)
  const partes: string[] = [];
  let inicio = 0;
  for (let k = 1; k < texto.length - 1; k++) {
    if (texto[k] === '.' && /\d/.test(texto[k - 1]) && /\d/.test(texto[k + 1])) {
      partes.push(texto.slice(inicio, k + 1));
      inicio = k + 1;
    }
  }
  partes.push(texto.slice(inicio));
  if (partes.length < 2) return texto;
  return partes.map((p, k) => (
    <Fragment key={k}>
      {k > 0 ? <wbr /> : null}
      {p}
    </Fragment>
  ));
}

export interface ConteudoCelulaProps {
  linha: LinhaComparador;
  ticker: string;
  /** alinhamento (tabela: direita; cartão: esquerda) */
  alinhamento?: 'direita' | 'esquerda';
}

export default function ConteudoCelula({
  linha,
  ticker,
  alinhamento = 'direita',
}: ConteudoCelulaProps) {
  const i = infoCelula(linha, ticker);
  const itens = alinhamento === 'direita' ? 'items-end' : 'items-start';
  // cartões do celular: até 4 colunas a 320px — o valor pode quebrar
  // (overflow-wrap:anywhere: sem isso o inline-flex cresce pelo conteúdo e "1.529.305" invade a
  // coluna vizinha; <wbr> após o separador de milhar dá a quebra preferida)
  const cartao = alinhamento === 'esquerda';
  const quebra = cartao ? 'flex-wrap [overflow-wrap:anywhere]' : 'whitespace-nowrap';
  const texto = cartao ? comQuebras(i.texto) : i.texto;
  return (
    <span
      className={`inline-flex flex-col gap-0.5 ${itens} ${cartao ? 'max-w-full min-w-0' : ''}`}
      data-celula-ticker={ticker}
    >
      {i.destaque ? (
        <span
          className={`inline-flex items-center gap-1 font-semibold text-gray-800 tabular-nums dark:text-white/90 ${quebra}`}
          data-destaque=""
        >
          <IconeEstrela />
          <span className={i.negativo ? TEXTO_NEGATIVO : ''}>{texto}</span>
          <span
            aria-hidden="true"
            className="text-[11.5px] font-semibold text-[#314666] dark:text-[#EAEAEA]"
          >
            {TC.destaque.rotulo}
          </span>
          <span className="sr-only">{TC.destaque.srOnly}</span>
        </span>
      ) : (
        <span
          className={`tabular-nums ${cartao ? 'max-w-full [overflow-wrap:anywhere]' : 'whitespace-nowrap'} ${
            i.naoSeAplica
              ? 'text-gray-500 dark:text-gray-400'
              : i.negativo
                ? TEXTO_NEGATIVO
                : 'text-gray-800 dark:text-white/90'
          }`}
        >
          {texto}
        </span>
      )}
      {i.conferencia ? (
        <span title={i.conferencia.motivo} className="inline-flex">
          <ChipConferencia
            campo={linha.codigo}
            rotuloCampo={linha.rotulo}
            estatico
            compacto={cartao}
          />
          <span className="sr-only">{i.conferencia.motivo}</span>
        </span>
      ) : null}
      {i.fonteCvm ? (
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{TC.celula.fonteCvm}</span>
      ) : null}
    </span>
  );
}
