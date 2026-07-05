'use client';

import React from 'react';
import Badge from '@/components/ui/badge/Badge';
import { StandardTableBodyCell, StandardTableRow } from '@/components/ui/table/StandardTable';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import {
  SECTION_LABELS,
  SECTION_BADGE_COLORS,
  renderDescription,
  formatChangeValue,
  formatEntryDate,
} from './renderChange';

const ChangesList: React.FC<{ entry: HistoricoAlteracaoEntry }> = ({ entry }) => {
  if (!entry.changes || entry.changes.length === 0) return null;
  return (
    <ul className="space-y-1">
      {entry.changes.map((change) => (
        <li key={change.field} className="text-xs text-gray-600 dark:text-gray-300">
          <span className="font-medium">{change.label}:</span>{' '}
          <span className="line-through text-gray-400 dark:text-gray-500">
            {formatChangeValue(change.before)}
          </span>{' '}
          <span aria-hidden>→</span> <span>{formatChangeValue(change.after)}</span>
        </li>
      ))}
    </ul>
  );
};

const ViaConsultorBadge: React.FC = () => (
  <Badge variant="light" color="warning" size="sm">
    via consultor
  </Badge>
);

interface RowProps {
  entry: HistoricoAlteracaoEntry;
  expanded: boolean;
  onToggle: () => void;
}

/** Linha da tabela (desktop) com expansão para os detalhes antes/depois. */
export const HistoricoEntryRow: React.FC<RowProps> = ({ entry, expanded, onToggle }) => {
  const hasChanges = Boolean(entry.changes && entry.changes.length > 0);

  return (
    <>
      <StandardTableRow className="hover:bg-gray-50 dark:hover:bg-white/[0.05]">
        <StandardTableBodyCell className="whitespace-nowrap text-gray-500 dark:text-gray-400">
          {formatEntryDate(entry.createdAt)}
        </StandardTableBodyCell>
        <StandardTableBodyCell>
          <Badge variant="light" color={SECTION_BADGE_COLORS[entry.section] ?? 'primary'} size="sm">
            {SECTION_LABELS[entry.section] ?? entry.section}
          </Badge>
        </StandardTableBodyCell>
        <StandardTableBodyCell>
          <span className="inline-flex items-center gap-2">
            {renderDescription(entry)}
            {entry.viaConsultant && <ViaConsultorBadge />}
          </span>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          {hasChanges && (
            <button
              type="button"
              onClick={onToggle}
              className="text-xs text-brand-500 hover:text-brand-600 dark:hover:text-brand-400"
              aria-expanded={expanded}
            >
              {expanded ? 'Ocultar' : 'Detalhes'}
            </button>
          )}
        </StandardTableBodyCell>
      </StandardTableRow>
      {expanded && hasChanges && (
        <StandardTableRow className="bg-gray-50/50 dark:bg-white/[0.02]">
          <StandardTableBodyCell colSpan={4}>
            <div className="py-1">
              <ChangesList entry={entry} />
            </div>
          </StandardTableBodyCell>
        </StandardTableRow>
      )}
    </>
  );
};

/** Card (mobile) com os mesmos dados da linha. */
export const HistoricoEntryCard: React.FC<{ entry: HistoricoAlteracaoEntry }> = ({ entry }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <Badge variant="light" color={SECTION_BADGE_COLORS[entry.section] ?? 'primary'} size="sm">
        {SECTION_LABELS[entry.section] ?? entry.section}
      </Badge>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {formatEntryDate(entry.createdAt)}
      </span>
    </div>
    <p className="text-sm text-gray-800 dark:text-gray-200">
      {renderDescription(entry)} {entry.viaConsultant && <ViaConsultorBadge />}
    </p>
    <ChangesList entry={entry} />
  </div>
);
