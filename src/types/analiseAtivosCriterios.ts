/**
 * CONTRATOS da Análise de Ativos v2.4 — Filtros de Fundamentos (fatia 0, "Contratos").
 *
 * Fontes: docs/analise-ativos/v2-filtros/spec-desenho.json (arquitetura.fatias/apis/schema_prisma,
 * design) + docs/analise-ativos/v2-filtros/decisoes.md (D1–D6 + 9 recomendações, PREVALECE).
 * Congelados: as fatias A (motor/job), B (Quadro), C1 (cabeçalho e modais da Carteira), C2 (página
 * do ativo) e D (Comparador) programam contra estes tipos SEM arquivo em comum. Mudança aqui = PR
 * na fatia 0 (ou na F, que torna obrigatórios os campos novos opcionais de analiseAtivosApi.ts).
 *
 * Regras que os tipos carregam (compliance CVM/Bacen/ANBIMA, spec §9):
 * - Critério é verificação BINÁRIA e FACTUAL sobre séries anuais das demonstrações. Não há nota,
 *   peso, média nem ordem derivada: `atendidos`/`n` são CONTAGENS ("n de 6"; financeiras "n de 3").
 * - EstadoCriterio tem 4 estados; 'sem_dado' CONTA COMO NÃO ATENDE (nunca atende por falta de dado;
 *   frase "não atende · sem dado nas demonstrações"). 'nao_se_aplica' sai do denominador.
 * - Marcas ✓/— sempre NEUTRAS na tela (nunca verde/vermelho); n/a em pílula tracejada.
 * - Nenhuma chave destes tipos é do indicador antigo, de nota, rating ou score (contratoSemNota).
 *
 * Mapa de donos (cada arquivo tem UM dono; ver tabela de ownership em spec-desenho.json):
 *   0  — este arquivo, params/*, textosCriterios, textosLiterais, linguagemV2, varrerDom,
 *        comum/{CelulaCriterios,MarcaCriterio,PilulasJanela,MiniBarrasAnuais}, lerCriterios (contrato).
 *   A  — regras/criterios/*, calculo/executarCriterios, repositorio/criterios, lerCriterios (corpo),
 *        job 'criterios', gerarQuadro/montarLinhasQuadro (gravam CriteriosCompactos).
 *   B  — rota/consulta do Quadro (QuadroParams.janela/criterios, QuadroResposta.definicoes/
 *        totalClasse), busca sem i/e, BarraFiltrosCriterios, RodapeCriterios, textosQuadro.
 *   C1 — BarraAcoesAtivo + 4 modais (ModalAnalise), desvioAlvo/registroOperacao/secaoOperacao,
 *        overlay (objetivoPct/estrategia/tipoFii/secao/id), sugestoesComparar + rota,
 *        useAcoesCarteiraAnalise, textosAcoesCarteira (TEXTOS_OPERACAO).
 *   C2 — CardCriterios/ItemCriterio, AtivoTopoResposta.criterios, Essencial (ultimoAno, R$ bi),
 *        Valuation, cenários V2 (PremissasAcaoV2/PremissasFiiV2), pares, conferência sem efeito
 *        no indicador antigo, textosAtivo.
 *   D  — Comparador (AtivoComparador.criterios, ComparadorResposta.leitura), BlocoCriteriosComparador,
 *        LeituraDosDados, SeletorTipoFii.
 *   F  — limpeza (textosTela, textos, respostas, constantes, tipos), torna obrigatórios os campos
 *        novos, oficializa o Comparador isonômico e liga linguagemV2Global/contratoSemNota.
 *
 * v2.5 (docs/analise-ativos/v25-regras-pedro/desenho.json, fatia 0): séries com os nomes da spec
 * (SERIES_CRITERIO canônicas; o nome legado da v1 vira o canônico no parse do criteria_params e na
 * leitura de criteria_eval antigos — MAPA_SERIE_LEGADA), ResultadoCriterio.fonte/obs, MarcaCompacta
 * com 4º elemento (obs), EntradaDesvioAlvo.valorBase (carteira TOTAL, caso 33), origem 'padrao' da
 * seção automática e EntradaAvaliacaoAtivo.origens/mesesPorAno. Financeiras passam a "n de 6" pelo
 * params (naoSeAplica vazio), sem mudança de tipo. Camada de fontes: src/types/analiseAtivosFontes.ts.
 *
 * Stocks e REITs (docs/analise-ativos/stocks-reits/desenho.json, fatia 0): perfis 'stock',
 * 'stock_financeira' (SIC 6000–6799 exceto 6798; "n de 6" literal) e 'reit'; ids novos dpa,
 * fco_acao, pay, ocup e ffo_acao (RESERVADO para a fase 2: FFO/ação do 10-K); séries novas
 * dividend_per_share, ocf_per_share, cash_payout_pct, occupancy, ffo_per_share, affo_per_share,
 * affo_payout_pct; unidades em US$. Os ids rec/luc/ebitda/mg/dl/fcl valem igual para stocks (?c=
 * compartilhado). Contratos próprios da feature: src/types/analiseAtivosEua.ts.
 *
 * A2+A4 — alinhar ao Fundamentei (docs/analise-ativos/fundamentei-regras/desenho.json, fatia F0):
 * tipo 'cagr' (crescimento anual composto > 0 na janela; base ≤ 0 pela regra
 * criteria_params.cagr.baseNaoPositiva), séries 'ebit' (lucro operacional; na SEC, a base do
 * EBITDA pelo degrau), 'ocf_adjusted_per_share' e 'cash_payout_adjusted_pct' (REIT: caixa
 * operacional ajustado pela remuneração em ações, SBC), motivo 'base_nao_positiva' e obs
 * 'sbc_indisponivel'. Só a criteria_params v5 (F1) usa; v1–v4 avaliam igual.
 */
import type { ReactNode } from 'react';
import type { ClasseQuadro, Estado, FiiTipoTela, FormatoAnalise } from '@/types/analiseAtivosApi';
import type { IdFonte, OrigemSerie, SerieFundamento } from '@/types/analiseAtivosFontes';

// ===========================================================================
// Básicos
// ===========================================================================

/** Janelas de avaliação (anos). Padrão 5 (criteria_params.janelaPadrao). */
export const JANELAS_CRITERIOS = [3, 5, 10] as const;
export type Janela = (typeof JANELAS_CRITERIOS)[number];
export const JANELA_PADRAO: Janela = 5;

export function ehJanela(v: unknown): v is Janela {
  return typeof v === 'number' && (JANELAS_CRITERIOS as readonly number[]).includes(v);
}

/** Chave da janela num JSON (as chaves de objeto JSON são strings). */
export type ChaveJanela = '3' | '5' | '10';

/**
 * Perfil de critérios (regra ÚNICA, params):
 * - ação: ehFinanceira do universo → 'acao_financeira' (D4: n de 3), senão 'acao';
 * - FII: papel → 'fii_papel'; tijolo → 'fii_tijolo'; híbrido, indefinido, FoF ou sem tipo →
 *   (imóveis + SPE)/PL ≥ params.regraHibrido.limiarImoveisPlPct ? tijolo : papel (rec. 3).
 */
export const PERFIS_CRITERIO_BR = ['acao', 'acao_financeira', 'fii_tijolo', 'fii_papel'] as const;
/**
 * Perfis EUA (feature Stocks/REITs): stock → 'stock_financeira' quando SecCompany.ehFinanceira
 * (SIC 6000–6799 exceto 6798, + override por CIK), senão 'stock'; reit → 'reit'.
 */
export const PERFIS_CRITERIO_EUA = ['stock', 'stock_financeira', 'reit'] as const;
export const PERFIS_CRITERIO = [...PERFIS_CRITERIO_BR, ...PERFIS_CRITERIO_EUA] as const;
export type PerfilCriterio = (typeof PERFIS_CRITERIO)[number];
export type PerfilCriterioEua = (typeof PERFIS_CRITERIO_EUA)[number];

/** Perfis financeiros: derivam da lista de outro perfil ('acao' / 'stock') com naoSeAplica. */
export type PerfilFinanceira = 'acao_financeira' | 'stock_financeira';

/** Perfis com lista própria de 6 critérios em criteria_params (as financeiras derivam). */
export type PerfilComLista = Exclude<PerfilCriterio, PerfilFinanceira>;

export function ehPerfilCriterio(v: unknown): v is PerfilCriterio {
  return typeof v === 'string' && (PERFIS_CRITERIO as readonly string[]).includes(v);
}

export function ehPerfilEua(v: unknown): v is PerfilCriterioEua {
  return typeof v === 'string' && (PERFIS_CRITERIO_EUA as readonly string[]).includes(v);
}

/**
 * Tipos de verificação (port do screen.js):
 * - up: cresceu em todos os anos da janela (J+1 valores, J comparações; empate não conta);
 * - pos: > 0 em todos os J anos; max: ≤ limite em todos os J anos; min: ≥ limite;
 * - months: rendimento pago em todos os 12×J meses (âncora jan/(fim−J+1)–dez/fim, rec. 4);
 * - cagr (F0 do fundamentei-regras; motor na F1): lê os J+1 anos como o 'up', exige todos e atende
 *   com taxa = (fim/início)^(1/J) − 1 > 0. Início ≤ 0: criteria_params.cagr.baseNaoPositiva
 *   ('fim_positivo' = atende se fim > 0, com o fato da base; 'sem_dado' = motivo
 *   'base_nao_positiva'). Fim ≤ 0 = não atende em qualquer modo.
 */
export const TIPOS_CRITERIO = ['up', 'pos', 'max', 'min', 'months', 'cagr'] as const;
export type TipoCriterio = (typeof TIPOS_CRITERIO)[number];

/** Regra do 'cagr' com início ≤ 0 (criteria_params.cagr.baseNaoPositiva; v5 = 'fim_positivo'). */
export const BASES_NAO_POSITIVAS_CAGR = ['fim_positivo', 'sem_dado'] as const;
export type BaseNaoPositivaCagr = (typeof BASES_NAO_POSITIVAS_CAGR)[number];
/** Padrão quando a versão não traz o bloco `cagr` (v1–v4 não têm o tipo; nada muda). */
export const BASE_NAO_POSITIVA_CAGR_PADRAO: BaseNaoPositivaCagr = 'sem_dado';

/**
 * Mês que conta no critério 'mes' dos FIIs (criteria_params.meses.mesReferencia): 'pagamento'
 * (v1–v4, padrão) ou 'data_com' (v5). A regra do vizinho com duas datas-com no mesmo mês só vale
 * em 'data_com' (F1).
 */
export const MESES_REFERENCIA = ['pagamento', 'data_com'] as const;
export type MesReferencia = (typeof MESES_REFERENCIA)[number];
export const MES_REFERENCIA_PADRAO: MesReferencia = 'pagamento';

/**
 * Limite do 'alav' do fii_tijolo na v5 (obrigações ÷ ativo, %): herdado da v4 (decisão 1 do
 * Wellington de 20/10/2026; o Pedro ainda escolhe entre 15 e 16,7 antes do seed em prod — depois
 * disso, mudar = v6).
 */
export const LIMITE_ALAV_ATIVO_V5_PCT = 15;

/**
 * Ids dos critérios (estáveis: URL ?c=, criteria_eval.resultados, CriteriosCompactos):
 * Ações:  rec · luc · ebitda · mg · dl · fcl
 * FII tijolo: rend · vp · vac · alav · mes · res
 * FII papel:  rend · vp · inad · ltv · mes · res   (equivalências vac↔inad, alav↔ltv)
 * Stock (e stock_financeira): rec · luc · ebitda · mg · dl · fcl   (os MESMOS ids das ações)
 * REIT:   rec · dpa · fco_acao · dl · pay · ocup   (dl com limite 6×; ocup inativa sem fonte)
 * Reservado: ffo_acao (fase 2, FFO/ação extraído do 10-K; nenhum perfil da v3 usa).
 */
export const IDS_CRITERIO = [
  'rec',
  'luc',
  'ebitda',
  'mg',
  'dl',
  'fcl',
  'rend',
  'vp',
  'vac',
  'alav',
  'mes',
  'res',
  'inad',
  'ltv',
  // EUA (REIT)
  'dpa',
  'fco_acao',
  'pay',
  'ocup',
  // reservado (fase 2)
  'ffo_acao',
] as const;
export type IdCriterio = (typeof IDS_CRITERIO)[number];

export function ehIdCriterio(v: unknown): v is IdCriterio {
  return typeof v === 'string' && (IDS_CRITERIO as readonly string[]).includes(v);
}

/**
 * Série que alimenta um critério — nomes CANÔNICOS da spec §4.1 (subconjunto de SERIES_FUNDAMENTO,
 * src/types/analiseAtivosFontes.ts). Unidades no motor: R$ mi (revenue, net_income*, ebitda,
 * free_cash_flow, ffo), % (net_margin, vacancy_physical, leverage_pct, default_pct, ltv_avg), ×
 * (net_debt_ebitda), R$/cota (income_per_share, nav_per_share), meses (months_with_income).
 * De onde vêm (FonteCvm, fatia A; um provedor entra antes pela prioridade de criteria_params.fontes):
 * revenue = FY.receita · net_income = lucro dos CONTROLADORES · net_income_adjusted = lucro sem itens
 * não recorrentes (só provedor; sem ele o critério 'luc' usa serieFallback net_income) · ebitda = EBIT
 * + D&A · net_margin = lucro ÷ receita · net_debt_ebitda = (dívida bruta − caixa − aplicações) ÷
 * EBITDA · free_cash_flow = FCO − CAPEX (NUNCA o campo fcf) · income_per_share/nav_per_share =
 * AssetPerShareYearly × fatorCotasApos · leverage_pct = obrigacoesPlPct · ffo = Σ 4 trimestres de
 * resultadoTrimestral · months_with_income = proventos auditados · vacancy_physical =
 * FiiQuarterly.vacanciaFisicaCvmPct (CVM, informe trimestral; papel nsa = sem dado) · default_pct /
 * ltv_avg = fii_property_quality approved (só provedor).
 * EUA (fonte 'sec', fatia B): mesmas séries das ações em US$ mi + dividend_per_share (US$/ação; DPA
 * CashPaid → Declared → derivado), ocf_per_share (FCO ÷ média diluída, US$/ação), cash_payout_pct
 * (dividendos pagos ÷ FCO × 100) e occupancy (%, sem fonte no XBRL). ffo_per_share,
 * affo_per_share e affo_payout_pct ficam reservadas para a fase 2 (10-K com curadoria).
 */
export const SERIES_CRITERIO = [
  'revenue',
  'net_income',
  'net_income_adjusted',
  'ebitda',
  'net_margin',
  'net_debt_ebitda',
  'free_cash_flow',
  'income_per_share',
  'nav_per_share',
  'vacancy_physical',
  'leverage_pct',
  // A6 (fatia 0; série da fatia E): obrigações ÷ ativo total (critério 'alav' do fii_tijolo na v4)
  'leverage_assets_pct',
  'months_with_income',
  'ffo',
  'default_pct',
  'ltv_avg',
  // EUA (REIT; fase 2 reservada)
  'dividend_per_share',
  'ocf_per_share',
  'cash_payout_pct',
  'occupancy',
  'ffo_per_share',
  'affo_per_share',
  'affo_payout_pct',
  // fundamentei-regras (F0): lucro operacional (critério 'ebitda' da v5, mesmo id) e o caixa
  // operacional do REIT ajustado pela SBC (fco_acao/pay da v5, com serieFallback sem ajuste)
  'ebit',
  'ocf_adjusted_per_share',
  'cash_payout_adjusted_pct',
] as const satisfies readonly SerieFundamento[];
export type SerieCriterio = (typeof SERIES_CRITERIO)[number];

/**
 * Nomes LEGADOS (criteria_params v1 e criteria_eval gravados com ela) → nome canônico. O schema do
 * criteria_params aplica o mapa no parse (z.transform): o motor só conhece o nome canônico. Um nome
 * esquecido aqui falharia em silêncio — o teste criteriaParams.test confere a v1 inteira.
 */
export const MAPA_SERIE_LEGADA = {
  receita: 'revenue',
  lucroLiquido: 'net_income',
  ebitda: 'ebitda',
  margemLiquida: 'net_margin',
  dlEbitda: 'net_debt_ebitda',
  fcl: 'free_cash_flow',
  rendCota: 'income_per_share',
  vpCota: 'nav_per_share',
  vacancia: 'vacancy_physical',
  obrigacoesPl: 'leverage_pct',
  mesesRendimento: 'months_with_income',
  resultadoFii: 'ffo',
  inadimplencia: 'default_pct',
  ltv: 'ltv_avg',
} as const satisfies Record<string, SerieCriterio>;
export type SerieCriterioLegada = keyof typeof MAPA_SERIE_LEGADA;
export const SERIES_CRITERIO_LEGADAS = Object.keys(MAPA_SERIE_LEGADA) as [
  SerieCriterioLegada,
  ...SerieCriterioLegada[],
];

/** Nome canônico de uma série (legado → spec; canônico passa igual; desconhecido = null). */
export function serieCanonica(nome: string): SerieCriterio | null {
  if ((SERIES_CRITERIO as readonly string[]).includes(nome)) return nome as SerieCriterio;
  return (MAPA_SERIE_LEGADA as Record<string, SerieCriterio>)[nome] ?? null;
}

/**
 * Observação de um resultado (JSON opcional em criteria_eval.resultados e 4º elemento da
 * MarcaCompacta, sem migration):
 * - lucro_sem_descontado: o critério 'luc' usou a serieFallback (net_income) na janela inteira —
 *   a fonte não entrega o lucro sem itens não recorrentes (tooltip em textosCriterios.obs);
 * - dados_incompletos: a fonte marcou um ponto da janela como incompleto (§6; selo na tela);
 * - obrigacoes_ativo_revisao (A6, fatia 0; a fatia E grava): 'alav' do fii_tijolo na v4 com
 *   obrigações acima de LIMITE_REVISAO_OBRIGACOES_ATIVO_PCT (50%) do ativo em algum ano da janela;
 * - sbc_indisponivel (fundamentei-regras F0; F1 grava): critério do REIT na v5 (fco_acao/pay sobre o
 *   caixa operacional ajustado pela SBC) que usou a serieFallback sem ajuste porque algum ano da
 *   janela não tem a remuneração em ações no 10-K.
 */
export const OBS_CRITERIO = [
  'lucro_sem_descontado',
  'dados_incompletos',
  'obrigacoes_ativo_revisao',
  'sbc_indisponivel',
] as const;
export type ObsCriterio = (typeof OBS_CRITERIO)[number];

export function ehObsCriterio(v: unknown): v is ObsCriterio {
  return typeof v === 'string' && (OBS_CRITERIO as readonly string[]).includes(v);
}

/**
 * Formato dos números do fato (fmtC do screen.js; formatarValorCriterio em textosCriterios.ts):
 * n = inteiro com milhar ('17.500') · n1 = 1 casa · n2 = 2 casas · % = 1 casa + '%' · x = 1 casa
 * + '×'. |v| < 0,05 vira 0 (exceto n2); sinal negativo tipográfico '−'.
 */
export type FormatoCriterio = 'n' | 'n1' | 'n2' | '%' | 'x';

/** Unidade exibida entre parênteses no fato de 'up' ('cresceu … (R$ mi)'; EUA em US$). */
export const UNIDADES_CRITERIO = ['R$ mi', 'R$ bi', 'R$', 'US$ mi', 'US$ bi', 'US$'] as const;
export type UnidadeCriterio = (typeof UNIDADES_CRITERIO)[number];

/** Os 4 estados de um critério. 'sem_dado' conta como não atende. */
export const ESTADOS_CRITERIO = ['atende', 'nao_atende', 'sem_dado', 'nao_se_aplica'] as const;
export type EstadoCriterio = (typeof ESTADOS_CRITERIO)[number];

/**
 * Por que o critério não tem resultado normal (texto em textosCriterios.motivos):
 * - sem_dado_demonstracoes: valor ausente em algum ano exigido da janela (ou ano em conferência);
 * - sem_fonte_confiavel: critério inativo por D3 (só v1; na v2 vacância, inadimplência e LTV ficam
 *   ativos e, sem fonte, caem em sem_dado_demonstracoes). v3 (EUA): ocupação do REIT (não existe
 *   no XBRL; 'não atende · sem dado', conta no "de 6");
 * - base_proventos_curta: base de proventos começa depois do início da janela (rec. 4,
 *   params.meses.mesesBaseCurta = 'sem_dado');
 * - ebitda_nao_positivo: Dív.líq/EBITDA com EBITDA ≤ 0 e DL > 0 (fora, fato 'EBITDA ≤ 0 em AAAA');
 * - instituicao_financeira: n/a para bancos/seguradoras/holdings (D4; na v2 só se religado por
 *   params — naoSeAplica / margemSemReceitaComparavel);
 * - base_nao_positiva (fundamentei-regras F0; F1 grava): 'cagr' com o primeiro ano da janela ≤ 0 e
 *   criteria_params.cagr.baseNaoPositiva = 'sem_dado' (a taxa anual não se calcula).
 */
export type MotivoCriterio =
  | 'sem_dado_demonstracoes'
  | 'sem_fonte_confiavel'
  | 'base_proventos_curta'
  | 'ebitda_nao_positivo'
  | 'instituicao_financeira'
  | 'base_nao_positiva';

/** Ponto anual da janela (mini-barras). valor null = sem dado naquele ano. */
export interface PontoCriterio {
  ano: number;
  valor: number | null;
}

// ===========================================================================
// Resultado da avaliação (motor puro da fatia A → criteria_eval)
// ===========================================================================

/**
 * Resultado de UM critério numa janela (= item de CriteriaEval.resultados).
 * - n/de: contagem de anos (ou meses, em 'months'); null em sem_dado/nao_se_aplica;
 * - fato: frase factual pronta ('cresceu em 5 de 5 anos · 17.500 → 40.800 (R$ mi)');
 * - serie: valores da janela (null quando não há série: months, sem dado, n/a).
 */
export interface ResultadoCriterio {
  id: IdCriterio;
  estado: EstadoCriterio;
  n: number | null;
  de: number | null;
  fato: string;
  motivo?: MotivoCriterio;
  serie: PontoCriterio[] | null;
  /**
   * v2.5: ids das fontes cujos valores entraram na janela, na ordem da prioridade ('cvm', id do
   * provedor). Ausente = só a CVM (avaliações v1). A nota de fonte do card é montada daqui
   * (textosCriterios.textoNotaFonte).
   */
  fonte?: IdFonte[];
  /** v2.5: observações (fallback do lucro descontado, dados incompletos). Ausente = nenhuma. */
  obs?: ObsCriterio[];
}

/** Avaliação de um ativo numa janela (= uma linha de criteria_eval sem as chaves técnicas). */
export interface AvaliacaoJanela {
  janela: Janela;
  anoInicio: number;
  anoFim: number;
  /** contagem de 'atende' (não é nota) */
  atendidos: number;
  /** critérios que se aplicam ao perfil (6; financeira 3 na v1; EUA 6) */
  aplicaveis: number;
  /** true quando NENHUM critério aplicável tem dado na janela */
  semDado: boolean;
  resultados: ResultadoCriterio[];
}

/** Avaliação completa de um ativo (as 3 janelas), saída de avaliarAtivo (fatia A). */
export interface AvaliacaoAtivo {
  symbol: string;
  classe: ClasseQuadro;
  perfil: PerfilCriterio;
  paramsVersion: number;
  janelas: Record<ChaveJanela, AvaliacaoJanela>;
}

/** Marca compacta: [id, estado, fato] ou, na v2.5, [id, estado, fato, obs] (obs só quando há). */
export type MarcaCompacta =
  | [IdCriterio, EstadoCriterio, string]
  | [IdCriterio, EstadoCriterio, string, ObsCriterio[]];

/**
 * Cópia compacta gravada em AnaliseQuadroLinha.criterios (fatia A; lida pela B):
 * {"3":{n,de,m:[[id,estado,fato]…]},"5":…,"10":…}. Ordem de `m` = ordem dos critérios do perfil.
 */
export type CriteriosCompactos = Partial<
  Record<ChaveJanela, { n: number; de: number; m: MarcaCompacta[] }>
>;

// ===========================================================================
// APIs
// ===========================================================================

/** Marca de uma linha do Quadro (projeção da janela pedida). */
export interface MarcaCriterioLinha {
  id: IdCriterio;
  estado: EstadoCriterio;
  fato: string;
  /** v2.5: tooltip do fallback do lucro / selo de dados incompletos (CelulaCriterios) */
  obs?: ObsCriterio[];
}

/**
 * LinhaQuadroApi.criterios (fatia B) e pares (C2): a janela pedida. null = sem avaliação ainda.
 * `marcas` na ordem do perfil (k = marcas.length; `de` exclui os 'nao_se_aplica').
 */
export interface CriteriosLinhaApi {
  janela: Janela;
  n: number;
  de: number;
  marcas: MarcaCriterioLinha[];
  perfil: PerfilCriterio;
}

/** Item completo de um critério no topo do ativo (card de critérios, fatia C2). */
export interface ItemCriterioApi {
  id: IdCriterio;
  rotulo: string;
  definicao: string;
  estado: EstadoCriterio;
  n: number | null;
  de: number | null;
  fato: string;
  motivo?: MotivoCriterio;
  serie: PontoCriterio[] | null;
  formato: FormatoCriterio;
  unidade?: UnidadeCriterio;
  /** v2.5: fontes da janela (ResultadoCriterio.fonte) */
  fonte?: IdFonte[];
  /** v2.5: observações (ResultadoCriterio.obs) */
  obs?: ObsCriterio[];
}

export interface JanelaCriteriosApi {
  anoInicio: number;
  anoFim: number;
  atendidos: number;
  aplicaveis: number;
  itens: ItemCriterioApi[];
}

/**
 * AtivoTopoResposta.criterios (fatia C2): as 3 janelas na MESMA resposta (trocar a pílula não refaz
 * requisição). < 30 KB no total do topo.
 * - fonte: 'DFP/ITR (CVM)' | 'informes de FIIs (CVM)' (v2.4); v2.5: nota montada pelas origens
 *   (textosCriterios.textoNotaFonte(classe, fontes)) — 'Fonte: ‹provedor› · DFP/ITR (CVM).';
 * - fontes: ids das fontes usadas em alguma janela (união, na ordem da prioridade);
 * - dadosIncompletos: alguma janela tem obs 'dados_incompletos' (selo §6);
 * - observacaoPerfil: FoF/indefinido 'avaliado com os critérios de papel (regra de composição)', ou null.
 */
export interface CriteriosAtivo {
  perfil: PerfilCriterio;
  fonte: string;
  /** v2.5 */
  fontes?: IdFonte[];
  /** v2.5 */
  dadosIncompletos?: boolean;
  anoFim: number;
  paramsVersion: number;
  observacaoPerfil: string | null;
  janelas: Record<ChaveJanela, JanelaCriteriosApi>;
}

/**
 * Definição de um chip da barra de filtros (QuadroResposta.definicoes, fatia B). Em FII o chip é o
 * PAR tijolo/papel (equivalencias vac↔inad, alav↔ltv): `equivalente` traz o critério de papel.
 * Chip desabilitado (vac/inad, D3) vem com habilitado=false e motivoDesabilitado (tooltip) +
 * seloSemDado=true. O par alav/ltv fica HABILITADO (o tooltip explica que papel fica de fora).
 */
export interface DefCriterioChip {
  id: IdCriterio;
  rotulo: string;
  definicao: string;
  equivalente: { id: IdCriterio; rotulo: string; definicao: string } | null;
  habilitado: boolean;
  motivoDesabilitado: string | null;
  seloSemDado: boolean;
}

/**
 * GET /api/analise-ativos/ativos/[ticker]/comparar-sugestoes?q=&janela= (fatia C1).
 * Pares primeiro, depois A–Z; em FII só o mesmo tipo; nunca o próprio ativo; até 8 (12 com q).
 * `metrica` = métrica-resumo da classe já formatada (ex.: P/L 10,0× · DY 9,0%).
 */
export interface SugestaoComparar {
  ticker: string;
  nome: string;
  mesmoSetor: boolean;
  metrica: { rotulo: string; valor: Estado<number>; formato: FormatoAnalise } | null;
  criterios: { n: number; de: number } | null;
}

export interface SugestoesCompararResposta {
  ticker: string;
  janela: Janela;
  itens: SugestaoComparar[];
}

/**
 * ComparadorResposta.leitura (fatia D): SÓ contagens, na ordem dos slots. `texto` é o literal
 * 'leitura-dos-dados' de TEXTOS_LITERAIS_OBRIGATORIOS (renderizado com data-texto-legal).
 */
export interface LeituraDosDados {
  janela: Janela;
  contagens: Array<{ ticker: string; n: number | null; de: number | null }>;
  texto: string;
}

// ===========================================================================
// Cenários V2 (fatia C2) — premissas em branco, desacopladas do ScoringParams
// ===========================================================================

/** Premissas de AÇÃO v2: o usuário informa; null = "informe …". margem 0 por padrão. */
export interface PremissasAcaoV2 {
  yieldPct: number | null;
  gPct: number | null;
  kPct: number | null;
  margemPct: number;
  /** P/L alvo; padrão = média 10a (fato) ou null */
  plAlvo: number | null;
}

/** Premissas de FII v2. */
export interface PremissasFiiV2 {
  yieldPct: number | null;
  pvpAlvo: number | null;
  rendaMensal: number | null;
  margemPct: number;
}

// ===========================================================================
// Carteira — v2.5: base ÚNICA = carteira TOTAL (spec §3.2/§5, caso 33; planning_asset_targets)
// ===========================================================================

/** Entrada de desvioAlvo (puro): todos os valores na MESMA base. */
export interface EntradaDesvioAlvo {
  /** valor de mercado da posição (R$) */
  valorPosicao: number;
  /**
   * Base de posição, alvo e desvio. Desde 17/10/2026 a página do ativo passa o valor da ABA (soma
   * das linhas da aba), porque o alvo é o Objetivo da Carteira (% dentro da aba); na v2.5 era a
   * carteira TOTAL (caso 33: 6.276 ÷ 0,038).
   */
  valorBase: number;
  /** alvo em % de valorBase (Objetivo da Carteira; null = sem alvo) */
  alvoPct: number | null;
  /** cotação usada para as quantidades */
  preco: number | null;
}

export interface ResultadoDesvioAlvo {
  posicaoPct: number;
  alvoValor: number | null;
  alvoQtd: number | null;
  /** posição − alvo, em p.p. da base (negativo = abaixo do alvo) */
  desvioPp: number | null;
  desvioValor: number | null;
  desvioQtd: number | null;
}

/**
 * Origem da seção da Carteira numa compra (secaoOperacao). v2.5 (fatia C): seção AUTOMÁTICA, nesta
 * ordem — 'posicao' (recompra) → 'planejado' (Watchlist.secao antiga) → 'sugestao_cvm' (fiiTipoCvm
 * 'fof' → 'fofi'; FII pelo perfil: fii_tijolo → 'tijolo', senão 'tvm') → 'padrao' (ação → 'value').
 * 'obrigatoria' é da v2.4 e deixa de ser devolvida na fatia C (o modal perde o campo Seção).
 */
export type OrigemSecaoOperacao =
  | 'posicao'
  | 'planejado'
  | 'sugestao_cvm'
  | 'padrao'
  | 'obrigatoria';

export interface SecaoOperacao {
  /** estrategia (ação: value|growth|risk) ou tipoFii (FII: tijolo|tvm|fofi…); null só na v2.4 */
  valor: string | null;
  editavel: boolean;
  origem: OrigemSecaoOperacao;
}

// ===========================================================================
// PROPS dos componentes (fatia 0 = comuns; demais com os donos indicados)
// ===========================================================================

// ---- 0 (comuns, neutros, 44 px) ----------------------------------------------

/**
 * MarcaCriterio — ✓ em círculo de 22 px preenchido (tinta neutra gray-700 / gray-300 no escuro);
 * — em círculo vazado (não atende E sem dado); n/a em pílula tracejada. NUNCA verde/vermelho.
 * Texto para leitor de tela sempre presente (sr-only), salvo `decorativa`.
 */
export interface MarcaCriterioProps {
  estado: EstadoCriterio;
  /** 'md' = 22 px (card, comparador); 'sm' = 16 px (listas densas) */
  tamanho?: 'sm' | 'md';
  /** sem texto sr-only (quando o pai já descreve o estado) */
  decorativa?: boolean;
  /**
   * Tinta do ✓ atendido: 'neutro' (padrão: Quadro, Comparador, células) ou 'verde' (SÓ na página
   * do ativo — exceção à paleta autorizada pelo Wellington 17/10). Os demais estados são neutros.
   */
  tom?: 'neutro' | 'verde';
  className?: string;
}

/**
 * CelulaCriterios — célula "Critérios" do Quadro/pares/cartões: k quadradinhos neutros (cheio =
 * atende; vazio = não atende ou sem dado; tracejado = não se aplica) + 'n de k'. É um <button>
 * min-h-11 com aria-label completo e tooltip em hover, foco e toque, que NÃO abre a linha
 * (stopPropagation). `rotulos` (id → rótulo) vem de QuadroResposta.definicoes.
 */
export interface CelulaCriteriosProps {
  criterios: CriteriosLinhaApi | null;
  ticker: string;
  rotulos?: Partial<Record<IdCriterio, string>>;
  /** nota de perfil no tooltip (FoF/indefinido) */
  observacaoPerfil?: string | null;
  className?: string;
}

/**
 * PilulasJanela — radiogroup 3 | 5 | 10 anos; pílula visível de 32 px dentro de alvo de 44 px;
 * setas ← → movem a seleção (roving tabindex).
 */
export interface PilulasJanelaProps {
  valor: Janela;
  onTrocar: (janela: Janela) => void;
  opcoes?: readonly Janela[];
  /** nome acessível do grupo; padrão textosCriterios.janela.rotuloGrupo */
  rotuloGrupo?: string;
  /** 'compacta' = '3a | 5a | 10a' */
  variante?: 'padrao' | 'compacta';
  className?: string;
}

/**
 * MiniBarrasAnuais — barras dos anos da janela em #396CAA / #6E9DC4 (sem cor semântica; valor
 * negativo em vermelho SÓ no texto do valor). role="img" com aria-label de todos os anos; hover e
 * foco mostram 'ano: valor'. Ano sem dado = contorno tracejado.
 */
export interface MiniBarrasAnuaisProps {
  serie: PontoCriterio[];
  formato: FormatoCriterio;
  unidade?: UnidadeCriterio;
  /** rótulo do critério para o aria-label ('Receita crescente') */
  rotulo: string;
  /** linha de referência do limite (max/min), opcional */
  limite?: number;
  className?: string;
}

// ---- A (motor) ----------------------------------------------------------------

/** Entrada de avaliarAtivo: séries anuais (ano → valor) por critério + proventos. */
export interface EntradaAvaliacaoAtivo {
  symbol: string;
  classe: ClasseQuadro;
  perfil: PerfilCriterio;
  /** ano final global (ancoraJanela) */
  anoFim: number;
  /**
   * série anual por SerieCriterio (nome canônico); ano ausente = sem dado; anos em conferência já
   * removidos. v2.5: saída de resolverSeries (todas as fontes, pela prioridade).
   */
  series: Partial<Record<SerieCriterio, Record<number, number | null>>>;
  /**
   * v2.5: origem por série e ano (resolverSeries). Ausente = só CVM, sem fallback nem incompleto
   * (entradas v2.4 e fixtures antigas).
   */
  origens?: Partial<Record<SerieFundamento, Record<number, OrigemSerie>>>;
  /**
   * v2.5: meses com rendimento POR ANO (provedor que entrega contagens anuais). Quando presente e
   * com todos os anos da janela, avaliarMeses usa n = Σ, de = 12×J; qualquer ano nulo = sem dado.
   */
  mesesPorAno?: Record<number, number | null>;
  /** meses com rendimento pago até dez/anoFim e o mês de início da base (meses) */
  meses: {
    consecutivos: number;
    inicioBase: string | null;
    mesesPagos?: readonly string[];
  } | null;
}

/** Entrada de perfilCriterios (regra única de perfil). */
export interface EntradaPerfilCriterios {
  classe: ClasseQuadro;
  ehFinanceira: boolean;
  fiiTipo: FiiTipoTela | null;
  /** (imóveis + SPE) ÷ PL em %, para híbrido/indefinido/FoF/sem tipo; null = sem dado */
  imoveisPlPct: number | null;
}

// ---- B (Quadro) ---------------------------------------------------------------

/** BarraFiltrosCriterios — janela + chips (definicoes) + Na minha carteira + Setor + Limpar. */
export interface BarraFiltrosCriteriosProps {
  classe: ClasseQuadro;
  janela: Janela;
  definicoes: DefCriterioChip[];
  /** ids ligados (E lógico) */
  selecionados: IdCriterio[];
  naCarteira: boolean;
  setor: string | null;
  setores: string[];
  onTrocarJanela: (janela: Janela) => void;
  onAlternarCriterio: (id: IdCriterio) => void;
  onAlternarNaCarteira: () => void;
  onTrocarSetor: (setor: string | null) => void;
  onLimpar: () => void;
  className?: string;
}

/** RodapeCriterios — literal 'rodape-quadro' com data-texto-legal. */
export interface RodapeCriteriosProps {
  className?: string;
}

// ---- C1 (cabeçalho do ativo e modais da Carteira) -------------------------------

/** Os 4 modais da linha de ações do cabeçalho. */
export type ModalAcaoAtivo = 'comparar' | 'planejar' | 'verNaCarteira' | 'registrar';

/**
 * BarraAcoesAtivo — Comparar (com recurso) · Planejar na carteira/Ajustar plano · Ver na Carteira ·
 * Registrar operação (único primário, navy). 44 px; no celular grade 2×2 e Registrar largura toda.
 */
export interface BarraAcoesAtivoProps {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  assetId: string | null;
  preco: number | null;
  /** fiiTipo da CVM (sugestão de seção na 1ª compra) */
  fiiTipo: FiiTipoTela | null;
  className?: string;
}

/** ModalAnalise — Dialog no desktop / BottomSheet + useMobileHistoryLayer no celular. */
export interface ModalAnaliseProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** 500 (padrão) ou 660 px */
  largura?: 'padrao' | 'larga';
  children: ReactNode;
  rodape?: ReactNode;
}

interface PropsModalAtivoBase {
  aberto: boolean;
  onFechar: () => void;
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
}

export interface ModalCompararProps extends PropsModalAtivoBase {
  janela?: Janela;
}

export interface ModalPlanejarProps extends PropsModalAtivoBase {
  assetId: string | null;
  preco: number | null;
}

export interface ModalVerNaCarteiraProps extends PropsModalAtivoBase {
  assetId: string | null;
}

export interface ModalRegistrarOperacaoProps extends PropsModalAtivoBase {
  assetId: string | null;
  preco: number | null;
  fiiTipo: FiiTipoTela | null;
  /** 'venda' só é oferecida com posição */
  operacaoInicial?: 'compra' | 'venda';
}

// ---- C2 (página do ativo) -------------------------------------------------------

/** CardCriterios — lê AtivoTopoResposta.criterios; janela local (sem nova requisição). */
export interface CardCriteriosProps {
  ticker: string;
  classe: ClasseQuadro;
  criterios: CriteriosAtivo | null;
  janelaInicial?: Janela;
  className?: string;
}

/** ItemCriterio — MarcaCriterio + rótulo + MiniBarrasAnuais + fato + definição. */
export interface ItemCriterioProps {
  item: ItemCriterioApi;
  janela: Janela;
  className?: string;
}

// ---- D (Comparador) ---------------------------------------------------------------

/** BlocoCriteriosComparador — "Critérios de fundamentos · N anos", primeiro bloco da tabela. */
export interface BlocoCriteriosComparadorProps {
  janela: Janela;
  tickers: string[];
  /** critérios por ticker, na ordem dos slots (null = sem avaliação) */
  criterios: Record<string, CriteriosLinhaApi | null>;
  /** id → rótulo (no misto, 'Obrigações/PL ≤ 20% / LTV ≤ 60%') */
  rotulos: Partial<Record<IdCriterio, string>>;
  className?: string;
}

/** LeituraDosDados — só contagens + literal 'leitura-dos-dados' (data-texto-legal). */
export interface LeituraDosDadosProps {
  leitura: LeituraDosDados;
  className?: string;
}

/** SeletorTipoFii — 'Tijolo | Papel' (só em FIIs). */
export interface SeletorTipoFiiProps {
  valor: 'tijolo' | 'papel';
  onTrocar: (valor: 'tijolo' | 'papel') => void;
  className?: string;
}
