'use client';

import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { CategoriaV2 } from '@/types/orcamentoV2';
import BarraConsumo from './BarraConsumo';
import IconeCategoria from './IconeCategoria';
import {
  CLASSE_COM_AJUDA,
  TOM_DO_STATUS,
  num,
  pct,
  plural,
  textoDiferenca,
  textoTolerancia,
} from './apresentacao';

interface LinhaCategoriaProps {
  categoria: CategoriaV2;
  aberta: boolean;
  onAlternar: () => void;
  ritmo: number;
  tituloRitmo: string;
}

const ETIQUETA =
  'ml-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold dark:bg-white/[0.06]';

/**
 * Linha de categoria (spec §4.5, R-01/R-09): seta + ícone + nome (clicar recolhe/expande), "n de m
 * subcategorias com orçamento" e os contadores do servidor — categoria em estouro mostra só
 * "estouro", sem orçamento mostra "sem orçamento", e nos demais casos "n estouro" e/ou "n à
 * frente do ritmo" (T15). O orçado é a soma das subcategorias (não editável, T05).
 */
export default function LinhaCategoria({
  categoria: c,
  aberta,
  onAlternar,
  ritmo,
  tituloRitmo,
}: LinhaCategoriaProps) {
  const total = c.subcategorias.length;
  const etiquetas: { texto: string; status: 'bad' | 'warn' | 'none' }[] =
    c.status === 'bad'
      ? [{ texto: 'estouro', status: 'bad' }]
      : c.status === 'none'
        ? [{ texto: 'sem orçamento', status: 'none' }]
        : [
            ...(c.qtdEstouro > 0
              ? [{ texto: plural(c.qtdEstouro, 'estouro', 'estouros'), status: 'bad' as const }]
              : []),
            ...(c.qtdAFrente > 0
              ? [{ texto: `${c.qtdAFrente} à frente do ritmo`, status: 'warn' as const }]
              : []),
          ];
  const dif = textoDiferenca(c.diferenca);
  const tolerancia = textoTolerancia(c.orcado, c.realizado, c.status);

  return (
    <tr
      data-mf-linha="categoria"
      data-categoria-id={c.id}
      className={`cat ${TABLE_STYLES.row} border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]`}
    >
      <td className={`${TABLE_STYLES.td} py-3`}>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberta}
          title={`${aberta ? 'Recolher' : 'Expandir'} ${c.nome}`}
          className="inline-flex items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2]"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${aberta ? '' : '-rotate-90'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-mf-patrimonio dark:bg-white/[0.06] dark:text-mf-tranquilidade">
            <IconeCategoria icone={c.icone} />
          </span>
          <span className="font-semibold text-gray-900 dark:text-white/90">{c.nome}</span>
        </button>
        <small className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          · {c.qtdComOrcamento} de {plural(total, 'subcategoria', 'subcategorias')} com orçamento
        </small>
        {etiquetas.map((e) => (
          <span
            key={e.texto}
            data-mf-etiqueta={e.status}
            className={`${ETIQUETA} ${SELO_TEXTO[TOM_DO_STATUS[e.status]]}`}
          >
            {e.texto}
          </span>
        ))}
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums text-gray-500 dark:text-gray-400`}>
        {c.orcado > 0 ? pct(c.pctReceita) : '—'}
      </td>
      <td className={`${TABLE_STYLES.td} text-right`}>
        <b className="font-semibold tabular-nums text-gray-900 dark:text-white/90">
          {num(c.orcado)}
        </b>
        <small className="block text-[11px] text-gray-500 dark:text-gray-400">
          soma das subcategorias
        </small>
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums`}>{num(c.realizado)}</td>
      <td
        className={`${TABLE_STYLES.td} text-right tabular-nums ${
          dif.negativa
            ? SELO_TEXTO.estourou
            : dif.texto === '—'
              ? 'text-gray-400 dark:text-gray-500'
              : ''
        }`}
        title={tolerancia ?? undefined}
      >
        <span className={tolerancia ? CLASSE_COM_AJUDA : undefined}>{dif.texto}</span>
      </td>
      <td className={TABLE_STYLES.td}>
        <BarraConsumo
          consumido={c.consumido}
          status={c.status}
          ritmo={ritmo}
          tituloRitmo={tituloRitmo}
          ajuda={tolerancia}
        />
      </td>
      {/* Menu da categoria (renomear, reordenar, excluir) é da E2 (CRUD de categoria). */}
      <td className={TABLE_STYLES.td} />
    </tr>
  );
}
