/**
 * Níveis de acesso (fundação do paywall — ticket Área Educacional 21/08/2026).
 *
 * Modelo: cada usuário tem `User.accessLevel` (0 = gratuito) e cada recurso
 * protegível declara um `requiredLevel`. O usuário acessa tudo que tem
 * `requiredLevel <= accessLevel`. Níveis são NUMÉRICOS e ordenados de
 * propósito — dá para inserir planos intermediários sem migração de dados.
 *
 * Hoje só a Área Educacional consome; a intenção (Wellington, 21/08) é
 * estender o mesmo mecanismo para seções inteiras do app quando os planos
 * pagos existirem. Nomes/valores dos planos pagos serão definidos com o
 * Pedro — por ora tudo que está publicado usa requiredLevel 0.
 */

export const ACCESS_LEVELS = {
  /** Todo usuário cadastrado. */
  GRATUITO: 0,
  /** Assinante pagante (plano base — nome comercial a definir). */
  ASSINANTE: 1,
  /** Nível superior (mentoria/premium — nome comercial a definir). */
  PREMIUM: 2,
} as const;

export const ACCESS_LEVEL_LABELS: Record<number, string> = {
  [ACCESS_LEVELS.GRATUITO]: 'Gratuito',
  [ACCESS_LEVELS.ASSINANTE]: 'Assinante',
  [ACCESS_LEVELS.PREMIUM]: 'Premium',
};

export const accessLevelLabel = (level: number): string =>
  ACCESS_LEVEL_LABELS[level] ?? `Nível ${level}`;

/** O usuário (nível `userLevel`, default 0) pode acessar um recurso `requiredLevel`? */
export const canAccess = (
  userLevel: number | null | undefined,
  requiredLevel: number | null | undefined,
): boolean => (userLevel ?? 0) >= (requiredLevel ?? 0);

/** Nível efetivo de uma aula: o MAIOR entre o do curso e o da aula. */
export const effectiveRequiredLevel = (
  courseLevel: number | null | undefined,
  lessonLevel: number | null | undefined,
): number => Math.max(courseLevel ?? 0, lessonLevel ?? 0);
