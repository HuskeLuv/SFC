/**
 * Validação leve de email no cliente — usada apenas para habilitar/desabilitar
 * botões de formulário. A validação canônica continua no zod do backend
 * (`zEmail` em `validation-schemas.ts`).
 */
export const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
