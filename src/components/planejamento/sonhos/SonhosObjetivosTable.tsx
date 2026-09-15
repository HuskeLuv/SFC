'use client';

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { progress, pmt } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { StatusBadge, CategoryBadge } from './SonhosBadges';
import { formatBRLCompact, categoryAccent } from './utils';

interface SonhosObjetivosTableProps {
  objetivos: PlanejamentoObjetivoDTO[];
  onSelectObjetivo: (id: string) => void;
}

/**
 * Visão tabular consolidada "Todos os Objetivos" — espelho da planilha do
 * consultor (mockup `escolhi_ser_rico`). Mesma data dos cards, em colunas:
 * Objetivo, Categoria, Meta, Atual, Aporte/mês, Prazo, Progresso, Status.
 * A linha-rodapé soma o "Aporte Mensal Ativo" (só objetivos `Iniciado`, igual
 * ao stat card do dashboard) + os totais de Meta e Atual.
 */
export default function SonhosObjetivosTable({
  objetivos,
  onSelectObjetivo,
}: SonhosObjetivosTableProps) {
  const totals = useMemo(() => {
    const meta = objetivos.reduce((s, g) => s + g.target, 0);
    const atual = objetivos.reduce((s, g) => s + progress(g).balance, 0);
    // Aporte mensal ATIVO: só "Iniciado" entra (mesma regra do SonhosDashboard).
    const aporteAtivo = objetivos
      .filter((g) => g.status === 'Iniciado')
      .reduce((s, g) => s + pmt(g), 0);
    return { meta, atual, aporteAtivo };
  }, [objetivos]);

  const HEAD = TABLE_STYLES.th;

  return (
    <div className={TABLE_STYLES.wrapper}>
      <Table className={TABLE_STYLES.table}>
        <TableHeader>
          <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <TableCell isHeader className={`${HEAD} text-left`}>
              Objetivo
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-left`}>
              Categoria
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-right`}>
              Meta
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-right`}>
              Atual
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-right`}>
              Aporte/mês
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-center`}>
              Prazo
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-left`}>
              Progresso
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-center`}>
              Status
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {objetivos.map((g) => {
            const { pct, balance } = progress(g);
            const accent = categoryAccent(g.category);
            const isDone = pct >= 100;
            return (
              <TableRow
                key={g.id}
                onClick={() => onSelectObjetivo(g.id)}
                className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover} cursor-pointer`}
              >
                <TableCell
                  className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}
                >
                  {g.name}
                </TableCell>
                <TableCell className={TABLE_STYLES.td}>
                  <CategoryBadge category={g.category} />
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-right`}>
                  {formatBRLCompact(g.target)}
                </TableCell>
                <TableCell
                  className={`${TABLE_STYLES.td} text-right font-semibold text-gray-900 dark:text-white/90`}
                >
                  {formatBRLCompact(balance)}
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-right`}>
                  {formatBRLCompact(pmt(g))}
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-center`}>{g.months}m</TableCell>
                <TableCell className={TABLE_STYLES.td}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: isDone ? '#10b981' : accent,
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-center`}>
                  <StatusBadge status={g.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <tfoot>
          <TableRow className={`${TABLE_STYLES.totalRow} font-semibold`}>
            <TableCell className={`${TABLE_STYLES.td} font-semibold`}>TOTAL MENSAL ATIVO</TableCell>
            <TableCell className={TABLE_STYLES.td} />
            <TableCell className={`${TABLE_STYLES.td} text-right font-semibold`}>
              {formatBRLCompact(totals.meta)}
            </TableCell>
            <TableCell className={`${TABLE_STYLES.td} text-right font-semibold`}>
              {formatBRLCompact(totals.atual)}
            </TableCell>
            <TableCell className={`${TABLE_STYLES.td} text-right font-semibold`}>
              <span className="text-brand-600 dark:text-brand-400">
                {formatBRLCompact(totals.aporteAtivo)}
              </span>
            </TableCell>
            <TableCell className={TABLE_STYLES.td} colSpan={3} />
          </TableRow>
        </tfoot>
      </Table>
    </div>
  );
}
