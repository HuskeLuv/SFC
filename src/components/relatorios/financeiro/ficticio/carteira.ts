/**
 * Dados FIXOS da carteira fictícia (4a e 4b). Nunca usar dado real; rótulos neutros.
 */
import { CORES } from '../cores';

export const CARTEIRA_FICTICIA = {
  patrimonio: 845_000,
  data: 'em 30/10/2026',
  variacao: 61_200,
  nAtivos: 28,
  nClasses: 6,
  classes: [
    ['Renda fixa', 312_000, CORES.blue],
    ['Tesouro Direto', 98_000, CORES.b6],
    ['Ações', 214_000, CORES.navy],
    ['FIIs', 121_000, CORES.gold],
    ['Stocks', 76_000, CORES.b4],
    ['REITs', 24_000, CORES.b2],
  ] as [string, number, string][],
  /** Patrimônio no fim de cada mês (Dez/25 … Nov/26). */
  historico: [
    752_000, 760_500, 768_200, 774_900, 783_100, 790_400, 798_800, 806_300, 814_900, 823_500,
    834_100, 845_000,
  ],
  /** Investimentos de cada mês (Dez/25 … Nov/26). */
  investimentos: [
    3_100, 3_250, 3_180, 3_400, 3_320, 3_500, 3_450, 3_600, 3_380, 3_700, 3_650, 3_800,
  ],
} as const;

/** 4b: acumulados no período, por n (1, 3, 6, 12 meses), em %. */
export const RENTABILIDADE_FICTICIA: Record<
  number,
  { carteira: number; cdi: number; ipca: number; ibov: number }
> = {
  1: { carteira: 1.12, cdi: 1.05, ipca: 0.38, ibov: 1.6 },
  3: { carteira: 3.31, cdi: 3.18, ipca: 1.12, ibov: 4.2 },
  6: { carteira: 6.84, cdi: 6.41, ipca: 2.25, ibov: 7.9 },
  12: { carteira: 13.9, cdi: 13.2, ipca: 4.6, ibov: 11.4 },
};

/** 4b: proventos de cada mês (Dez/25 … Nov/26): [FIIs, Ações, JCP, Exterior]. */
export const PROVENTOS_FICTICIOS: [number, number, number, number][] = [
  [1_050, 610, 0, 280],
  [1_080, 540, 0, 300],
  [1_120, 880, 420, 310],
  [1_060, 590, 0, 290],
  [1_100, 720, 0, 320],
  [1_140, 940, 460, 300],
  [1_090, 650, 0, 330],
  [1_110, 700, 0, 310],
  [1_150, 990, 440, 340],
  [1_120, 620, 0, 320],
  [1_160, 760, 0, 350],
  [1_180, 1_010, 480, 360],
];
