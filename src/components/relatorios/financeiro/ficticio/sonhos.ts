/**
 * Dados FIXOS dos sonhos fictícios (seção 6). Nunca usar dado real; rótulos neutros.
 */
import type { StatusSemaforo } from '@/types/relatorioFinanceiro';

export interface SonhoFicticio {
  nome: string;
  prioridade: string;
  prazo: string;
  meta: number;
  acumulado: number;
  mensal: number;
  conclusao: string;
  status: StatusSemaforo;
  rotulo: string;
  /** Saldo no fim de cada mês (Dez/25 … Nov/26), em R$ mil. */
  historico: number[];
}

export const SONHOS_FICTICIOS: SonhoFicticio[] = [
  {
    nome: 'Reserva de emergência',
    prioridade: 'Alta',
    prazo: 'Curto',
    meta: 120_000,
    acumulado: 98_400,
    mensal: 1_200,
    conclusao: 'Jun/27',
    status: 'good',
    rotulo: 'No ritmo',
    historico: [84, 85.2, 86.4, 87.6, 88.8, 90, 91.2, 92.4, 93.6, 94.8, 96, 98.4],
  },
  {
    nome: 'Intercâmbio',
    prioridade: 'Média',
    prazo: 'Médio',
    meta: 45_000,
    acumulado: 9_800,
    mensal: 1_000,
    conclusao: 'Ago/29',
    status: 'warn',
    rotulo: 'Abaixo do ritmo',
    historico: [3, 3.6, 4.2, 4.8, 5.4, 6, 6.6, 7.2, 7.8, 8.4, 9.1, 9.8],
  },
  {
    nome: 'Carro novo',
    prioridade: 'Média',
    prazo: 'Médio',
    meta: 90_000,
    acumulado: 31_500,
    mensal: 1_500,
    conclusao: 'Mar/29',
    status: 'good',
    rotulo: 'No ritmo',
    historico: [15, 16.5, 18, 19.5, 21, 22.5, 24, 25.5, 27, 28.5, 30, 31.5],
  },
  {
    nome: 'Reforma da casa',
    prioridade: 'Baixa',
    prazo: 'Longo',
    meta: 250_000,
    acumulado: 22_000,
    mensal: 2_000,
    conclusao: 'Out/35',
    status: 'bad',
    rotulo: 'Sem depósito há 3 meses',
    historico: [12, 14, 16, 18, 20, 22, 22, 22, 22, 22, 22, 22],
  },
];
