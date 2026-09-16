import { criarHandlerObjetivo } from '@/services/portfolio/objetivoHandler';

/**
 * POST /api/carteira/fim-fia/objetivo — objetivo (%) de uma posição ou de um
 * ativo planejado da aba. Lógica compartilhada em `objetivoHandler.ts`.
 */
export const POST = criarHandlerObjetivo('FIM/FIA');
