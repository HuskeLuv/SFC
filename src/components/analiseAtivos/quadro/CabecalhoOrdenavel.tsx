'use client';

/**
 * <th> do Quadro: aria-sort no th, botão "Ordenar por X" dentro dele (primeiro clique = direção
 * padrão da coluna, DIRECAO_PADRAO). A coluna da ordem fica destacada (azul outside sólido, par do
 * TABLE_STYLES.highlightTd). Colunas sem ordem viram th simples.
 */
import type { CSSProperties } from 'react';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ColunaQuadro } from '@/constants/analiseAtivosVisual';
import type { DirecaoOrdem, OrdemQuadro } from '@/types/analiseAtivosApi';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

export interface CabecalhoOrdenavelProps {
  coluna: ColunaQuadro;
  rotulo: string;
  ordemAtual: OrdemQuadro;
  dir: DirecaoOrdem;
  onOrdenar: (ordem: OrdemQuadro) => void;
  /** coluna fixa à esquerda (Ativo/Fundo) */
  fixa?: boolean;
  className?: string;
}

const ALINHAMENTO = {
  esquerda: 'text-left',
  direita: 'text-right',
  centro: 'text-center',
} as const;

const JUSTIFICA = {
  esquerda: 'justify-start',
  direita: 'justify-end',
  centro: 'justify-center',
} as const;

export default function CabecalhoOrdenavel({
  coluna,
  rotulo,
  ordemAtual,
  dir,
  onOrdenar,
  fixa = false,
  className = '',
}: CabecalhoOrdenavelProps) {
  const ordenavel = coluna.ordem !== null;
  const ativa = ordenavel && coluna.ordem === ordemAtual;
  const ariaSort = !ordenavel
    ? undefined
    : ativa
      ? dir === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
  const estilo: CSSProperties = {
    backgroundColor: ativa ? MYFINANCE_BRAND.outside : MYFINANCE_BRAND.seguranca,
  };
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`${TABLE_STYLES.th} ${ALINHAMENTO[coluna.alinhamento]} sticky top-0 ${
        fixa ? 'left-0 z-30' : 'z-20'
      } ${className}`}
      style={estilo}
      data-coluna={coluna.codigo}
      data-ordem-ativa={ativa ? '' : undefined}
    >
      {ordenavel ? (
        <BotaoOrdenar
          rotulo={rotulo}
          ativa={ativa}
          dir={dir}
          onClick={() => onOrdenar(coluna.ordem as OrdemQuadro)}
          justifica={JUSTIFICA[coluna.alinhamento]}
        />
      ) : (
        rotulo
      )}
    </th>
  );
}

function BotaoOrdenar({
  rotulo,
  ativa,
  dir,
  onClick,
  justifica,
}: {
  rotulo: string;
  ativa: boolean;
  dir: DirecaoOrdem;
  onClick: () => void;
  justifica: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={formatarTexto(TEXTOS_TELA.quadro.ordenarPor, { valor: rotulo })}
      className={`inline-flex w-full items-center gap-1 ${justifica} uppercase tracking-wide outline-none focus-visible:ring-[3px] focus-visible:ring-white/80`}
    >
      <span>{rotulo}</span>
      <span aria-hidden="true" className={ativa ? 'opacity-100' : 'opacity-40'}>
        {ativa && dir === 'asc' ? '▲' : '▼'}
      </span>
    </button>
  );
}
