/**
 * CONTRATOS da A6 da Análise de Ativos — dados complementares trazidos como IDEIA de conteúdo
 * (docs/analise-ativos/fundamentei-trazer/desenho.json, fatia 0). Congelados: as fatias A–F programam
 * contra estes tipos. Mudança de contrato depois do 0 = PR próprio + rebase das fatias.
 *
 * Os 7 itens: (1) imóveis do FII + resumo e (2) composição do FII — fatia A; (3) template de banco e
 * (4) de seguradora — fatia B; (5) retornos acumulados da cotação — fatias C (página) e F
 * (Comparador); (6) dados societários + dividendo mínimo do estatuto (FRE) — fatia D; (7) alavancagem
 * do FII sobre o ativo (obrigações ÷ ativo) — fatia E.
 *
 * Regras que valem para todos:
 * - Dados SÓ do banco, gravados por job a partir de fontes públicas (CVM dados abertos, B3 COTAHIST).
 *   Nenhuma rota chama terceiros na requisição; nenhum valor de terceiros no produto ou no banco.
 * - Nenhuma chave de resposta com indice/semaforo/destaque/nota/rating/score (contratoSemNota.test).
 *   Textos só nos módulos de textos (textosImoveisFii, textosRetornos, textosSocietario,
 *   textosFinanceiras e as chaves novas de textosAtivo/textosRaioX/textosComparador/textosCriterios),
 *   todos na varredura linguagemV2Global.
 * - Decisões do Wellington (19/10, decisoes.md): alavancagem do fii_tijolo na v4 = obrigações ÷ ativo
 *   ≤ 15%; retornos SEM verde/vermelho (sinal +/− em cor neutra; cor só na variação do dia); retorno
 *   só de preço ("sem proventos" + nota explícita no FII); dividendo mínimo = texto do FRE 2022 +
 *   "pode ter sido alterado" + link do FRE vigente (sem PDF, sem rad.cvm); acionistas PF só nome e %,
 *   CPF/CNPJ do acionista NUNCA guardado nem mostrado.
 * - Chaves desligadas por padrão (analiseAtivosConfig.ts). Desligadas, a tela e as APIs ficam
 *   exatamente como hoje: os campos opcionais abaixo ficam AUSENTES e as rotas novas respondem 404.
 *
 * Mapa de rotas novas (dono):
 *   GET /api/analise-ativos/ativos/[ticker]/imoveis-fii → ImoveisFiiResposta  (A; chave IMOVEIS_FII)
 *   GET /api/analise-ativos/ativos/[ticker]/societario  → SocietarioResposta  (D; chave SOCIETARIO)
 * Os retornos vão no topo (AtivoTopoResposta.retornos, C) e os templates no Essencial/Raio-X
 * (FundamentosResposta.template / RaioXResposta.template, B).
 */
import type { ClasseBr, Estado, FiiTipoTela } from '@/types/analiseAtivosApi';

// ===========================================================================
// Chaves e recursos
// ===========================================================================

/** Recursos de TELA da A6 (entram em RecursosBlocoD; cada um com a sua chave, sem dependência). */
export const RECURSOS_COMPLEMENTOS = [
  'imoveisFii',
  'templatesFinanceiras',
  'retornos',
  'societario',
  'alavAtivo',
] as const;
export type RecursoComplemento = (typeof RECURSOS_COMPLEMENTOS)[number];

/** Variável de ambiente de cada recurso de tela (lida em src/lib/analiseAtivosConfig.ts). */
export const ENV_RECURSO_COMPLEMENTO: Readonly<Record<RecursoComplemento, string>> = {
  imoveisFii: 'ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO',
  templatesFinanceiras: 'ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO',
  retornos: 'ANALISE_ATIVOS_RETORNOS_HABILITADO',
  societario: 'ANALISE_ATIVOS_SOCIETARIO_HABILITADO',
  alavAtivo: 'ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO',
};

/** Chave de INGESTÃO (não é tela): o cvm-cias lê a DVA das financeiras (fatia B). */
export const ENV_CVM_DVA = 'ANALISE_ATIVOS_CVM_DVA';

// ===========================================================================
// Jobs novos (registrados na fatia 0 como stub 'pulado')
// ===========================================================================

export const NOMES_JOBS_COMPLEMENTOS = ['retornos-cotacao', 'cvm-fre-societario'] as const;
export type NomeJobComplemento = (typeof NOMES_JOBS_COMPLEMENTOS)[number];

export interface DefJobComplemento {
  /** módulo que o catálogo importa (o corpo é da fatia dona) */
  modulo: string;
  fatia: 'C' | 'D';
  /** linha de cron PROPOSTA (UTC). Prod: edição manual de /etc/cron.d/myfinance, com OK */
  cron: string;
  /** meta de pico de RSS medida em processo próprio (rodar-job.ts com /usr/bin/time -v) */
  rssMetaMb: number;
  prazoMs: number;
}

/**
 * retornos-cotacao: diário 11:40 UTC de terça a sábado (depois de scores, criterios, quadro,
 * alertas-salvos 11:10 e eua-diario 11:25), lotes de LOTE_RETORNOS símbolos, trava de concorrência do
 * criterios (outro job pesado rodando ⇒ 'pulado'). cvm-fre-societario: domingo 06:10 UTC, streaming,
 * só emissores do universo. Os dois em processo separado (myfinance-job.sh, pesado:true).
 */
export const JOBS_COMPLEMENTOS: Readonly<Record<NomeJobComplemento, DefJobComplemento>> = {
  'retornos-cotacao': {
    modulo: 'src/services/analiseAtivos/calculo/executarRetornos.ts',
    fatia: 'C',
    cron: '40 11 * * 2-6',
    rssMetaMb: 150,
    prazoMs: 240_000,
  },
  'cvm-fre-societario': {
    modulo: 'src/services/analiseAtivos/acoes/sincronizarFreSocietario.ts',
    fatia: 'D',
    cron: '10 6 * * 0',
    rssMetaMb: 120,
    prazoMs: 540_000,
  },
};

/** Motivo do 'pulado' dos stubs da fatia 0 (a fatia dona troca pelo corpo do job). */
export const MOTIVO_JOB_NAO_IMPLEMENTADO = 'ainda não implementado (A6, fatia 0: stub)';

// ===========================================================================
// Rotas novas
// ===========================================================================

export const ROTAS_COMPLEMENTOS = {
  imoveisFii: (ticker: string) =>
    `/api/analise-ativos/ativos/${encodeURIComponent(ticker)}/imoveis-fii`,
  societario: (ticker: string) =>
    `/api/analise-ativos/ativos/${encodeURIComponent(ticker)}/societario`,
} as const;

// ===========================================================================
// Itens 1 e 2 — imóveis e composição do FII (fatia A)
// ===========================================================================

/**
 * Fatias da composição (igual ao Fundamentei), em ordem fixa, sobre a BASE = soma das 4 fatias
 * (sem valores a receber, LCI/LCA e demais ativos). 'imoveis' inclui SPE. Nulo com o ativo/passivo
 * presente conta como 0.
 */
export const CODIGOS_FATIA_COMPOSICAO = [
  'imoveis',
  'cri_cra',
  'cotas_fii',
  'caixa_renda_fixa',
] as const;
export type CodigoFatiaComposicao = (typeof CODIGOS_FATIA_COMPOSICAO)[number];

export interface FatiaComposicaoFiiApi {
  codigo: CodigoFatiaComposicao;
  /** % da base (0 aparece como 0, nunca some: as mesmas fatias em todos os FIIs) */
  pct: number;
  /** R$ */
  valor: number;
}

export interface ComposicaoFiiApi {
  /** mês do informe (AAAA-MM-DD, 1º dia do mês de fii_monthly.refMonth) */
  refMonth: string;
  /** R$ */
  ativoTotal: number;
  /** R$: caixa + imóveis + papéis + fundos (denominador dos percentuais) */
  base: number;
  fatias: FatiaComposicaoFiiApi[];
}

/** Motivos de Estado da composição e da lista (texto em TEXTOS_IMOVEIS_FII.motivos). */
export type MotivoComposicaoFii =
  | 'sem_informe_mensal'
  | 'composicao_inconsistente'
  | 'cnpj_em_conferencia';
export type MotivoListaImoveisFii =
  | 'sem_informe_trimestral'
  | 'sem_imoveis_renda'
  | 'cnpj_em_conferencia'
  /** papel e FoF: a lista não se aplica (só a composição) */
  | 'nao_se_aplica_tipo';

export interface ImovelFiiApi {
  /** posição no informe (estável dentro da versão) */
  ordem: number;
  nome: string | null;
  /** texto da CVM como informado (a tela trunca e põe o completo em title) */
  endereco: string | null;
  /** UF inferida do endereço; null = não identificada */
  uf: string | null;
  /** área informada à CVM (não é ABL) */
  areaM2: number | null;
  unidades: number | null;
  vacanciaPct: number | null;
  /** % da receita do FII, como informado (sem normalizar) */
  receitaPct: number | null;
}

/** Imóvel de outra classe (terreno, em construção…): vai para o expansível 'Outros imóveis (N)'. */
export interface ImovelOutroFiiApi {
  ordem: number;
  nome: string | null;
  /** classe como informada à CVM */
  classe: string | null;
  areaM2: number | null;
}

/** Setor dos locatários, só quando real (nunca o genérico 'SetorN'). */
export interface SetorLocatarioApi {
  setor: string;
  /** % da receita do FII, como informado */
  receitaPct: number | null;
}

export interface ResumoImoveisFiiApi {
  nImoveisRenda: number;
  nOutros: number;
  /** soma das áreas informadas à CVM (m²) */
  areaTotalM2: number | null;
  /** a MESMA célula do Essencial (vacância física ponderada, fonte CVM) */
  vacanciaFisicaPct: Estado<number>;
  /** 'N estados identificados no endereço (em X de Y imóveis)' */
  nEstados: number;
  nComUf: number;
  /** vazio = só 'Locatários: sem dado · a CVM não publica os locatários por nome' */
  setores: SetorLocatarioApi[];
}

export interface ListaImoveisFiiApi {
  /** último dia do trimestre (AAAA-MM-DD) */
  refQuarter: string;
  resumo: ResumoImoveisFiiApi;
  /** imóveis de renda, ordenados por área decrescente */
  imoveis: ImovelFiiApi[];
  outros: ImovelOutroFiiApi[];
  /** soma do % da receita dos imóveis de renda; fora de FAIXA_SOMA_RECEITA ⇒ aviso na tela */
  somaReceitaPct: number | null;
  somaReceitaForaDaFaixa: boolean;
}

/**
 * GET /api/analise-ativos/ativos/[ticker]/imoveis-fii (só FII; ação ⇒ 404). Chave desligada ⇒ 404
 * antes da sessão. Cache-Control: private, max-age=300.
 */
export interface ImoveisFiiResposta {
  ticker: string;
  composicao: Estado<ComposicaoFiiApi>;
  imoveis: Estado<ListaImoveisFiiApi>;
  versao: string;
}

/** Faixa em que a soma do % da receita dos imóveis é lida sem aviso (90–105%). */
export const FAIXA_SOMA_RECEITA_PCT = { min: 90, max: 105 } as const;
/** Setor genérico do CSV de inquilino ('Setor1', 'Setor 2'…): placeholder, nunca exibido. */
export const RE_SETOR_PLACEHOLDER = /^setor\s*\d+$/i;

// ===========================================================================
// Itens 3 e 4 — templates de banco e seguradora (fatia B)
// ===========================================================================

/** Template do Essencial/Raio-X de financeira (ausente = template de hoje). */
export type TemplateFinanceira = 'banco' | 'seguradora';

/**
 * Colunas do Essencial 'banco' (ordem da tela). Basileia fica fora (observação de fase 2). PDD em
 * valor absoluto; PDD ÷ lucro com lucro ≤ 0 = '—' com o motivo.
 */
export const COLUNAS_ESSENCIAL_BANCO = [
  'receitaIntermediacao',
  'pdd',
  'lucroLiquido',
  'margemBancaria',
  'pddLucro',
  'ativoTotal',
  'patrimonio',
  'roe',
  'divJcp',
  'payout',
  'dy',
  'pl',
  'pvp',
] as const;
export type CodigoColunaBanco = (typeof COLUNAS_ESSENCIAL_BANCO)[number];

/**
 * Colunas do Essencial 'seguradora'. Receita operacional = seguro/resseguro na operacional;
 * comissões + serviços na holding (ColunaFundamentos.tooltip diz qual). Equivalência nas
 * operacionais = '—' 'não se aplica ao modelo de negócio'.
 */
export const COLUNAS_ESSENCIAL_SEGURADORA = [
  'receitaOperacional',
  'equivalencia',
  'resultadoFinanceiro',
  'lucroLiquido',
  'margemLiquida',
  'roe',
  'patrimonio',
  'divJcp',
  'payout',
  'dy',
] as const;
export type CodigoColunaSeguradora = (typeof COLUNAS_ESSENCIAL_SEGURADORA)[number];

/** Qual receita a seguradora usa na coluna 'receitaOperacional'. */
export type OrigemReceitaSeguradora = 'comissoes_servicos' | 'receita_seguro' | 'premios_ganhos';

/** Linhas novas do Raio-X de banco (as comuns reusam os códigos de CodigoLinhaRaioXAcao). */
export type CodigoLinhaRaioXBanco =
  | 'receitaIntermediacao'
  | 'pdd'
  | 'pddLucro'
  | 'margemBancariaPct'
  | 'ativoTotal'
  | 'plAtivoPct';

/**
 * Linhas novas do Raio-X de seguradora. Sinistralidade (sinistros retidos ÷ prêmios ganhos) só até
 * 2022; despesa ÷ receita de seguro (IFRS 17) desde ANO_IFRS17. No outro regime: '—' com o motivo.
 */
export type CodigoLinhaRaioXSeguradora =
  | 'receitaOperacional'
  | 'equivalenciaPatrimonial'
  | 'resultadoFinanceiro'
  | 'sinistralidadePct'
  | 'despesaReceitaSeguroPct';

/** Linha nova do Raio-X FII (bloco alavancagem_custos; lê asset_multiples_yearly.obrigacoesAtivoPct). */
export type CodigoLinhaRaioXFiiComplemento = 'obrigacoesAtivoPct';

/** Blocos novos do Raio-X de financeira. */
export type CodigoBlocoRaioXFinanceira =
  | 'intermediacao_resultado'
  | 'balanco'
  | 'receita_resultado'
  | 'operacao_seguros'
  | 'proventos';

/** Primeiro ano em IFRS 17 (sinistralidade não existe daí em diante). */
export const ANO_IFRS17 = 2023;

/** Contas da DVA lidas só para emissor financeiro (ANALISE_ATIVOS_CVM_DVA). */
export const CONTAS_DVA_FINANCEIRA = { receitaIntermediacao: '7.01.01', pdd: '7.01.03' } as const;

// ===========================================================================
// Item 5 — retornos acumulados da cotação (fatias C e F)
// ===========================================================================

export const JANELAS_RETORNO = ['1m', '12m', '5a', '10a'] as const;
export type JanelaRetorno = (typeof JANELAS_RETORNO)[number];

/** Janelas anualizadas (a.a.). */
export const JANELAS_RETORNO_ANUALIZADAS: readonly JanelaRetorno[] = ['5a', '10a'];

/**
 * Flags gravadas em asset_retornos_cotacao.flags. 'evento_nao_confirmado' esconde 12m/5a/10a (o
 * "1a/5a/10a" do desenho) com o motivo; 'serie_curta_<janela>' = sem pregão na data-alvo dentro da
 * tolerância (10a: 'sem dado · menos de 10 anos de cotação neste código').
 */
export const FLAGS_RETORNO = [
  'serie_curta_1m',
  'serie_curta_12m',
  'serie_curta_5a',
  'serie_curta_10a',
  'evento_nao_confirmado',
  'sem_cotacao_recente',
] as const;
export type FlagRetorno = (typeof FLAGS_RETORNO)[number];

/** Motivos de Estado de uma janela (texto em TEXTOS_RETORNOS.motivos). */
export type MotivoRetorno = 'serie_curta' | 'evento_nao_confirmado' | 'sem_cotacao';

export interface RetornoJanelaApi {
  janela: JanelaRetorno;
  /** % (pontos percentuais); anualizado em 5a/10a. Sinal +/− em cor NEUTRA */
  valor: Estado<number>;
  anualizado: boolean;
}

/**
 * AtivoTopoResposta.retornos (só com ANALISE_ATIVOS_RETORNOS_HABILITADO; ausente sem a chave ou sem
 * linha em asset_retornos_cotacao). Só preço, sem proventos.
 */
export interface RetornosCotacaoApi {
  classe: ClasseBr;
  /** último pregão usado no cálculo (AAAA-MM-DD) — 'até dd/mm/aaaa' na tela */
  ateData: string;
  /** as 4 janelas, na ordem de JANELAS_RETORNO */
  janelas: RetornoJanelaApi[];
  /** distância do preço até a máxima de fechamento ajustada desde INICIO_MAXIMA_RETORNOS (%; ≤ 0) */
  distanciaMaxima: Estado<number>;
  maxima: { preco: number; data: string } | null;
  /** primeiro pregão da série usada (AAAA-MM-DD) */
  inicioSerie: string | null;
  flags: FlagRetorno[];
}

/** Parâmetros do cálculo (fatia C). */
export const LOTE_RETORNOS = 50;
/** preço na data-alvo = último pregão ≤ alvo, até N pregões antes (senão a janela fica sem dado) */
export const TOLERANCIA_PREGOES_RETORNO = 5;
/** início da série para a máxima de fechamento */
export const INICIO_MAXIMA_RETORNOS = '2015-01-01';

/** Saída da função pura retornosCotacao (fatia C) = o que o job grava em asset_retornos_cotacao. */
export interface RetornosCalculados {
  symbol: string;
  classe: ClasseBr;
  asOf: string;
  preco: number | null;
  ret1mPct: number | null;
  ret12mPct: number | null;
  ret5aAaPct: number | null;
  ret10aAaPct: number | null;
  precoMaxAjustado: number | null;
  distMaxPct: number | null;
  dataMax: string | null;
  inicioSerie: string | null;
  pregoes: number;
  flags: FlagRetorno[];
}

// ===========================================================================
// Item 6 — dados societários e dividendo mínimo do estatuto (fatia D)
// ===========================================================================

/** Ids fixos das linhas sintéticas da posição acionária. */
export const IDS_ACIONISTA_SINTETICO = { outros: 'OUTROS', tesouraria: 'TESOURARIA' } as const;
/** Acionistas diretos exibidos (por % do total), além das sintéticas. */
export const MAX_ACIONISTAS_EXIBIDOS = 6;
/** Exercício do FRE de onde vêm o tag along declarado e o texto do dividendo mínimo. */
export const ANO_FRE_DIREITOS = 2022;
/** Trecho literal do FRE exibido (caracteres). */
export const MAX_TRECHO_FRE = 400;
/** Tag along fora desta faixa = valor espúrio, descartado. */
export const FAIXA_TAG_ALONG_PCT = { min: 0.01, max: 100 } as const;

/** Exercício do FRE + data de entrega (DT_RECEB), nunca a Data_Referencia futura. */
export interface ReferenciaFreApi {
  anoFre: number;
  /** AAAA-MM-DD */
  dtReceb: string | null;
}

/** Um acionista DIRETO (ou linha sintética). SEM CPF/CNPJ (decisão 5). */
export interface AcionistaFreApi {
  nome: string;
  pctOn: number | null;
  pctPn: number | null;
  pctTotal: number | null;
  controlador: boolean;
  acordoAcionistas: boolean;
  /** linhas 'Outros' e 'Ações em tesouraria' */
  sintetica: 'outros' | 'tesouraria' | null;
}

export interface AcionistasFreApi extends ReferenciaFreApi {
  /** até MAX_ACIONISTAS_EXIBIDOS diretos por % do total, depois 'outros' e 'tesouraria' */
  acionistas: AcionistaFreApi[];
}

/** Ações em circulação (definição CVM, distribuicao_capital) e nº de acionistas. */
export interface CirculacaoFreApi extends ReferenciaFreApi {
  pctOn: Estado<number>;
  pctPn: Estado<number>;
  pctTotal: Estado<number>;
  nAcionistasPf: number | null;
  nAcionistasPj: number | null;
  nAcionistasInst: number | null;
}

export type EspecieAcao = 'ON' | 'PN' | 'UNIT';

/**
 * Base do tag along: 'segmento_b3' (100% em NM ON e N2 ON/PN) · 'lei_254a' (80% da ON em
 * N1/Tradicional) · 'fre_2022' (valor do FRE 2022 ≥ à base) · 'conforme_estatuto' (PN de
 * N1/Tradicional) · 'nao_emite'. Unit = tag along das ações que a compõem.
 */
export type BaseTagAlong =
  | 'segmento_b3'
  | 'lei_254a'
  | 'fre_2022'
  | 'conforme_estatuto'
  | 'nao_emite';

export interface TagAlongEspecieApi {
  especie: EspecieAcao;
  /** classe da PN ('' = ON ou sem classe) */
  classePn: string;
  /** % (null em 'conforme_estatuto' e 'nao_emite') */
  pct: number | null;
  base: BaseTagAlong;
}

export interface DividendoMinimoApi {
  /** sempre ANO_FRE_DIREITOS ('texto do FRE 2022 · pode ter sido alterado') */
  anoFre: number;
  /** '% do lucro líquido ajustado' por regex; ausente = 'sem dado · o FRE remete a outro item' */
  pctLucroAjustado: Estado<number>;
  /** trecho literal (até MAX_TRECHO_FRE), sem interpretação */
  trecho: string | null;
  /** LINK_DOC do FRE vigente (texto, nunca baixado) */
  linkFreVigente: string | null;
}

/**
 * GET /api/analise-ativos/ativos/[ticker]/societario (só ações; FII ⇒ 404). Chave desligada ⇒ 404
 * antes da sessão. Cache-Control: private, max-age=300.
 */
export interface SocietarioResposta {
  ticker: string;
  acionistas: Estado<AcionistasFreApi>;
  circulacao: Estado<CirculacaoFreApi>;
  tagAlong: Estado<TagAlongEspecieApi[]>;
  dividendoMinimo: Estado<DividendoMinimoApi>;
  /** segmento de listagem B3 usado na base do tag along (Novo Mercado, Nível 1…) */
  segmentoListagem: string | null;
  versao: string;
}

/** Motivos de Estado do card societário (texto em TEXTOS_SOCIETARIO.motivos). */
export type MotivoSocietario = 'sem_fre' | 'sem_distribuicao_capital' | 'remete_outro_item';

// ===========================================================================
// Item 7 — alavancagem do FII sobre o ativo (fatia E)
// ===========================================================================

/** Série nova do catálogo (leverage_pct, obrigações ÷ PL, NÃO é redefinida). */
export const SERIE_ALAV_ATIVO = 'leverage_assets_pct';
/** Limite do critério 'alav' do fii_tijolo na v4 (decisão 1 do Wellington). */
export const LIMITE_ALAV_ATIVO_V4_PCT = 15;
/** Acima disto (% do ativo) o critério marca a flag de revisão. */
export const LIMITE_REVISAO_OBRIGACOES_ATIVO_PCT = 50;
export const FLAG_OBRIGACOES_ATIVO_REVISAO = 'obrigacoes_ativo_revisao';

// ===========================================================================
// Props dos blocos novos da página do ativo (stubs na fatia 0)
// ===========================================================================

/** Seção 'Imóveis e composição do fundo' (FII; fatia A). Busca a rota imoveis-fii sozinha. */
export interface BlocoImoveisFiiProps {
  ticker: string;
  /** tipo CVM bruto (AtivoTopoResposta.fiiTipoCvm): papel/FoF mostram só a composição */
  fiiTipo: FiiTipoTela | null;
}

/** Card 'Variação da cotação' (ação e FII; fatia C). Dados do topo, sem requisição própria. */
export interface BlocoRetornosCotacaoProps {
  ticker: string;
  retornos: RetornosCotacaoApi;
}

/** Card 'Dados societários e estatuto' (ações; fatia D). Busca a rota societario sozinha. */
export interface BlocoSocietarioProps {
  ticker: string;
}
