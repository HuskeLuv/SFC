import { criarHandlerObjetivo } from '@/services/portfolio/objetivoHandler';

/**
 * POST /api/carteira/stocks/objetivo — objetivo (%) de uma posição ou de um
 * ativo planejado da aba. Lógica compartilhada em `objetivoHandler.ts`.
 */
export const POST = criarHandlerObjetivo('Stocks');
