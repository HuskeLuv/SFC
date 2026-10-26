'use client';

import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { ResumoOrcamentoV2, VisaoOrcamento } from '@/types/orcamentoV2';
import BarraConsumo from './BarraConsumo';
import { num, pct, plural, textoDiferenca } from './apresentacao';

/**
 * Linha "Total do mês" (spec §4.5): contagem de categorias/subcategorias, orçado ÷ receita e as
 * somas do `resumo`. O status (e a cor da barra) é o do servidor — `statusCategoria` sobre as
 * categorias (D16).
 */
export default function LinhaTotal({
  resumo,
  visao,
  ritmo,
  tituloRitmo,
}: {
  resumo: ResumoOrcamentoV2;
  visao: VisaoOrcamento;
  ritmo: number;
  tituloRitmo: string;
}) {
  const dif = textoDiferenca(resumo.disponivel);
  return (
    <tr data-mf-linha="total" className={TABLE_STYLES.totalRow}>
      <td className={TABLE_STYLES.td}>
        {visao === 'ano' ? 'Total acumulado' : 'Total do mês'}
        <small className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
          {plural(resumo.totalCategorias, 'categoria', 'categorias')} ·{' '}
          {plural(resumo.totalSubcategorias, 'subcategoria', 'subcategorias')}
        </small>
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums`}>
        {pct(resumo.orcadoPctReceita)}
      </td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums`}>{num(resumo.orcado)}</td>
      <td className={`${TABLE_STYLES.td} text-right tabular-nums`}>{num(resumo.realizado)}</td>
      <td
        className={`${TABLE_STYLES.td} text-right tabular-nums ${dif.negativa ? SELO_TEXTO.estourou : ''}`}
      >
        {dif.texto}
      </td>
      <td className={TABLE_STYLES.td}>
        <BarraConsumo
          consumido={resumo.realizadoPctOrcado === null ? null : resumo.realizadoPctOrcado / 100}
          status={resumo.status}
          ritmo={ritmo}
          tituloRitmo={tituloRitmo}
        />
      </td>
      <td className={TABLE_STYLES.td} />
    </tr>
  );
}
