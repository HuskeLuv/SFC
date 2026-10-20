/**
 * Flags da Análise de Ativos. Mesmo regime do COMUNIDADE_HABILITADA: desligadas por padrão.
 * Edge-safe (só lê process.env).
 *
 *  - ANALISE_ATIVOS_HABILITADA="true"    liga a área /analise-ativos (Fase 1) e as datas de
 *                                        resultado/assembleias na Agenda. Desligada: página e API 404.
 *  - ANALISE_ATIVOS_ACESSO="beta"|"todos" quem entra com a flag ligada (padrão 'beta': só a lista
 *                                        feature_beta_users + admins; 'todos' abre para todo mundo)
 *  - ANALISE_ATIVOS_NOVO_ATE=AAAA-MM-DD  até quando o menu mostra o selo NOVO (padrão 2026-12-31)
 *  - ANALISE_ATIVOS_ALERTA_ADMIN="true"  alertas dos jobs viram Notification para admins (só em prod)
 *  - ANALISE_ATIVOS_REPORTE_HABILITADO="true"  bloco C: botão "Reportar dado incorreto", Meus
 *                                        relatos e as APIs de relato (sem ela: item escondido e
 *                                        APIs 404). Só vale com a área liberada para o usuário. A
 *                                        fila do curador (/admin/curadoria) e os avisos aos admins
 *                                        também dependem dela (não de ALERTA_ADMIN; decisão 14).
 *
 *  Bloco D (docs/analise-ativos/blocoD/decisoes.md, decisão 15): uma flag por recurso, todas
 *  desligadas por padrão e válidas SÓ com a área liberada para o usuário (recursosLiberados em
 *  acessoAnalise.ts). Desligada: a UI fica idêntica à de hoje e a rota do recurso responde 404.
 *  Ordem de ligar em produção: RAIOX → COMPARADOR → CENARIOS, com OK a cada passo.
 *  - ANALISE_ATIVOS_RAIOX_HABILITADO="true"       Fundamentos · Raio-X + Exportar CSV
 *  - ANALISE_ATIVOS_COMPARADOR_HABILITADO="true"  página Comparador + entradas (pílulas, Quadro,
 *                                                 botão no cabeçalho do ativo)
 *  - ANALISE_ATIVOS_CENARIOS_HABILITADO="true"    Valuation · Meus cenários (depende do jurídico)
 *
 *  Bloco 1 (docs/analise-ativos/bloco1-salvos/desenho.json, flags_e_ativacao): mesmo regime, todas
 *  desligadas por padrão e válidas SÓ com a área liberada. As DEPENDÊNCIAS ficam em
 *  acessoAnalise.ts (FLAG_RECURSO): estas funções leem só a própria variável.
 *  - ANALISE_ATIVOS_SALVOS_HABILITADO="true"   Salvos (listas, Salvar no ativo/Quadro, página
 *                                              /analise-ativos/salvos, filtros salvos, comparações
 *                                              salvas com o COMPARADOR) e as APIs listas/salvos/
 *                                              filtros/comparacoes (sem ela: UI escondida e 404)
 *  - ANALISE_ATIVOS_ALERTAS_HABILITADO="true"  avisos das listas (aba Alertas, Alertas da lista,
 *                                              push 'analise', job alertas-salvos). EXIGE SALVOS
 *  - ANALISE_ATIVOS_PDF_HABILITADO="true"      "Exportar PDF" do Comparador e a rota
 *                                              comparacao-pdf. EXIGE COMPARADOR
 *
 *  Stocks e REITs (docs/analise-ativos/stocks-reits/desenho.json, fatia 0): mesmo regime, desligadas
 *  por padrão e válidas SÓ com a área liberada. Os JOBS EUA não dependem delas (o backfill de
 *  produção roda com as telas desligadas); só o 'cotacoes-eua' exige a de preço.
 *  - ANALISE_ATIVOS_EUA_HABILITADO="true"        abas Stocks/REITs do Quadro, página, Comparador,
 *                                                busca e Salvos EUA (sem ela: abas escondidas e as
 *                                                rotas/classes EUA respondem 404)
 *  - ANALISE_ATIVOS_EUA_PRECO_HABILITADO="true"  cotação, P/E, P/S, DY e Meus cenários EUA na Análise
 *                                                (decisão do Wellington de 17/10: desligada até a
 *                                                licença de exibição). EXIGE EUA. A Carteira não
 *                                                depende desta chave
 *
 *  A6 — dados complementares (docs/analise-ativos/fundamentei-trazer/desenho.json, fatia 0): mesmo
 *  regime, todas desligadas por padrão. As de TELA valem SÓ com a área liberada (acessoAnalise.ts,
 *  FLAG_RECURSO); desligada, a tela e as APIs ficam exatamente como hoje (rotas novas = 404).
 *  - ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO="true"          seção "Imóveis e composição do fundo"
 *                                                          (FII) e a rota imoveis-fii
 *  - ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO="true" Essencial/Raio-X de banco e seguradora
 *  - ANALISE_ATIVOS_RETORNOS_HABILITADO="true"             card "Variação da cotação" (topo) e as
 *                                                          linhas de variação no Comparador
 *  - ANALISE_ATIVOS_SOCIETARIO_HABILITADO="true"           card "Dados societários e estatuto"
 *                                                          (ações) e a rota societario
 *  - ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO="true"           'Alavancagem (% do ativo)' no Raio-X,
 *                                                          Comparador, Pares e Valuation do FII
 *  - ANALISE_ATIVOS_CVM_DVA="true"                         INGESTÃO (não é tela): o cvm-cias lê a
 *                                                          DVA das financeiras (PDD, 7.01.01/03)
 */
export function analiseAtivosHabilitada(): boolean {
  return process.env.ANALISE_ATIVOS_HABILITADA === 'true';
}

/** Bloco C: relatos de dado incorreto (desligado por padrão; decisão 20). */
export function analiseAtivosReporteHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_REPORTE_HABILITADO === 'true';
}

/** Bloco D: Fundamentos · Raio-X + CSV (desligado por padrão; decisão 15). */
export function analiseAtivosRaioXHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_RAIOX_HABILITADO === 'true';
}

/** Bloco D: Comparador e as entradas dele (desligado por padrão; decisão 15). */
export function analiseAtivosComparadorHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_COMPARADOR_HABILITADO === 'true';
}

/** Bloco D: Valuation · Meus cenários (desligado por padrão; decisão 15). */
export function analiseAtivosCenariosHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_CENARIOS_HABILITADO === 'true';
}

/** Bloco 1: Salvos, filtros e comparações salvas (desligado por padrão). */
export function analiseAtivosSalvosHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_SALVOS_HABILITADO === 'true';
}

/** Bloco 1: avisos das listas (desligado por padrão; só vale com SALVOS — ver acessoAnalise). */
export function analiseAtivosAlertasHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_ALERTAS_HABILITADO === 'true';
}

/** Bloco 1: Exportar PDF do Comparador (desligado por padrão; só vale com COMPARADOR). */
export function analiseAtivosPdfHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_PDF_HABILITADO === 'true';
}

/** EUA: Stocks e REITs na Análise (desligado por padrão). */
export function analiseAtivosEuaHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_EUA_HABILITADO === 'true';
}

/** EUA: cotação e múltiplos EUA na Análise (desligado; só vale com EUA — ver acessoAnalise). */
export function analiseAtivosEuaPrecoHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_EUA_PRECO_HABILITADO === 'true';
}

/** A6: imóveis e composição do FII (desligado por padrão). */
export function analiseAtivosImoveisFiiHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO === 'true';
}

/** A6: templates de banco e seguradora no Essencial/Raio-X (desligado por padrão). */
export function analiseAtivosTemplatesFinanceirasHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO === 'true';
}

/** A6: ingestão da DVA das financeiras no cvm-cias (job; não é tela; desligado por padrão). */
export function analiseAtivosCvmDva(): boolean {
  return process.env.ANALISE_ATIVOS_CVM_DVA === 'true';
}

/** A6: variação acumulada da cotação (desligado por padrão). */
export function analiseAtivosRetornosHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_RETORNOS_HABILITADO === 'true';
}

/** A6: dados societários e dividendo mínimo do estatuto (desligado por padrão). */
export function analiseAtivosSocietarioHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_SOCIETARIO_HABILITADO === 'true';
}

/** A6: alavancagem do FII sobre o ativo total (desligado por padrão). */
export function analiseAtivosAlavAtivoHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO === 'true';
}

export function analiseAtivosAlertaAdmin(): boolean {
  return process.env.ANALISE_ATIVOS_ALERTA_ADMIN === 'true';
}

export type AcessoAnaliseAtivos = 'beta' | 'todos';

/** 'todos' só com o valor exato; qualquer outra coisa (inclusive vazio) = 'beta'. */
export function analiseAtivosAcesso(): AcessoAnaliseAtivos {
  return process.env.ANALISE_ATIVOS_ACESSO === 'todos' ? 'todos' : 'beta';
}

export const NOVO_ATE_PADRAO = '2026-12-31';

/** Data (AAAA-MM-DD) até a qual o selo NOVO aparece; valor inválido cai no padrão. */
export function analiseAtivosNovoAte(): string {
  const v = process.env.ANALISE_ATIVOS_NOVO_ATE?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : NOVO_ATE_PADRAO;
}
