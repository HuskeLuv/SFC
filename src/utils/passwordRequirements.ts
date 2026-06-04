/**
 * Requisitos de senha — fonte única compartilhada entre frontend e backend.
 *
 * O `passwordPolicy` (zod) em `validation-schemas.ts` é construído a partir
 * destes mesmos requisitos, e o `SignUpForm` os usa para exibir o checklist
 * em tempo real. Mudou um requisito aqui → muda nos dois lugares.
 *
 * Módulo puro (sem imports de servidor) para poder ser importado tanto em
 * client components quanto em rotas de API.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRequirement {
  id: string;
  /** Texto exibido ao usuário no checklist. */
  label: string;
  /** Mensagem usada quando o requisito falha na validação do backend. */
  errorMessage: string;
  test: (value: string) => boolean;
}

export const passwordRequirements: PasswordRequirement[] = [
  {
    id: 'length',
    label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    errorMessage: `Senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'lowercase',
    label: 'Pelo menos uma letra minúscula',
    errorMessage: 'Senha precisa conter pelo menos uma letra minúscula',
    test: (v) => /[a-z]/.test(v),
  },
  {
    id: 'uppercase',
    label: 'Pelo menos uma letra maiúscula',
    errorMessage: 'Senha precisa conter pelo menos uma letra maiúscula',
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: 'number',
    label: 'Pelo menos um número',
    errorMessage: 'Senha precisa conter pelo menos um número',
    test: (v) => /\d/.test(v),
  },
  {
    id: 'symbol',
    label: 'Pelo menos um símbolo (ex.: !@#$%)',
    errorMessage: 'Senha precisa conter pelo menos um símbolo',
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/** Retorna os requisitos que a senha ainda NÃO atende. */
export function unmetPasswordRequirements(value: string): PasswordRequirement[] {
  return passwordRequirements.filter((req) => !req.test(value));
}
