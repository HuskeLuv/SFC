/**
 * Filtros leves para itens de cashflow. Vivem fora do `patrimonioHistoricoBuilder`
 * propositalmente: rotas que só precisam destes helpers (caminho rápido) não
 * pagam o custo de cold-start de carregar o builder de histórico (~1k linhas).
 */

const isReservaCashflowItem = (name: string | null): boolean => {
  if (!name) return false;
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return (
    (n.includes('reserva') && n.includes('emergencia')) ||
    (n.includes('reserva') && n.includes('oportunidade')) ||
    n.includes('emergencia')
  );
};

export const filterInvestmentsExclReservas = <T extends { name: string | null }>(items: T[]): T[] =>
  items.filter((item) => !isReservaCashflowItem(item.name));
