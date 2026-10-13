'use client';

/**
 * Célula de um indicador × ativo do Comparador (tabela e cartões). ISONÔMICA (v2.4, fatia D):
 * todas as células têm o mesmo fundo e o mesmo peso; nenhum valor ganha marca, ícone, filete ou
 * cor por ser maior/menor que o dos outros.
 * - conferência: 'ocultar' = '—' + chip; 'selo' = valor + chip (o chip diz o motivo);
 * - n/a (misto, financeira) em cinza; percentual negativo em #D92D20 / #F97066 (só o texto do
 *   valor, como em toda a área);
 * - selo "fonte CVM" sob o valor quando a linha o pede (vacância física da CVM).
 */
import { Fragment, type ReactNode } from 'react';
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTO_NEGATIVO } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import type { LinhaComparadorV2 } from '@/services/analiseAtivos/regras/comparador/indicadores';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';

const TC = TEXTOS_COMPARADOR;

export interface InfoCelula {
  texto: string;
  naoSeAplica: boolean;
  negativo: boolean;
  conferencia: LinhaComparadorV2['conferencia'][string];
  /** selo de fonte sob o valor (só com valor) */
  fonteCvm: boolean;
}

export function infoCelula(linha: LinhaComparadorV2, ticker: string): InfoCelula {
  const v = linha.valores[ticker] ?? {
    estado: 'ausente' as const,
    motivo: 'sem_dado_fonte',
    texto: TC.celula.semDado,
  };
  return {
    texto: formatarEstado(v, linha.formato),
    naoSeAplica: v.estado === 'nao_se_aplica',
    // vermelho só em percentual (margem, ROE): dívida líquida negativa é caixa líquido, não perda
    negativo: v.estado === 'ok' && v.valor < 0 && linha.formato === 'pct',
    conferencia: linha.conferencia[ticker] ?? null,
    fonteCvm: linha.fonteCvmAviso && v.estado === 'ok',
  };
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
  linha: LinhaComparadorV2;
  ticker: string;
  /** alinhamento (tabela: centro; cartão: esquerda) */
  alinhamento?: 'centro' | 'esquerda';
}

export default function ConteudoCelula({
  linha,
  ticker,
  alinhamento = 'centro',
}: ConteudoCelulaProps) {
  const i = infoCelula(linha, ticker);
  const cartao = alinhamento === 'esquerda';
  const itens = cartao ? 'items-start' : 'items-center';
  // cartões do celular: até 4 colunas a 320px — o valor pode quebrar (overflow-wrap:anywhere +
  // <wbr> depois do separador de milhar)
  const texto = cartao ? comQuebras(i.texto) : i.texto;
  return (
    <span
      className={`inline-flex flex-col gap-0.5 ${itens} ${cartao ? 'max-w-full min-w-0' : ''}`}
      data-celula-ticker={ticker}
    >
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
