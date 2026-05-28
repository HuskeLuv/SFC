/**
 * Badges compactos para status / prioridade / categoria de objetivos.
 * Mantém o look de pill do TailAdmin sem inventar paleta nova.
 */

import type {
  PlanejamentoCategory,
  PlanejamentoPriority,
  PlanejamentoStatus,
} from '@/hooks/usePlanejamentoSonhos';
import { CATEGORY_LABELS } from './utils';

const PILL_BASE =
  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap';

const STATUS_CLASS: Record<PlanejamentoStatus, string> = {
  'Em espera':
    'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300',
  Iniciado:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300',
  Pausado: 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300',
  Atrasado: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300',
  Concluído:
    'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
};

const PRIORITY_CLASS: Record<PlanejamentoPriority, string> = {
  Alta: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  Moderado: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  Baixa: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const CATEGORY_CLASS: Record<PlanejamentoCategory, string> = {
  c: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300',
  m: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300',
  l: 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
};

export const StatusBadge: React.FC<{ status: PlanejamentoStatus }> = ({ status }) => (
  <span className={`${PILL_BASE} ${STATUS_CLASS[status]}`}>{status}</span>
);

export const PriorityBadge: React.FC<{ priority: PlanejamentoPriority }> = ({ priority }) => (
  <span className={`${PILL_BASE} ${PRIORITY_CLASS[priority]}`}>{priority}</span>
);

export const CategoryBadge: React.FC<{ category: PlanejamentoCategory }> = ({ category }) => (
  <span className={`${PILL_BASE} ${CATEGORY_CLASS[category]}`}>{CATEGORY_LABELS[category]}</span>
);
