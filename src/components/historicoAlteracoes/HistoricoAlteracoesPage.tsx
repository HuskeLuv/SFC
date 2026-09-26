'use client';

import React, { useState } from 'react';
import {
  StandardTable,
  StandardTableHeader,
  StandardTableHeaderRow,
  StandardTableHeaderCell,
  TableBody,
} from '@/components/ui/table/StandardTable';
import PaginationWithButton from '@/components/tables/DataTables/TableTwo/PaginationWithButton';
import {
  useHistoricoAlteracoes,
  type HistoricoAlteracaoEntry,
} from '@/hooks/useHistoricoAlteracoes';
import { useUndoAlteracao } from '@/hooks/useUndoAlteracao';
import { CHANGE_SECTIONS, type ChangeSection } from '@/services/changeHistory/types';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileTabRail from '@/components/ui/tabs/MobileTabRail';
import MobilePageState from '@/components/ui/mobile/MobilePageState';
import MobileSaveToast from '@/components/ui/sheet/MobileSaveToast';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import { SECTION_LABELS, formatChangeValue, renderRichDescription } from './renderChange';
import { HistoricoEntryRow, HistoricoEntryCard } from './HistoricoEntryRow';

const TODAS = 'todas';

/** Até 4 campos no sheet do Desfazer: "Valor volta para R$ 10,00". */
const MAX_CAMPOS_CONFIRM = 4;

/** O que volta ao desfazer (sheet do celular): título + campos com o valor de antes. */
const UndoConfirmMessage: React.FC<{ entry: HistoricoAlteracaoEntry; title: string }> = ({
  entry,
  title,
}) => {
  const changes = entry.changes ?? [];
  const shown = changes.slice(0, MAX_CAMPOS_CONFIRM);
  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-800 [overflow-wrap:anywhere] dark:text-white/90">
        {title}
      </p>
      {shown.length > 0 ? (
        <ul className="space-y-0.5 [overflow-wrap:anywhere]">
          {shown.map((c) => (
            <li key={c.field}>
              {c.label} volta para {formatChangeValue(c.before, c.format)}.
            </li>
          ))}
          {changes.length > shown.length ? (
            <li>
              e mais {changes.length - shown.length}{' '}
              {changes.length - shown.length === 1 ? 'campo' : 'campos'}.
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Desfazer segue a ordem: só a alteração mais recente de cada item pode ser desfeita.
      </p>
    </div>
  );
};

const SectionChips: React.FC<{
  selected: ChangeSection | undefined;
  onSelect: (section: ChangeSection | undefined) => void;
}> = ({ selected, onSelect }) => {
  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
      active
        ? 'bg-brand-500 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={chipClass(!selected)} onClick={() => onSelect(undefined)}>
        Todas
      </button>
      {CHANGE_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          className={chipClass(selected === section)}
          onClick={() => onSelect(section)}
        >
          {SECTION_LABELS[section]}
        </button>
      ))}
    </div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-2 animate-pulse" data-testid="historico-skeleton">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-8 rounded bg-gray-100 dark:bg-gray-800" />
    ))}
  </div>
);

export default function HistoricoAlteracoesPage() {
  const [page, setPage] = useState(1);
  const [section, setSection] = useState<ChangeSection | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const { entries, pagination, loading, error, refetch } = useHistoricoAlteracoes(page, section);
  const undoMutation = useUndoAlteracao();
  const isBelowLg = useIsBelowLg();
  const { confirmAndRun, confirmSheet } = useResponsiveConfirm();

  const handleSectionChange = (next: ChangeSection | undefined) => {
    setSection(next);
    setPage(1);
    setExpandedId(null);
  };

  // Desktop: window.confirm com o texto de hoje e o erro no banner. Celular (PWA fase 3): sheet
  // com o que volta, erro (ex.: 409) dentro do próprio sheet com "Tentar de novo" e, no sucesso,
  // o aviso "Alteração desfeita" (o selo "Desfeita" vem do refetch).
  const handleUndo = async (entry: HistoricoAlteracaoEntry) => {
    const { title } = renderRichDescription(entry);
    try {
      const ok = await confirmAndRun(
        {
          desktopMessage: `Desfazer esta alteração?\n\n${title}`,
          title: 'Desfazer esta alteração?',
          message: <UndoConfirmMessage entry={entry} title={title} />,
          confirmLabel: 'Desfazer',
          busyLabel: 'Desfazendo…',
        },
        async () => {
          setUndoError(null);
          await undoMutation.mutateAsync(entry.id);
        },
      );
      if (ok && isBelowLg) setToast('Alteração desfeita');
    } catch (err: unknown) {
      setUndoError(err instanceof Error ? err.message : 'Erro ao desfazer a alteração');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* Abaixo de lg o título é o do PageBreadCrumb (compacto): este repetiria o mesmo texto. */}
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90 max-lg:hidden">
            Histórico de alterações
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Registro das edições feitas na sua conta, por seção do app.
          </p>
        </div>
        {!isBelowLg && <SectionChips selected={section} onSelect={handleSectionChange} />}
      </div>

      {isBelowLg && (
        <MobileTabRail
          variant="chips"
          semantics="filter"
          ariaLabel="Filtrar por seção"
          activeId={section ?? TODAS}
          onChange={(id) => handleSectionChange(id === TODAS ? undefined : (id as ChangeSection))}
          tabs={[
            { id: TODAS, label: 'Todas' },
            ...CHANGE_SECTIONS.map((s) => ({ id: s, label: SECTION_LABELS[s] })),
          ]}
        />
      )}

      {undoError && (
        <div
          className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"
          role="alert"
        >
          Não foi possível desfazer: {undoError}{' '}
          <button type="button" onClick={() => setUndoError(null)} className="underline">
            fechar
          </button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && error && isBelowLg && (
        <MobilePageState
          kind="error"
          title="Não carregou o histórico"
          text={`${error}. Suas alterações continuam salvas.`}
          action={{ label: 'Tentar de novo', onClick: refetch }}
        />
      )}

      {!loading && error && !isBelowLg && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}{' '}
          <button type="button" onClick={refetch} className="underline">
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div
          data-historico-vazio=""
          className="py-12 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Nenhuma alteração registrada
          {section ? ` em ${SECTION_LABELS[section]}` : ''} ainda. As edições que você fizer
          aparecerão aqui.
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div data-historico-lista="" className="space-y-4">
          {/* Desktop */}
          <div className="hidden lg:block">
            <StandardTable>
              <StandardTableHeader>
                <StandardTableHeaderRow>
                  <StandardTableHeaderCell className="w-36">Data</StandardTableHeaderCell>
                  <StandardTableHeaderCell className="w-32">Seção</StandardTableHeaderCell>
                  <StandardTableHeaderCell>Alteração</StandardTableHeaderCell>
                  <StandardTableHeaderCell align="right" className="w-20">
                    {''}
                  </StandardTableHeaderCell>
                </StandardTableHeaderRow>
              </StandardTableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <HistoricoEntryRow
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    onUndo={handleUndo}
                    undoPending={undoMutation.isPending && undoMutation.variables === entry.id}
                  />
                ))}
              </TableBody>
            </StandardTable>
          </div>

          {/* Mobile (cartões até lg — PWA fase 3) */}
          <div data-mf-mobile="" className="space-y-3 lg:hidden">
            {entries.map((entry) => (
              <HistoricoEntryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onUndo={handleUndo}
                undoPending={undoMutation.isPending && undoMutation.variables === entry.id}
              />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <PaginationWithButton
              key={section ?? 'todas'}
              totalPages={pagination.totalPages}
              initialPage={page}
              onPageChange={(next) => {
                setPage(next);
                setExpandedId(null);
              }}
            />
          )}
        </div>
      )}

      {confirmSheet}
      <MobileSaveToast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
