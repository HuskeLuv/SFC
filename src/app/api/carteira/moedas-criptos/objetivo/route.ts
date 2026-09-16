import { criarHandlerObjetivo } from '@/services/portfolio/objetivoHandler';

/**
 * POST /api/carteira/moedas-criptos/objetivo — objetivo (%) de uma posição ou de um
 * ativo planejado da aba. Lógica compartilhada em `objetivoHandler.ts`.
 */
export const POST = criarHandlerObjetivo('Moedas e Criptos');
