/**
 * Telas já cobertas pelo "esconder valores". Fora delas nada vira pílula (nem os componentes
 * compartilhados que já sabem esconder, como MetricCard e ResponsiveTable) e, com o olho fechado,
 * aparece a faixa "Nesta tela os valores ainda aparecem." (<AvisoCoberturaValores>).
 *
 * Fase 1: Carteira (Resumo, abas e Análise), /ativos/[id] e o painel do consultor. Cada fase
 * acrescenta as suas rotas aqui; a faixa some quando a última fase fecha.
 */
export const ROTAS_COM_VALORES_OCULTOS: readonly string[] = [
  '/carteira',
  '/ativos',
  '/consultor',
  '/dashboard/consultor',
];

/** A rota (ou uma sub-rota dela) está coberta? */
export function rotaCobreValoresOcultos(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ROTAS_COM_VALORES_OCULTOS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}
