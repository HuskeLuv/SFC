/**
 * Dados FIXOS do planejamento fictício (seção 5). Nunca usar dado real; rótulos neutros.
 */
export const PLANEJAMENTO_FICTICIO = {
  realizado: 845_000,
  planejado: 828_000,
  meta: 'R$ 4,0 mi',
  metaSub: 'Mar/35 · rentabilidade meta 0,950% a.m.',
  metaMensal: 0.95,
  /** Fim de cada mês (Dez/25 … Nov/26). */
  serieRealizado: [
    752_000, 760_500, 768_200, 774_900, 783_100, 790_400, 798_800, 806_300, 814_900, 823_500,
    834_100, 845_000,
  ],
  seriePlanejado: [
    750_000, 757_900, 765_900, 773_900, 782_000, 790_100, 798_300, 806_500, 812_000, 817_400,
    822_700, 828_000,
  ],
  depositoProjetado: [
    3_300, 3_310, 3_330, 3_340, 3_350, 3_370, 3_380, 3_390, 3_410, 3_420, 3_430, 3_450,
  ],
  depositoRealizado: [
    3_100, 3_250, 3_180, 3_400, 3_320, 3_500, 3_450, 3_600, 3_380, 3_700, 3_650, 3_800,
  ],
  /** Rentabilidade de cada mês, em %. */
  rentabilidade: [0.82, 1.14, 0.71, 0.98, 1.21, 0.64, 1.03, 0.92, 1.18, 0.77, 1.08, 1.12],
} as const;
