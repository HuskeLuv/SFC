export const CHANGE_SECTIONS = ['carteira', 'fluxo-caixa', 'planejamento', 'perfil'] as const;

export type ChangeSection = (typeof CHANGE_SECTIONS)[number];

/** Dica de formatação para o cliente renderizar o valor em pt-BR. */
export type ChangeValueFormat = 'currency' | 'percent' | 'date' | 'number' | 'text';

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  format?: ChangeValueFormat;
}

/** Entrada de um mapa de rótulos: string simples ou rótulo com formato. */
export type FieldLabelEntry = string | { label: string; format: ChangeValueFormat };

/** Mapa campo → rótulo usado como allowlist pelo diffFields. */
export type FieldLabelMap = Record<string, FieldLabelEntry>;

/**
 * Estado pré-mutação allowlisted, gravado em user_change_logs.snapshot para
 * permitir desfazer exclusões e upserts. `kind` identifica o formato de
 * `data` (ex. 'transacao', 'sonho'); `meta` guarda locators e estado
 * relacionado (year/month, metric, meta do Portfolio). Assim como `changes`,
 * NUNCA deve conter campos sensíveis; nunca é exposto na API de listagem.
 */
export interface ChangeSnapshot {
  v: 1;
  kind: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}
