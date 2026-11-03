'use client';

import React from 'react';
import Badge from '@/components/ui/badge/Badge';
import { StandardTableBodyCell, StandardTableRow } from '@/components/ui/table/StandardTable';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import MobileStatusPill from '@/components/ui/mobile/MobileStatusPill';
import { Sensivel, TextoSensivel } from '@/components/common/valores/Sensivel';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import type { ChangeValueFormat } from '@/services/changeHistory/types';
import {
  SECTION_LABELS,
  SECTION_BADGE_COLORS,
  renderRichDescriptionPartes,
  formatChangeValue,
  formatEntryDate,
  textoDasPartes,
  type ParteResumo,
} from './renderChange';

/**
 * Esconder valores (Fase 6): um valor antes/depois do diff. Número em 'currency' é dinheiro do
 * usuário e 'number' (ou sem formato) é quantidade: viram pílula com o olho fechado. 'percent' e
 * 'date' ficam; texto só esconde trechos com R$/US$. A pílula é a que guarda a largura do valor
 * (.mf-sensivel--reserva): o resumo e os detalhes quebram nas mesmas linhas com o olho aberto ou
 * fechado (decisão 6). Na quantidade ela é "justa" (.mf-sensivel--justa): nunca mais larga que o
 * número ("Quantidade: 1" não empurra o resto da frase para outra linha nem cobre o rótulo).
 * O JSON técnico da operação (Observações de operacao/aporte/resgate/transação: quantity, price,
 * total…) fica todo escondido, no lugar (.mf-sensivel--texto: faixa da pílula em cada linha, mesma
 * quebra de linha). Olho aberto: a mesma string de formatChangeValue.
 */
const pareceJson = (value: unknown, texto: string) =>
  (value !== null && typeof value === 'object') ||
  (typeof value === 'string' && /^\s*[[{]/.test(texto) && /\d/.test(texto));

export const ValorAlteracao: React.FC<{ value: unknown; format?: ChangeValueFormat }> = ({
  value,
  format,
}) => {
  const texto = formatChangeValue(value, format);
  if (typeof value === 'number' && format !== 'percent') {
    const curto = format !== 'currency';
    return (
      <Sensivel
        curto={curto}
        className={curto ? 'mf-sensivel--reserva mf-sensivel--justa' : 'mf-sensivel--reserva'}
      >
        {texto}
      </Sensivel>
    );
  }
  if (pareceJson(value, texto)) return <Sensivel className="mf-sensivel--texto">{texto}</Sensivel>;
  return <TextoSensivel texto={texto} />;
};

/**
 * Título da alteração: o nome de ativo manual traz o valor ("CDB X - R$ 1.000 - 13/10/2026"), que
 * vira pílula como na carteira (AssetNameLink). Olho fechado: um span só, porque na linha do
 * desktop o título é item de um inline-flex com gap (os pedaços virariam itens separados). Olho
 * aberto: o texto cru de sempre.
 */
export const TituloAlteracao: React.FC<{ title: string }> = ({ title }) => {
  const { ativo } = useValoresOcultos();
  if (!ativo) return <>{title}</>;
  return (
    <span>
      <TextoSensivel texto={title} className="mf-sensivel--reserva" />
    </span>
  );
};

/** Resumo "Rótulo: a → b · …" com a pílula só nos valores. */
export const ResumoAlteracao: React.FC<{ partes: ParteResumo[] }> = ({ partes }) => {
  const { ativo } = useValoresOcultos();
  // Olho aberto: a string única de sempre (mesmo DOM de hoje).
  if (!ativo) return <>{textoDasPartes(partes)}</>;
  return (
    <>
      {partes.map((p, i) =>
        typeof p === 'string' ? (
          <React.Fragment key={i}>{p}</React.Fragment>
        ) : (
          <ValorAlteracao key={i} value={p.valor} format={p.format} />
        ),
      )}
    </>
  );
};

export const ChangesList: React.FC<{
  entry: HistoricoAlteracaoEntry;
  id?: string;
  className?: string;
}> = ({ entry, id, className = '' }) => {
  if (!entry.changes || entry.changes.length === 0) return null;
  return (
    <ul id={id} className={`space-y-1 ${className}`}>
      {entry.changes.map((change) => (
        <li
          key={change.field}
          className="text-xs text-gray-600 max-lg:[overflow-wrap:anywhere] dark:text-gray-300"
        >
          <span className="font-medium">{change.label}:</span>{' '}
          <span className="line-through text-gray-400 dark:text-gray-500">
            <ValorAlteracao value={change.before} format={change.format} />
          </span>{' '}
          <span aria-hidden>→</span>{' '}
          <span>
            <ValorAlteracao value={change.after} format={change.format} />
          </span>
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

const DesfeitaBadge: React.FC = () => (
  <Badge variant="light" color="light" size="sm">
    Desfeita
  </Badge>
);

// Abaixo de lg (PWA fase 3) o Desfazer vira botão de 44px na cor de ação (azul, não âmbar).
const UndoButton: React.FC<{ onClick: () => void; pending: boolean }> = ({ onClick, pending }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={pending}
    className="text-xs text-warning-600 hover:text-warning-700 disabled:opacity-50 dark:text-warning-400 dark:hover:text-warning-300 max-lg:min-h-11 max-lg:px-3 max-lg:rounded-lg max-lg:border max-lg:border-[#396CAA] max-lg:text-[#396CAA] max-lg:text-sm max-lg:font-semibold dark:max-lg:border-[#6E9DC4] dark:max-lg:text-[#6E9DC4]"
  >
    {pending ? 'Desfazendo…' : 'Desfazer'}
  </button>
);

interface RowProps {
  entry: HistoricoAlteracaoEntry;
  expanded: boolean;
  onToggle: () => void;
  onUndo: (entry: HistoricoAlteracaoEntry) => void;
  undoPending: boolean;
}

/** Linha da tabela (desktop) com expansão para os detalhes antes/depois. */
export const HistoricoEntryRow: React.FC<RowProps> = ({
  entry,
  expanded,
  onToggle,
  onUndo,
  undoPending,
}) => {
  const hasChanges = Boolean(entry.changes && entry.changes.length > 0);
  const isUndone = Boolean(entry.undoneAt);
  const { title, resumo } = renderRichDescriptionPartes(entry);

  return (
    <>
      <StandardTableRow className={TABLE_STYLES.rowHover}>
        <StandardTableBodyCell className="whitespace-nowrap text-gray-500 dark:text-gray-400">
          {formatEntryDate(entry.createdAt)}
        </StandardTableBodyCell>
        <StandardTableBodyCell>
          <Badge variant="light" color={SECTION_BADGE_COLORS[entry.section] ?? 'primary'} size="sm">
            {SECTION_LABELS[entry.section] ?? entry.section}
          </Badge>
        </StandardTableBodyCell>
        <StandardTableBodyCell>
          <span className={`inline-flex items-center gap-2 ${isUndone ? 'opacity-60' : ''}`}>
            <TituloAlteracao title={title} />
            {entry.viaConsultant && <ViaConsultorBadge />}
            {isUndone && <DesfeitaBadge />}
          </span>
          {resumo && (
            <p
              className={`mt-0.5 text-xs text-gray-500 dark:text-gray-400 ${isUndone ? 'opacity-60' : ''}`}
            >
              <ResumoAlteracao partes={resumo} />
            </p>
          )}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right">
          <span className="inline-flex items-center gap-3">
            {entry.canUndo && <UndoButton onClick={() => onUndo(entry)} pending={undoPending} />}
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
          </span>
        </StandardTableBodyCell>
      </StandardTableRow>
      {expanded && hasChanges && (
        <StandardTableRow className="bg-gray-50/60 dark:bg-white/[0.02]">
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

interface CardProps {
  entry: HistoricoAlteracaoEntry;
  expanded: boolean;
  onToggle: () => void;
  onUndo: (entry: HistoricoAlteracaoEntry) => void;
  undoPending: boolean;
}

/**
 * Cartão (abaixo de lg) com os mesmos dados da linha. PWA fase 3: seção em rótulo neutro (sem
 * verde), selos "via consultor" (âmbar) e "Desfeita" (neutro) em ponto + palavra, "Detalhes" abre
 * o antes → depois e o Desfazer é botão de 44px.
 */
export const HistoricoEntryCard: React.FC<CardProps> = ({
  entry,
  expanded,
  onToggle,
  onUndo,
  undoPending,
}) => {
  const isUndone = Boolean(entry.undoneAt);
  const hasChanges = Boolean(entry.changes && entry.changes.length > 0);
  const { title, resumo } = renderRichDescriptionPartes(entry);
  const titleId = `historico-${entry.id}`;
  const detailsId = `historico-detalhes-${entry.id}`;
  return (
    <article
      aria-labelledby={titleId}
      data-historico-card=""
      className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2 max-lg:rounded-2xl max-lg:p-4 max-lg:bg-white dark:max-lg:bg-white/[0.03]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-300">
          {SECTION_LABELS[entry.section] ?? entry.section}
        </span>
        <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {formatEntryDate(entry.createdAt)}
        </span>
      </div>
      <p
        id={titleId}
        className={`text-sm font-medium text-gray-800 max-lg:[overflow-wrap:anywhere] dark:text-gray-200 ${isUndone ? 'opacity-60' : ''}`}
      >
        <TituloAlteracao title={title} />
      </p>
      {entry.viaConsultant || isUndone ? (
        <p className="flex flex-wrap gap-3">
          {entry.viaConsultant && <MobileStatusPill tone="atencao">via consultor</MobileStatusPill>}
          {isUndone && <MobileStatusPill tone="neutro">Desfeita</MobileStatusPill>}
        </p>
      ) : null}
      {resumo && (
        <p className={`text-xs text-gray-500 dark:text-gray-400 ${isUndone ? 'opacity-60' : ''}`}>
          <ResumoAlteracao partes={resumo} />
        </p>
      )}
      {expanded && hasChanges ? (
        <ChangesList
          entry={entry}
          id={detailsId}
          className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
        />
      ) : null}
      {hasChanges || entry.canUndo ? (
        <div className="flex flex-wrap justify-end gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
            >
              {expanded ? 'Ocultar' : 'Detalhes'}
            </button>
          )}
          {entry.canUndo && <UndoButton onClick={() => onUndo(entry)} pending={undoPending} />}
        </div>
      ) : null}
    </article>
  );
};
