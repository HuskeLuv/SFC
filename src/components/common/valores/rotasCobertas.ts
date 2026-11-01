/**
 * Telas já cobertas pelo "esconder valores". Fora delas nada vira pílula (nem os componentes
 * compartilhados que já sabem esconder, como MetricCard e ResponsiveTable) e, com o olho fechado,
 * aparece a faixa "Nesta tela os valores ainda aparecem." (<AvisoCoberturaValores>).
 *
 * Fase 1: Carteira (Resumo, abas e Análise), /ativos/[id] e o painel do consultor.
 * Fase 2: Fluxo de caixa e Orçamento (v1 e v2 são abas de /fluxodecaixa, sem rota própria).
 * Fase 3: Planejar (/planejamento-financeiro: Sonhos e Aposentadoria são modos da mesma rota).
 * Cada fase acrescenta as suas rotas aqui; a faixa some quando a última fase fecha.
 */
export const ROTAS_COM_VALORES_OCULTOS: readonly string[] = [
  '/carteira',
  '/ativos',
  '/consultor',
  '/dashboard/consultor',
  '/fluxodecaixa',
  '/planejamento-financeiro',
];

/** A rota (ou uma sub-rota dela) está coberta? */
export function rotaCobreValoresOcultos(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ROTAS_COM_VALORES_OCULTOS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}
