'use client';

/**
 * "Reportar dado incorreto" — STUB da fatia 0 com as props FINAIS (BotaoReportarDadoProps em
 * src/types/analiseAtivosCuradoria.ts). A fatia D implementa o formulário (modal de 560px no
 * computador; sheet de tela cheia no celular com "Enviar relato" fixo de 48px e
 * useMobileHistoryLayer), os estados (inválido, enviando, enviado com protocolo, rede, 429, 409) e
 * o envio por csrfFetch para POST /api/analise-ativos/reportes.
 *
 * Variantes:
 * - 'link': renderiza o próprio gatilho ("Tem uma informação sobre isso? Reportar"), usado no fim do
 *   "Por quê?" de um campo em conferência;
 * - 'controlado': sem gatilho; o formulário abre com `aberto` e chama `onFechar`. É como o
 *   MenuBlocoAtivo o usa (montado FORA do menu, para o formulário não desmontar com ele).
 *
 * Enquanto for stub, devolve null (nenhum gatilho, nenhum formulário).
 */
import type { BotaoReportarDadoProps } from '@/types/analiseAtivosCuradoria';

export type { BotaoReportarDadoProps };

export default function BotaoReportarDado(_props: BotaoReportarDadoProps) {
  return null;
}
