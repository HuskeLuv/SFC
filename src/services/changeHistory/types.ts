export const CHANGE_SECTIONS = ['carteira', 'fluxo-caixa', 'planejamento', 'perfil'] as const;

export type ChangeSection = (typeof CHANGE_SECTIONS)[number];

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}
