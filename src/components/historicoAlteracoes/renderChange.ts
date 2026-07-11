import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import type { ChangeSection, ChangeValueFormat, FieldChange } from '@/services/changeHistory/types';

export const SECTION_LABELS: Record<ChangeSection, string> = {
  carteira: 'Carteira',
  'fluxo-caixa': 'Fluxo de Caixa',
  planejamento: 'Planejamento',
  perfil: 'Perfil',
};

export const SECTION_BADGE_COLORS: Record<
  ChangeSection,
  'primary' | 'success' | 'warning' | 'info'
> = {
  carteira: 'primary',
  'fluxo-caixa': 'success',
  planejamento: 'warning',
  perfil: 'info',
};

type Renderer = (e: HistoricoAlteracaoEntry) => string;

/** Monta "Verbo + substantivo (+ label)" — label entra quando existir. */
const withLabel =
  (text: string, textWithLabel?: (label: string) => string): Renderer =>
  (e) =>
    e.entityLabel && textWithLabel ? textWithLabel(e.entityLabel) : text;

const ACTION_RENDERERS: Record<string, Renderer> = {
  // Carteira
  'ativo.editar': withLabel('Editou um ativo', (l) => `Editou o ativo ${l}`),
  'ativo.remover': withLabel('Removeu um ativo', (l) => `Removeu o ativo ${l}`),
  'caixa-investir.atualizar': withLabel(
    'Atualizou o caixa para investir',
    (l) => `Atualizou o caixa para investir de ${l}`,
  ),
  'objetivo-classe.definir': withLabel(
    'Definiu o objetivo de uma classe de ativos',
    (l) => `Definiu o objetivo da classe ${l}`,
  ),
  'renda-fixa.editar': withLabel(
    'Editou um ativo de renda fixa',
    (l) => `Editou o ativo de renda fixa ${l}`,
  ),
  'imovel-bem.atualizar-valor': withLabel(
    'Atualizou o valor de um imóvel/bem',
    (l) => `Atualizou o valor de ${l}`,
  ),
  'investimento.registrar': withLabel(
    'Registrou um investimento',
    (l) => `Registrou investimento em ${l}`,
  ),
  'operacao.registrar': withLabel('Registrou uma operação', (l) => `Registrou operação de ${l}`),
  'aporte.registrar': withLabel('Registrou um aporte', (l) => `Registrou aporte em ${l}`),
  'resgate.registrar': withLabel('Registrou um resgate', (l) => `Registrou resgate de ${l}`),
  'resumo.atualizar': withLabel('Atualizou o resumo da carteira'),
  'configuracao.editar': withLabel('Editou a configuração da carteira'),
  'provento.adicionar': withLabel('Adicionou um provento', (l) => `Adicionou provento de ${l}`),
  'provento.editar': withLabel('Editou um provento', (l) => `Editou provento de ${l}`),
  'provento.excluir': withLabel('Excluiu um provento', (l) => `Excluiu provento de ${l}`),
  'transacao.editar': withLabel('Editou uma transação', (l) => `Editou transação de ${l}`),
  'transacao.excluir': withLabel('Excluiu uma transação', (l) => `Excluiu transação de ${l}`),
  'objetivo-carteira.definir': withLabel('Definiu o objetivo da carteira'),
  'objetivo-carteira.remover': withLabel('Removeu o objetivo da carteira'),

  // Fluxo de Caixa
  'valor.editar': withLabel('Editou um valor do fluxo de caixa', (l) => `Editou ${l}`),
  'item.criar': withLabel('Criou um item no fluxo de caixa', (l) => `Criou o item ${l}`),
  'item.editar': withLabel('Editou um item do fluxo de caixa', (l) => `Editou o item ${l}`),
  'item.excluir': withLabel('Excluiu um item do fluxo de caixa', (l) => `Excluiu o item ${l}`),
  'valores.editar-lote': withLabel(
    'Editou valores do fluxo de caixa em lote',
    (l) => `Editou ${l} do fluxo de caixa`,
  ),
  'comentario.editar': withLabel('Editou um comentário', (l) => `Editou comentário de ${l}`),
  'grupo.criar': withLabel('Criou um grupo no fluxo de caixa', (l) => `Criou o grupo ${l}`),
  'grupo.editar': withLabel('Editou um grupo do fluxo de caixa', (l) => `Editou o grupo ${l}`),
  'grupo.excluir': withLabel('Excluiu um grupo do fluxo de caixa', (l) => `Excluiu o grupo ${l}`),

  // Planejamento
  'sonho.criar': withLabel('Criou um sonho', (l) => `Criou o sonho "${l}"`),
  'sonho.editar': withLabel('Editou um sonho', (l) => `Editou o sonho "${l}"`),
  'sonho.excluir': withLabel('Excluiu um sonho', (l) => `Excluiu o sonho "${l}"`),
  'sonho-aporte.registrar': withLabel(
    'Registrou um aporte em um sonho',
    (l) => `Registrou aporte no sonho "${l}"`,
  ),
  'sonho-aporte.excluir': withLabel(
    'Excluiu um aporte de um sonho',
    (l) => `Excluiu aporte do sonho "${l}"`,
  ),
  'aposentadoria.editar': withLabel('Editou o plano de aposentadoria'),
  'aposentadoria-aporte.registrar': withLabel('Registrou um aporte na aposentadoria'),
  'aposentadoria-aporte.auto': withLabel('Preencheu aportes da aposentadoria automaticamente'),
  'aposentadoria-aporte.excluir': withLabel('Excluiu um aporte da aposentadoria'),

  // Perfil
  'perfil.editar': withLabel('Editou os dados do perfil'),
  'senha.alterar': withLabel('Alterou a senha'),
  '2fa.ativar': withLabel('Ativou a autenticação em duas etapas'),
  '2fa.desativar': withLabel('Desativou a autenticação em duas etapas'),
};

const UNDO_SUFFIX = '.desfazer';

/** Descrição em pt-BR de uma entrada; fallback legível para ações desconhecidas. */
export function renderDescription(entry: HistoricoAlteracaoEntry): string {
  if (entry.action.endsWith(UNDO_SUFFIX)) {
    const original = { ...entry, action: entry.action.slice(0, -UNDO_SUFFIX.length) };
    return `Desfez: ${renderDescription(original)}`;
  }
  const renderer = ACTION_RENDERERS[entry.action];
  if (renderer) return renderer(entry);
  const readable = entry.action.replace(/[.-]/g, ' ');
  return entry.entityLabel ? `${readable} — ${entry.entityLabel}` : readable;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

/**
 * Formata um valor antes/depois para exibição. `format` é a dica gravada no
 * diff (moeda, %, data); sem ela vale a heurística por tipo.
 */
export function formatChangeValue(value: unknown, format?: ChangeValueFormat): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (format === 'currency') {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (format === 'percent') {
      return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
    }
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  }
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface RichDescription {
  title: string;
  summary?: string;
}

const CREATION_VERBS = new Set(['criar', 'adicionar', 'registrar']);
const DELETION_VERBS = new Set(['excluir', 'remover']);
const MAX_SUMMARY_PAIRS = 2;

const formatPair = (change: FieldChange, style: 'edit' | 'single-before' | 'single-after') => {
  if (style === 'single-before')
    return `${change.label}: ${formatChangeValue(change.before, change.format)}`;
  if (style === 'single-after')
    return `${change.label}: ${formatChangeValue(change.after, change.format)}`;
  return `${change.label}: ${formatChangeValue(change.before, change.format)} → ${formatChangeValue(change.after, change.format)}`;
};

/**
 * Descrição rica: título (frase da ação) + resumo com até 2 campos do diff.
 * Edição mostra antes → depois; criação mostra os valores iniciais; exclusão
 * mostra os valores no momento da exclusão. O expand "Detalhes" continua
 * sendo o lugar da lista completa.
 */
export function renderRichDescription(entry: HistoricoAlteracaoEntry): RichDescription {
  const title = renderDescription(entry);
  const changes = entry.changes ?? [];
  if (changes.length === 0) return { title };

  const baseAction = entry.action.endsWith(UNDO_SUFFIX)
    ? entry.action.slice(0, -UNDO_SUFFIX.length)
    : entry.action;
  const verb = baseAction.split('.').pop() ?? '';
  const style = CREATION_VERBS.has(verb)
    ? 'single-after'
    : DELETION_VERBS.has(verb)
      ? 'single-before'
      : 'edit';

  const shown = changes.slice(0, MAX_SUMMARY_PAIRS);
  const rest = changes.length - shown.length;

  const parts = shown.map((change) => formatPair(change, style));
  if (rest > 0) parts.push(`+${rest} ${rest === 1 ? 'outro campo' : 'outros campos'}`);

  const summary = parts.join(' · ');
  return {
    title,
    summary: style === 'single-before' ? `Valores no momento da exclusão — ${summary}` : summary,
  };
}

export function formatEntryDate(createdAt: string): string {
  const date = new Date(createdAt);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
