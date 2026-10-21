/**
 * CONTRATOS da Análise de Ativos — Fase 1 (fatia 0a). Congelados: as fatias 0b, A, B, C e D
 * programam contra estes tipos em worktrees separados. Qualquer mudança passa por PR na 0a.
 *
 * Fonte: docs/analise-ativos/fase1/spec-desenho.json (arquitetura.apis) + decisoes.md (prevalece).
 *
 * Convenções
 * - Datas civis 'AAAA-MM-DD' (UTC). Percentuais em pontos percentuais (6,4 = 6,4%).
 * - Estado<T>: três estados explícitos, com motivo E texto pronto (de textosTela). Nunca null solto
 *   onde o "porquê" importa para a tela.
 * - Séries anuais: SÓ anos FECHADOS (o ano corrente fica fora) + ponto 'últ. 12m' separado.
 * - Nenhuma rota /api/analise-ativos/* chama provedor externo (BRAPI/CVM/B3) no caminho da
 *   requisição. Todas exigem acesso (exigirAcessoAnalise) e respondem 404 sem acesso, exceto
 *   /config, que nunca dá 404.
 * - Erros: { error: string, details?: Record<string,string[]> } (withErrorHandler).
 *
 * Mapa de rotas (dono):
 *   GET  /api/analise-ativos/config                      → ConfigResposta              (0a)
 *   GET  /api/analise-ativos/quadro?{QuadroParams}       → QuadroResposta              (A)
 *   GET  /api/analise-ativos/busca                       → BuscaIndiceResposta         (A)
 *   GET  /api/analise-ativos/carteira                    → OverlayCarteiraResposta     (D)
 *   GET  /api/analise-ativos/ativos/[ticker]             → AtivoTopoResposta           (B)
 *   GET  /api/analise-ativos/ativos/[ticker]/fundamentos → FundamentosResposta         (C)
 *   GET  /api/analise-ativos/ativos/[ticker]/valuation   → ValuationResposta           (C)
 *   GET  /api/analise-ativos/teses/[ticker]              → TeseResposta                (D)
 *   PUT  /api/analise-ativos/teses/[ticker]  TesePutBody → TesePutResposta (CSRF)      (D)
 *   DEL  /api/analise-ativos/teses/[ticker]              → TeseDeleteResposta (CSRF)   (D)
 *   GET  /api/cron/analise-ativos/quadro                 → RelatorioJob (cron secret)  (A)
 *
 * Bloco C (docs/analise-ativos/blocoC/spec-desenho.json + decisoes.md) — acréscimos SÓ ADITIVOS e
 * opcionais (as fixtures da Fase 1 compilam sem mudança): selos 'em_conferencia' e
 * 'cotacao_esporadica'; Estado ausente com exibicao/valorNaoPublicado; ConferenciaTela;
 * LinhaQuadroApi.conferencias; AtivoTopoResposta.conferencias/frescorBlocos; FrescorBloco;
 * ConfigResposta.reporteHabilitado. Tipos do relato e da curadoria: src/types/analiseAtivosCuradoria.ts.
 *
 * Bloco D (docs/analise-ativos/blocoD/spec-desenho.json + decisoes.md) — acréscimos SÓ ADITIVOS e
 * opcionais: ConfigResposta.recursos; AnaliseAtivosShellProps.variante 'comparador';
 * BuscaAtivosProps.classe/desabilitarOutraClasse; cabecalhoExtra em BlocoFundamentosEssencialProps
 * e BlocoValuationMultiplosProps. Tipos do Raio-X, dos Cenários e do Comparador:
 * src/types/analiseAtivosBlocoD.ts.
 *
 * v2.4 — Filtros de Fundamentos (docs/analise-ativos/v2-filtros/spec-desenho.json): entram
 * LinhaQuadroApi.criterios/motivosConferencia, AtivoTopoResposta.criterios, QuadroParams.janela/
 * criterios, QuadroResposta.definicoes/janela/totalClasse, OverlayCarteiraResposta.posicoes[].
 * objetivoPct/estrategia/tipoFii e planejados[].secao/id, LinhaFundamentos.ultimoAno, OrdemQuadro
 * 'criterios' | 'lucro10' e FundamentosResposta.unidade 'R$ bi'. Fatia F: SAEM da superfície o
 * indicador antigo, o semáforo e a marca de valor (tipos da linha e do topo, efeito na
 * conferência, ano destacado, ticker de referência, ItemBusca.i/e e a ordem do indicador) e os
 * campos de observação passam a `observacao`/`observacoes`: nenhuma resposta de
 * /api/analise-ativos/* tem chave do indicador antigo, de nota, rating ou score (a lista exata
 * está em CHAVES_PROIBIDAS_CONTRATO, contratoSemNota.test.ts). Tipos dos critérios:
 * src/types/analiseAtivosCriterios.ts.
 *
 * v2.5 (docs/analise-ativos/v25-regras-pedro/desenho.json, fatia 0) — acréscimos opcionais:
 * rota /api/analise-ativos/alvos/[ticker] (desde 17/10/2026: ObjetivoAtivoApi = Objetivo da Carteira,
 * % dentro da aba; o overlay.alvos de planning_asset_targets saiu); TipoFiiExibido (Tijolo | Papel, protótipo) +
 * LinhaQuadroApi.segmentoTipo; AtivoTopoResposta.fiiTipoCvm (tipo CVM BRUTO para a seção automática
 * da Carteira); célula do Essencial com fallback/incompleto (LinhaFundamentos.marcas) e nota de fonte
 * pelas origens (FundamentosResposta.textoFonte/dadosIncompletos; nunca "nota" numa chave de resposta).
 *   GET  /api/analise-ativos/alvos/[ticker]               → AlvoGetResposta             (C)
 *
 * Bloco 1 (docs/analise-ativos/bloco1-salvos/desenho.json, fatia 0) — acréscimos: RecursosBlocoD.
 * salvos/alertas/pdfComparador e AnaliseAtivosShellProps.variante 'salvos'. Tipos e rotas das
 * listas, filtros salvos, comparações, PDF e avisos: src/types/analiseAtivosSalvos.ts e
 * ROTAS_SALVOS (src/services/analiseAtivos/salvos/contrato.ts).
 *   PUT  /api/analise-ativos/alvos/[ticker] AlvoPutBody   → AlvoPutResposta (CSRF)      (C)
 *   DEL  /api/analise-ativos/alvos/[ticker]               → AlvoDeleteResposta (CSRF)   (C)
 *
 * Stocks e REITs (docs/analise-ativos/stocks-reits/desenho.json, fatia 0) — acréscimos OPCIONAIS
 * (nada muda no Brasil): ClasseQuadro += 'stock' | 'reit' (CLASSES_BR/CLASSES_EUA, ehClasseEua);
 * RecursosBlocoD.eua/euaPreco; QuadroResposta.contagens.stock/reit, moeda e universoDescricao;
 * LinhaQuadroApi.moeda/bolsa/dpa/fcoPorAcao/dividendosFcoPct; AtivoTopoResposta.eua (TopoEuaApi);
 * FundamentosResposta em US$/SEC com colunasPendentes. Contratos próprios: src/types/analiseAtivosEua.ts.
 *
 * A6 — dados complementares (docs/analise-ativos/fundamentei-trazer/desenho.json, fatia 0) —
 * acréscimos OPCIONAIS, ausentes com as chaves desligadas (a resposta fica idêntica à de hoje):
 * RecursosBlocoD.imoveisFii/templatesFinanceiras/retornos/societario/alavAtivo;
 * AtivoTopoResposta.retornos (RetornosCotacaoApi); FundamentosResposta.template e
 * ColunaFundamentos.tooltip; LinhaQuadroApi.obrigacoesAtivoPct. Contratos próprios e as rotas novas
 * (imoveis-fii, societario): src/types/analiseAtivosComplementos.ts.
 *
 * A2+A4+A5+C — alinhar ao Fundamentei (docs/analise-ativos/fundamentei-regras/desenho.json, F0) —
 * acréscimos OPCIONAIS, ausentes com as chaves desligadas (a resposta fica idêntica à de hoje):
 * SinaisLeituraV2 (rotulosEn, reitFcoAjustado, visualV2) nas respostas do Quadro, do topo, do
 * Essencial e do Valuation (e do Comparador/Raio-X em analiseAtivosBlocoD.ts); Estado ausente com
 * rotuloCurto 'L' (prejuízo, ESSENCIAL_V2); LinhaFundamentos.dtFim; MarcaCelulaEssencial.
 * sbcIndisponivel; LinhaQuadroApi.fcoAjustadoPorAcao/dividendosFcoAjustadoPct/sbcIndisponivel.
 */
import type { ReactNode } from 'react';
import type { RetornosCotacaoApi, TemplateFinanceira } from '@/types/analiseAtivosComplementos';
import type {
  BolsaEua,
  ColunaPendenteEua,
  MoedaClasse,
  TopoEuaApi,
} from '@/types/analiseAtivosEua';
import type {
  CriteriosAtivo,
  CriteriosLinhaApi,
  DefCriterioChip,
  Janela,
} from '@/types/analiseAtivosCriterios';

// ===========================================================================
// Básicos
// ===========================================================================

/**
 * Classes do Quadro. Brasil (CVM/B3): 'acao' | 'fii'. EUA (SEC, docs/analise-ativos/stocks-reits/
 * desenho.json, fatia 0): 'stock' | 'reit' — só com ANALISE_ATIVOS_EUA_HABILITADO (desligada: as
 * rotas e abas EUA respondem 404 / não aparecem). Helpers de mercado/família/moeda em
 * src/types/analiseAtivosEua.ts.
 */
export const CLASSES_BR = ['acao', 'fii'] as const;
export const CLASSES_EUA = ['stock', 'reit'] as const;
export const CLASSES_QUADRO = [...CLASSES_BR, ...CLASSES_EUA] as const;
export type ClasseBr = (typeof CLASSES_BR)[number];
export type ClasseEua = (typeof CLASSES_EUA)[number];
export type ClasseQuadro = ClasseBr | ClasseEua;

export function ehClasseQuadro(v: unknown): v is ClasseQuadro {
  return typeof v === 'string' && (CLASSES_QUADRO as readonly string[]).includes(v);
}

export function ehClasseBr(v: unknown): v is ClasseBr {
  return typeof v === 'string' && (CLASSES_BR as readonly string[]).includes(v);
}

export function ehClasseEua(v: unknown): v is ClasseEua {
  return typeof v === 'string' && (CLASSES_EUA as readonly string[]).includes(v);
}

/** Tipo do FII (Fase 0: regras/fii/tipoFii). */
export type FiiTipoTela = 'tijolo' | 'papel' | 'hibrido' | 'fof' | 'indefinido';

/**
 * v2.5: tipo EXIBIDO na coluna Tipo, na faceta, no filtro, nas sugestões do Comparar e nas tags
 * (protótipo data.js: só Tijolo ou Papel). Derivado do perfil de critérios: 'fii_tijolo' → 'tijolo',
 * senão 'papel' (FoF, híbrido < 50% de imóveis, indefinido e sem tipo caem em papel — regra
 * conservadora). FoF e Híbrido aparecem como prefixo do segmento (LinhaQuadroApi.segmentoTipo).
 * O tipo CVM bruto continua em AtivoTopoResposta.fiiTipoCvm (seção da Carteira).
 */
export type TipoFiiExibido = 'tijolo' | 'papel';
export const TIPOS_FII_EXIBIDOS: readonly TipoFiiExibido[] = ['tijolo', 'papel'];

/** Prefixo do segmento quando o tipo CVM bruto não é tijolo/papel (v2.5). */
export type SegmentoTipoFii = 'fof' | 'hibrido';

/** Motivo legível: código estável + texto pronto de textosTela. */
export interface MotivoTela {
  /** ex.: 'div:fonte_defasada', 'lucro:prejuizo', 'sem_score', 'sem_negociacao_30' */
  codigo: string;
  texto: string;
}

/**
 * Valor com três estados (espelha Valor<T> da Fase 0, com o texto já resolvido).
 * - ok: tem número (zero é ok(0)).
 * - ausente: devia ter, não tem (motivo: 'fonte_defasada', 'sem_dado_fonte', 'prejuizo'...).
 * - nao_se_aplica: não faz sentido para o ativo (financeira, papel sem imóveis...).
 */
export type Estado<T> =
  | { estado: 'ok'; valor: T }
  | {
      estado: 'ausente';
      motivo: string;
      texto: string;
      /**
       * Bloco C: campo em conferência (motivo 'em_conferencia:<grupo>'). 'ocultar' = '—' + chip;
       * 'selo' não chega aqui (o campo fica ok com valor + chip). Ausente sem isto = como hoje.
       */
      exibicao?: ExibicaoConferenciaTela;
      /**
       * Bloco C: valor bruto NÃO publicado, só para o "Por quê?" da PÁGINA do ativo (o Quadro nunca
       * envia).
       */
      valorNaoPublicado?: number;
      /** F0 fundamentei-regras: 'L' (prejuízo) no lugar do '—'; ausente = '—' (ROTULO_CURTO_PREJUIZO) */
      rotuloCurto?: RotuloCurtoEstado;
    }
  | { estado: 'nao_se_aplica'; motivo: string; texto: string };

/** Motivo do Estado ausente por prejuízo no período (payout, P/L). */
export const MOTIVO_PREJUIZO = 'prejuizo';

/**
 * Rótulo curto de um Estado ausente (F0 fundamentei-regras, A4.a): 'L' = prejuízo no período, no
 * lugar do '—' (o `texto` vai no tooltip). Só com ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO, no
 * Essencial, no Raio-X e no template de banco; ausente = '—' como hoje.
 */
export const ROTULO_CURTO_PREJUIZO = 'L';
export type RotuloCurtoEstado = typeof ROTULO_CURTO_PREJUIZO;

/**
 * Sinais de leitura da entrega fundamentei-regras (F0), presentes SÓ com a chave ligada (ausente =
 * false; com as chaves desligadas a resposta é idêntica à de hoje):
 * - rotulosEn: ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO (classes EUA; nomes em inglês de
 *   textosEuaEn.ts já aplicados pelo servidor);
 * - reitFcoAjustado: ANALISE_ATIVOS_REIT_FCO_AJUSTADO_HABILITADO (REIT com o caixa operacional
 *   ajustado pela SBC);
 * - visualV2: ANALISE_ATIVOS_VISUAL_V2_HABILITADO (ajustes visuais; as page.tsx também passam a
 *   prop visualV2).
 */
export interface SinaisLeituraV2 {
  rotulosEn?: boolean;
  reitFcoAjustado?: boolean;
  visualV2?: boolean;
}

/** Política de exibição de um campo em conferência (regras/comum/conferencia.ts). */
export type ExibicaoConferenciaTela = 'ocultar' | 'selo';

/**
 * Bloco C: um grupo em conferência na página do ativo (o "Por quê?"). Montado pela fatia B
 * (leitura/ativo/conferenciasAtivo.ts) a partir das flags 'conf:' + legado de proventos e da
 * leitura SOMENTE LEITURA do caso aberto do symbol (sem dado de autor).
 */
export interface ConferenciaTela {
  /** GrupoConferencia (regras/comum/conferencia.ts) */
  grupo: string;
  /** CampoTela afetados (DEF_GRUPO[grupo].campos) */
  campos: string[];
  exibicao: ExibicaoConferenciaTela;
  /** texto pronto (textosTela.conferencia.motivos) */
  motivo: string;
  /** AAAA-MM-DD da detecção (chave da flag quando é data), ou null */
  desde: string | null;
  /**
   * Sempre 'regra' nesta fase (decisão 16: sem conferência manual pelo curador; "relato confirmado"
   * não existe como origem).
   */
  origem: 'regra';
  /** situação do caso de curadoria aberto do symbol para o grupo, se houver */
  caso: { status: 'aberto' | 'em_analise'; atualizadoEm: string } | null;
}

/** Bloco C: frescor por bloco (selo no rodapé de cada card; fatia B, leitura/ativo/frescorBlocos). */
export interface FrescorBloco {
  /** 'CVM DFP/ITR', 'B3 COTAHIST', 'informe mensal CVM'... */
  fonte: string;
  /** referência do dado ('2T26', 'ago/26', '29/09/2026') */
  referencia: string | null;
  /** ISO da última atualização gravada */
  atualizadoEm: string | null;
  status: 'em_dia' | 'atrasado' | 'sem_dado';
  /** atrasado: documento esperado ('ITR 3T26') */
  documentoEsperado?: string;
}

/** Por que uma linha está fora do Quadro (aparece só na busca). */
export type ForaDoQuadroMotivo = 'sem_negociacao_30' | 'fiagro' | 'deslistada';

/** Ponto de série anual. Só anos fechados; `suspeito` = 'em conferência' (DPA > 2× ano anterior). */
export interface PontoSerieAnual {
  ano: number;
  valor: number | null;
  suspeito?: boolean;
}

/** Ponto 'últ. 12m', sempre separado da série anual. */
export interface PontoUlt12m {
  valor: number;
  /** data de referência da janela (AAAA-MM-DD) */
  dataRef: string;
}

/**
 * Formatos numéricos da tela (formatarAnalise, fatia 0b):
 * - numero: 1 casa ('9,0'); numero2: 2 casas ('0,89'); inteiro: '1.234';
 * - pct: '3,98%'; pctSinal: '+4,3%' / '−0,4%'; pp: '+4,3 p.p.';
 * - multiplo: '10,0×' / '−0,4×';
 * - moeda: 'R$ 147,93'; moedaCompacta: 'R$ 1,2 bi' / 'R$ 2,7 mi'; moedaMi: valor já em R$ mi.
 */
export type FormatoAnalise =
  | 'numero'
  | 'numero2'
  | 'inteiro'
  | 'pct'
  | 'pctSinal'
  | 'pp'
  | 'multiplo'
  | 'moeda'
  | 'moedaCompacta'
  | 'moedaMi';

/** Selos de estado (SeloEstado, fatia 0b). Textos em textosTela.SELOS_ESTADO. */
export type TipoSeloEstado =
  | 'criterios_provisorios'
  | 'data_estimada'
  | 'proventos_em_conferencia'
  | 'sem_negociacao_recente'
  | 'baixa_liquidez'
  | 'planejado'
  | 'na_carteira'
  /** bloco C: campo em conferência por regra de sanidade (chip tracejado com lupa) */
  | 'em_conferencia'
  /** bloco C: cotação de negócio esporádico (só informativo) */
  | 'cotacao_esporadica';

// ===========================================================================
// /api/analise-ativos/config (0a)
// ===========================================================================

export type EstadoAcessoAnalise = 'desligada' | 'fora_do_beta' | 'liberada';

/**
 * GET /api/analise-ativos/config — 200 sempre que há sessão (401 sem sessão). Nunca 404.
 * Decidido pelo usuário LOGADO (payload.id), não pelo cliente personificado. Cache-Control: no-store.
 */
export interface ConfigResposta {
  /** estado === 'liberada' (o menu só mostra o item com true) */
  habilitada: boolean;
  estado: EstadoAcessoAnalise;
  acesso: 'beta' | 'todos';
  /** selo NOVO no menu até esta data (AAAA-MM-DD, inclusive) */
  novoAte: string;
  /**
   * Bloco C: botão/APIs de "Reportar dado incorreto" ligados para este usuário
   * (ANALISE_ATIVOS_REPORTE_HABILITADO && área liberada). Ausente = false.
   */
  reporteHabilitado?: boolean;
  /**
   * Bloco D: recursos ligados PARA ESTE USUÁRIO (flag do recurso && área liberada; decisão 15).
   * Ausente = tudo desligado (cliente antigo ou CONFIG_DESLIGADA). Com as 3 flags desligadas a tela
   * fica idêntica à de hoje.
   */
  recursos?: RecursosBlocoD;
}

/**
 * Bloco D: um booleano por recurso (RecursoBlocoD em acessoAnalise.ts). Bloco 1 acrescenta
 * salvos, alertas (exige salvos) e pdfComparador (exige comparador), com as dependências já
 * aplicadas pelo servidor (recursosLiberados). Cliente antigo sem as chaves = desligado.
 * "Salvar comparação" / "Comparações salvas" = salvos && comparador (sem flag própria).
 */
export interface RecursosBlocoD {
  raioX: boolean;
  cenarios: boolean;
  comparador: boolean;
  /** Bloco 1: Salvos (listas, Salvar, página Salvos, filtros salvos) */
  salvos: boolean;
  /** Bloco 1: avisos das listas (só com salvos) */
  alertas: boolean;
  /** Bloco 1: Exportar PDF do Comparador (só com comparador) */
  pdfComparador: boolean;
  /**
   * EUA (fatia 0): abas Stocks/REITs, rotas e busca EUA (ANALISE_ATIVOS_EUA_HABILITADO). Ausente =
   * desligado (cliente antigo). O servidor sempre preenche.
   */
  eua?: boolean;
  /** EUA: preço, múltiplos e Meus cenários EUA (ANALISE_ATIVOS_EUA_PRECO_HABILITADO; exige eua) */
  euaPreco?: boolean;
  /**
   * A6 (fatia 0): um booleano por recurso de tela, sem dependência entre eles. Ausente = desligado
   * (cliente antigo); o servidor sempre preenche.
   */
  /** seção 'Imóveis e composição do fundo' do FII (ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO) */
  imoveisFii?: boolean;
  /** Essencial/Raio-X de banco e seguradora (ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO) */
  templatesFinanceiras?: boolean;
  /** card 'Variação da cotação' e linhas do Comparador (ANALISE_ATIVOS_RETORNOS_HABILITADO) */
  retornos?: boolean;
  /** card 'Dados societários e estatuto' das ações (ANALISE_ATIVOS_SOCIETARIO_HABILITADO) */
  societario?: boolean;
  /** 'Alavancagem (% do ativo)' do FII (ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO) */
  alavAtivo?: boolean;
}

// ===========================================================================
// /api/analise-ativos/quadro (A)
// ===========================================================================

export type OrdemQuadro =
  | 'ticker'
  /** v2.4: contagem de critérios atendidos na janela (desc), desempate por ticker */
  | 'criterios'
  /** v2.4: Lucro 10 anos (desc) */
  | 'lucro10'
  | 'preco'
  | 'anosLucro'
  | 'mesesRendimento'
  | 'roe'
  | 'pl'
  | 'pvp'
  | 'dy'
  | 'margem'
  | 'divLiqEbitda'
  | 'payout'
  | 'vacancia'
  | 'valorMercado'
  | 'patrimonio'
  | 'liquidez'
  | 'obrigacoesPl'
  | 'cotistas';

export type DirecaoOrdem = 'asc' | 'desc';
export type ModoQuadro = 'resumo' | 'detalhado';

/**
 * Query da rota (zod ESTRITO na rota; estado espelhado na URL da página). v2.4: os filtros antigos
 * (lucroConsistente, dyMin, pvpMax, tipo, somenteCompletos) e a ordem do indicador antigo dão 400.
 */
export interface QuadroParams {
  classe: ClasseQuadro;
  ordem?: OrdemQuadro;
  dir?: DirecaoOrdem;
  naCarteira?: boolean;
  setor?: string;
  segmento?: string;
  /** v2.4 (B): janela dos critérios (padrão 5) */
  janela?: Janela;
  /**
   * v2.4 (B): ids ligados (IdCriterio) separados por vírgula, como vão na URL (?criterios=rec,luc);
   * E lógico; em FII aplica as equivalências tijolo↔papel. A rota valida cada id (zod).
   */
  criterios?: string;
  offset?: number;
  /** padrão 25, máximo 100 */
  limite?: number;
}

/** Uma linha do Quadro (também usada em pares e na busca detalhada). */
export interface LinhaQuadroApi {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  setor: string | null;
  subsetor: string | null;
  segmento: string | null;
  /** segmento de listagem B3 (Novo Mercado, N2...) */
  listagem: string | null;
  /**
   * v2.4: tipo CVM vigente. v2.5 (fatia B): passa a ser o TipoFiiExibido ('tijolo' | 'papel');
   * o tipo continua declarado como FiiTipoTela só para a transição das linhas já gravadas.
   */
  fiiTipo: FiiTipoTela | null;
  /** v2.5 (B): 'fof' | 'hibrido' quando o tipo CVM bruto é esse (prefixo do segmento); senão null */
  segmentoTipo?: SegmentoTipoFii | null;
  segmentoCvm: string | null;
  noQuadro: boolean;
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  preco: Estado<number>;
  precoData: string | null;
  variacaoDiaPct: number | null;
  liquidezMedia21: number | null;
  baixaLiquidez: boolean;
  /** v2.4 (B): critérios da janela pedida; null = sem avaliação ainda */
  criterios: CriteriosLinhaApi | null;
  /** v2.4 (B/C2): motivos de conferência/incompletude da linha */
  motivosConferencia: MotivoTela[];
  anosLucroConsecutivos: number | null;
  mesesComRendimento: number | null;
  anosDividendo: number | null;
  roe: Estado<number>;
  pl: Estado<number>;
  pvp: Estado<number>;
  dy12m: Estado<number>;
  margemLiquida: Estado<number>;
  divLiqEbitda: Estado<number>;
  payout: Estado<number>;
  vacanciaCvm: Estado<number>;
  obrigacoesPl: Estado<number>;
  nImoveisCvm: number | null;
  nCri: number | null;
  valorMercado: number | null;
  patrimonio: number | null;
  cotistas: number | null;
  /** só anos fechados (Lucro 10 anos nas ações; Rendimento 10 anos nos FIIs) */
  serie10a: PontoSerieAnual[];
  tipoSerie: 'lucro' | 'rendimento';
  serieUlt12m: number | null;
  /** DY/payout com valor mas com proventos em conferência (provento_suspeito/proventos_defasados) */
  proventosEmConferencia: boolean;
  /**
   * Bloco C: grupos em conferência da linha (flags 'conf:' + 'proventos' se legado). Ausente = [].
   */
  conferencias?: string[];
  flags: string[];
  pares: string[];
  /** Asset.id do catálogo (null = fora do catálogo: o wizard abre no passo Ativo) */
  assetId: string | null;
  /** EUA (fatia 0): 'USD' nas linhas stock/reit; ausente = BRL */
  moeda?: MoedaClasse;
  /** EUA: bolsa (NYSE | Nasdaq); ausente/null no BR */
  bolsa?: BolsaEua | null;
  /** EUA: dividendo por ação do último FY (US$/ação) */
  dpa?: number | null;
  /** EUA (REIT): caixa operacional ÷ média diluída do último FY (US$/ação) */
  fcoPorAcao?: number | null;
  /** EUA (REIT): dividendos pagos ÷ caixa operacional do último FY (%) */
  dividendosFcoPct?: number | null;
  /**
   * A6 (fatia E): obrigações ÷ ativo total do FII ('Alavancagem (% do ativo)'), só com
   * ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO. Ausente = chave desligada ou ação. obrigacoesPl não muda.
   */
  obrigacoesAtivoPct?: Estado<number>;
  /**
   * F0 fundamentei-regras (REIT, só com ANALISE_ATIVOS_REIT_FCO_AJUSTADO_HABILITADO): caixa
   * operacional ajustado pela SBC (FCO − remuneração em ações) ÷ média diluída do último FY
   * (US$/ação) e dividendos ÷ caixa operacional ajustado (%). null = ano sem SBC no 10-K (a tela
   * usa fcoPorAcao/dividendosFcoPct com sbcIndisponivel).
   */
  fcoAjustadoPorAcao?: number | null;
  dividendosFcoAjustadoPct?: number | null;
  /** F0 fundamentei-regras: o último FY do REIT não tem SBC (nota 'sbc_indisponivel') */
  sbcIndisponivel?: boolean;
}

export interface FrescorCotacao {
  data: string | null;
  status: 'em_dia' | 'atrasado' | 'sem_dado';
}

/**
 * GET /api/analise-ativos/quadro — só linhas noQuadro=true. Nulos e n/a sempre no fim; desempate
 * por ticker. 400 (zod); 404 sem acesso. Cache-Control: no-store (cache em memória no servidor).
 */
export interface QuadroResposta extends SinaisLeituraV2 {
  classe: ClasseQuadro;
  dataRef: string | null;
  /** versão das linhas (max(geradoEm) ISO) */
  versao: string;
  total: number;
  offset: number;
  limite: number;
  /** contador das abas; stock/reit só quando recursos.eua (fatia C) */
  contagens: Record<ClasseBr, number> & Partial<Record<ClasseEua, number>>;
  facetas: { setores: string[]; tipos: FiiTipoTela[] };
  frescorCotacao: FrescorCotacao;
  itens: LinhaQuadroApi[];
  /** v2.4 (B): janela aplicada */
  janela: Janela;
  /** v2.4 (B): total da classe sem filtros (contador 'X de N') */
  totalClasse: number;
  /** v2.4 (B): chips da barra de filtros (de criteria_params) */
  definicoes: DefCriterioChip[];
  /** EUA (fatia C): moeda dos valores da classe; ausente = BRL */
  moeda?: MoedaClasse;
  /** EUA (fatia C): regra do universo (TEXTOS_EUA.universo), sem nome de índice */
  universoDescricao?: string;
}

// ===========================================================================
// /api/analise-ativos/busca (A)
// ===========================================================================

/** Item compacto do índice de busca (chaves curtas: ~800 itens ≈ 45 KB). */
export interface ItemBusca {
  /** ticker */
  t: string;
  /** nome */
  n: string;
  /** classe */
  c: ClasseQuadro;
  /** noQuadro */
  q: boolean;
  /** tipo do FII */
  f: FiiTipoTela | null;
  /** motivo de estar fora do Quadro */
  m: ForaDoQuadroMotivo | null;
}

/**
 * GET /api/analise-ativos/busca — TODAS as linhas (inclusive fora do Quadro). ETag = versão → 304.
 * Cache-Control: private, max-age=3600. Filtro no cliente (NFD sem acento; prefixo do ticker >
 * prefixo de palavra > substring; no máximo 8).
 */
export interface BuscaIndiceResposta {
  versao: string;
  itens: ItemBusca[];
}

// ===========================================================================
// /api/analise-ativos/carteira (D) — overlay DB-only, sem preço e sem valor
// ===========================================================================

/** Aba efetiva da Carteira (categoriaEfetiva, respeita o "mover entre abas" #275). */
export type CategoriaCarteira = string;

/**
 * GET /api/analise-ativos/carteira — targetUserId (consultor vê o cliente). no-store.
 * Alimenta o filtro "Na minha carteira", o selo e a busca. Chave = chaveCarteira(ticker) (EUA sem
 * pontuação: BRK.B → BRKB; B3 igual ao ticker). Os NÚMEROS do bloco "Na sua carteira"
 * vêm dos hooks da própria Carteira (useAcoes/useFii/resumo/configuração), não daqui.
 */
export interface OverlayCarteiraResposta {
  posicoes: Record<
    string,
    {
      portfolioId: string;
      quantidade: number;
      categoria: CategoriaCarteira;
      /** v2.4 (C1): Portfolio.objetivo, % DENTRO da aba (rec. 1); null = sem alvo */
      objetivoPct?: number | null;
      /** v2.4 (C1): estratégia da posição (ação: value|growth|risk) — recompra manda a mesma */
      estrategia?: string | null;
      /** v2.4 (C1): tipo de FII da posição na Carteira — recompra manda o mesmo */
      tipoFii?: string | null;
      /**
       * EUA (fatia D): Asset manual da posição (chave sem pontuação: BRK.B → BRKB) — a recompra
       * pela Análise manda este assetId para não criar outro. Ausente no Brasil.
       */
      assetId?: string;
      /** EUA (fatia D): Asset.type da posição ('stock' | 'reit'); ausente no Brasil */
      tipoAsset?: 'stock' | 'reit';
    }
  >;
  planejados: Record<
    string,
    {
      watchlistId: string;
      categoria: CategoriaCarteira;
      objetivoPct: number | null;
      /** v2.4 (C1): Watchlist.id (PATCH/DELETE de /api/carteira/planejados/[id]) */
      id?: string;
      /** v2.4 (C1): Watchlist.secao (1ª compra de planejado usa esta seção) */
      secao?: string | null;
      /** EUA (fatia D): Asset manual do planejado; ausente no Brasil */
      assetId?: string;
      /** EUA (fatia D): 'stock' | 'reit'; ausente no Brasil */
      tipoAsset?: 'stock' | 'reit';
    }
  >;
}

// ===========================================================================
// /api/analise-ativos/alvos/[ticker] — "Planejar na carteira" = Objetivo da Carteira (17/10/2026)
// ===========================================================================

/**
 * Objetivo do ativo na Carteira, o MESMO da tabela da aba: % DENTRO da aba (Portfolio.objetivo com
 * posição; Watchlist.objetivo da linha planejada sem posição).
 */
export interface ObjetivoAtivoApi {
  origem: 'posicao' | 'planejado';
  /** Portfolio.id (posição) ou Watchlist.id (planejado) */
  id: string;
  /** % dentro da aba (0 = posição sem objetivo; o planejado pode ter 0 se criado assim na Carteira) */
  objetivoPct: number;
  /** aba efetiva (categoriaEfetiva, respeita o mover) */
  categoria: CategoriaCarteira;
  /** nome da aba na Carteira ("FII's") */
  abaNome: string;
  /** seção na aba (estratégia da ação, tipo do FII…); null quando a aba não tem seção */
  secao: string | null;
}

/** GET → 200 (alvo null sem posição e sem planejado). 404 sem acesso ou fora do catálogo. no-store. */
export interface AlvoGetResposta {
  ticker: string;
  alvo: ObjetivoAtivoApi | null;
}

/**
 * PUT (zod strict, CSRF): 0,01 ≤ objetivoPct ≤ 100 (% dentro da aba, 2 casas). `secao` só vale na
 * criação da linha planejada (sem posição nem plano); fora das seções da aba = 400. Idempotente.
 */
export interface AlvoPutBody {
  objetivoPct: number;
  secao?: string;
}

export interface AlvoPutResposta {
  ticker: string;
  alvo: ObjetivoAtivoApi;
  /** true = a linha planejada (Watchlist) nasceu nesta gravação */
  criado: boolean;
}

/**
 * DELETE (CSRF) — "Remover do plano": posição → objetivo 0; planejado → linha apagada (o × da
 * Carteira). Nada a remover = 200 com removido=false.
 */
export interface AlvoDeleteResposta {
  ticker: string;
  removido: boolean;
  origem: 'posicao' | 'planejado' | null;
}

// ===========================================================================
// /api/analise-ativos/ativos/[ticker] (B) — topo da página do ativo
// ===========================================================================

export interface CotacaoTopo {
  preco: number | null;
  /** data do fechamento (AAAA-MM-DD) */
  data: string | null;
  variacao: number | null;
  variacaoPct: number | null;
  baixaLiquidez: boolean;
}

export interface KpiAtivo {
  codigo: string;
  rotulo: string;
  valor: Estado<number>;
  formato: FormatoAnalise;
  /** linha de apoio ("média 10a: 11,4×", "mediana de 5 pares: 18%") */
  sub: string | null;
  selo: TipoSeloEstado | null;
}

export interface GraficoAtivo {
  titulo: string;
  /** 1 frase neutra */
  figcaption: string;
  granularidade: 'anual' | 'mensal';
  /** ações: '5A' | '10A'; FIIs: '1A' | '3A' | '5A' | '10A' | 'Max' (decisão 7: ações só 5A/10A) */
  periodos: string[];
  /** série A (ações: LPA ajustado; FIIs: VP/cota ajustado), rótulo + pontos */
  serieA: { rotulo: string; pontos: Array<{ chave: string; valor: number | null }> };
  /** série B (cotação ajustada) */
  serieB: { rotulo: string; pontos: Array<{ chave: string; valor: number | null }> };
  ult12m: { a: number | null; b: number | null } | null;
  /** chaves sem ponto (ex.: prejuízo) com nota */
  lacunas: Array<{ chave: string; texto: string }>;
  /** < 3 pontos: true e a tela mostra 'histórico insuficiente para o gráfico' */
  insuficiente: boolean;
}

export interface DividendosAtivo {
  /** só anos fechados; suspeito = 'em conferência' (fora do CAGR) */
  anos: PontoSerieAnual[];
  ult12m: PontoUlt12m | null;
  cagr5aPct: number | null;
  /** janela do CAGR (recua se o último ano estiver em conferência); null sem CAGR */
  cagrAnoInicio: number | null;
  cagrAnoFim: number | null;
  cagrMotivo: string | null;
  selo: TipoSeloEstado | null;
  /** ações: 'dpa'; FIIs: 'rendimento' */
  unidade: 'dpa' | 'rendimento';
}

export type TipoEventoAtivo = 'resultado' | 'resultado_estimado' | 'assembleia' | 'data_com';

export interface EventoAtivo {
  data: string;
  tipo: TipoEventoAtivo;
  titulo: string;
  descricao: string | null;
  estimado: boolean;
}

export interface EducacaoAtivo {
  titulo: string;
  href: string;
  descricao: string | null;
}

export interface FrescorAtivo {
  /** 'cotação B3 de 29/09' */
  cotacao: string | null;
  /** 'CVM DFP 2025 / ITR 2T26' */
  fundamentos: string | null;
  /** 'informe FII ago/26' */
  fii: string | null;
  painelAtrasado: boolean;
}

/**
 * GET /api/analise-ativos/ativos/[ticker] — 400 formato; 404 inexistente ou sem acesso.
 * Cache-Control: private, max-age=300. < 25 KB.
 */
export interface AtivoTopoResposta extends SinaisLeituraV2 {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  /** setor · segmento · listagem (ações) | tipo · segmento CVM (FIIs). SEM índice de mercado. */
  tags: string[];
  noQuadro: boolean;
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  assetId: string | null;
  /**
   * v2.5 (B preenche; C lê): tipo CVM BRUTO do FII (tijolo | papel | hibrido | fof | indefinido),
   * separado do tipo exibido nas tags, para a seção automática da Carteira não depender delas
   * (fiiTipoCvm 'fof' → seção 'fofi'). null = ação ou sem tipo.
   */
  fiiTipoCvm?: FiiTipoTela | null;
  /**
   * Anos seguidos com lucro (a coluna "Lucros seguidos" do Quadro), para a linha do próprio ativo
   * nos Pares (visual v2). Ausente = resposta antiga.
   */
  anosLucroConsecutivos?: number | null;
  cotacao: CotacaoTopo;
  /** v2.4 (C2): critérios nas 3 janelas; null = sem avaliação ainda */
  criterios: CriteriosAtivo | null;
  /** 8 por classe */
  kpis: KpiAtivo[];
  grafico: GraficoAtivo;
  dividendos: DividendosAtivo;
  /** no máximo 3; sem JCP estimado */
  eventos: EventoAtivo[];
  educacao: EducacaoAtivo;
  frescor: FrescorAtivo;
  versao: string;
  /** Bloco C: grupos em conferência (o "Por quê?"). Ausente = nenhum. */
  conferencias?: ConferenciaTela[];
  /** Bloco C: frescor por bloco (chave = BlocoReporte). Ausente = selo único de hoje. */
  frescorBlocos?: Partial<Record<string, FrescorBloco>>;
  /** EUA (fatia C): bolsa, exercício, link da SEC e motivo sem cotação. Ausente = ativo BR. */
  eua?: TopoEuaApi;
  /**
   * A6 (fatia C): variação acumulada da cotação (só preço), com ANALISE_ATIVOS_RETORNOS_HABILITADO.
   * Ausente = chave desligada ou sem linha em asset_retornos_cotacao (o card não aparece).
   */
  retornos?: RetornosCotacaoApi;
}

// ===========================================================================
// /api/analise-ativos/ativos/[ticker]/fundamentos (C) — preguiçoso
// ===========================================================================

export interface ColunaFundamentos {
  codigo: string;
  rotulo: string;
  formato: FormatoAnalise;
  /** coluna com fonte CVM que pode diferir do gestor (SeloFonteCvm) */
  fonteCvmAviso: boolean;
  /**
   * A6 (fatia B): definição da coluna quando depende do dado (ex.: qual receita a seguradora usou).
   * Ausente = o tooltip fixo de textosAtivo, como hoje.
   */
  tooltip?: string;
}

export interface LinhaFundamentos {
  /** '2025' ou 'Últ. 12m' */
  rotulo: string;
  ano: number | null;
  /** v2.4 (C2): último ano FECHADO (data-ultimo-ano) */
  ultimoAno: boolean;
  /**
   * F0 fundamentei-regras (A4.c, só com ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO): fim do exercício
   * ('AAAA-MM-DD'). Com mesFimExercicio ≠ 12 o rótulo vira 'fev/2026'. Ausente = como hoje.
   */
  dtFim?: string;
  valores: Record<string, Estado<number>>;
  selos: TipoSeloEstado[];
  /**
   * v2.5 (B): marca por coluna (código) — 'Lucro descontado'/'Margem descontada' com o lucro
   * líquido no lugar do descontado (fallback, ⓘ com textosAtivo.essencial.tooltips.fallbackLucro)
   * e célula de ponto incompleto (selo 'dados incompletos'). Ausente = nenhuma.
   */
  marcas?: Partial<Record<string, MarcaCelulaEssencial>>;
}

/** v2.5: marca de uma célula do Essencial. */
export interface MarcaCelulaEssencial {
  /** o valor usa a série de fallback (lucro líquido no lugar do descontado) */
  fallback?: boolean;
  /** a fonte marcou o ponto como incompleto (§6) */
  incompleto?: boolean;
  /** id da fonte do valor ('cvm' ou provedor) */
  fonte?: string;
  /**
   * F0 fundamentei-regras (REIT, REIT_FCO_AJUSTADO): o ano não tem SBC no 10-K; a célula usa o
   * caixa operacional sem ajuste (nota 'sbc_indisponivel')
   */
  sbcIndisponivel?: boolean;
}

export interface FundamentosResposta extends SinaisLeituraV2 {
  nivel: 'essencial';
  /** v2.4 (C2): o Essencial passa a R$ bi; EUA (fatia C) em US$ */
  unidade: 'R$ mi' | 'R$ bi' | 'US$ mi' | 'US$ bi';
  /** EUA: 'SEC' (relatório 10-K) */
  fonte: 'CVM' | 'SEC';
  padraoContabil: string | null;
  escopo: string | null;
  variante: 'acao' | 'fii_tijolo' | 'fii_papel' | 'stock' | 'reit';
  colunas: ColunaFundamentos[];
  /** só anos fechados + 'Últ. 12m' */
  linhas: LinhaFundamentos[];
  /** observações de rodapé do card (unidade, padrão contábil, fonte); v2.4: era `notas` */
  observacoes: string[];
  /**
   * v2.5 (B): nota de fonte montada pelas origens (textosCriterios.textoNotaFonte), no lugar do
   * 'fonte: CVM' fixo de textosAtivo.essencial.unidadeAcao.
   */
  textoFonte?: string;
  /** v2.5 (B): alguma célula com ponto incompleto → selo 'dados incompletos' no card */
  dadosIncompletos?: boolean;
  /** EUA (fatia C): colunas sem fonte no XBRL, escondidas com a observação da fase 2 */
  colunasPendentes?: ColunaPendenteEua[];
  /**
   * A6 (fatia B): template de financeira (colunas COLUNAS_ESSENCIAL_BANCO/SEGURADORA), só com
   * ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO. Ausente = template de hoje.
   */
  template?: TemplateFinanceira;
}

// ===========================================================================
// /api/analise-ativos/ativos/[ticker]/valuation (C) — preguiçoso
// ===========================================================================

export interface BarraValuation {
  visivel: boolean;
  min: number | null;
  media: number | null;
  max: number | null;
  nPontos: number;
  /** textoStatusBarra ("+40% vs. média 10a") ou 'histórico com menos de 5 anos · barra oculta' */
  statusTexto: string;
  extremo: 'maior' | 'menor' | null;
}

export interface ItemValuation {
  codigo: string;
  rotulo: string;
  atual: Estado<number>;
  formato: FormatoAnalise;
  leitura: string;
  referencia: { valor: number | null; rotulo: string };
  barra: BarraValuation;
  historico: Array<{ ano: number; valor: number | null }>;
}

export interface GrupoValuation {
  codigo: string;
  rotulo: string;
  resumo: string;
  /** ex.: banco no grupo Alavancagem (explicação no lugar dos cards) */
  explicacao: string | null;
  itens: ItemValuation[];
}

export interface HistoricoMultiplo {
  codigo: string;
  rotulo: string;
  formato: FormatoAnalise;
  media: number | null;
  pontos: Array<{ ano: number; valor: number | null }>;
}

export interface ValuationResposta extends SinaisLeituraV2 {
  grupos: GrupoValuation[];
  /** 2 mini-gráficos (ações: P/L e P/VP; FIIs: P/VP e DY) */
  historicos: HistoricoMultiplo[];
  pares: { criterio: string; itens: LinhaQuadroApi[] };
  /** observação de rodapé (referência dos pares); v2.4: era `nota` */
  observacao: string;
}

// ===========================================================================
// /api/analise-ativos/teses/[ticker] (D) — tese PRIVADA
// ===========================================================================

export const TESE_MAX_CARACTERES = 10_000;

/** GET — sempre do usuário LOGADO; consultor agindo → 403 'A tese é pessoal'. */
export interface TeseResposta {
  corpo: string;
  atualizadoEm: string | null;
  visibilidade: 'privada';
}

/** PUT (CSRF) — corpo trim ≤ 10.000; vazio apaga. */
export interface TesePutBody {
  corpo: string;
}
export interface TesePutResposta {
  atualizadoEm: string | null;
}
export interface TeseDeleteResposta {
  ok: true;
}

// ===========================================================================
// PROPS dos componentes (donos indicados).
// ===========================================================================

// ---- 0b (comuns) ----------------------------------------------------------

/** BarrasDezAnos — 'lucro': 10 barras com linha do zero; 'seguidos': 10 traços cheios até n. */
export type BarrasDezAnosProps =
  | { modo: 'lucro'; serie: PontoSerieAnual[]; ariaLabel?: string; className?: string }
  | {
      modo: 'seguidos';
      quantidade: number | null;
      /** padrão 10 */
      maximo?: number;
      ariaLabel?: string;
      className?: string;
    };

/** ValorAnalise — Estado<number> formatado; ausente = '—' com title do motivo; n/a = 'n/a'. */
export interface ValorAnaliseProps {
  valor: Estado<number>;
  formato: FormatoAnalise;
  /** mostra o motivo em texto visível embaixo (ex.: DY 'proventos em conferência') */
  mostrarMotivo?: boolean;
  className?: string;
}

/** SeloFonteCvm — 'fonte CVM · pode diferir do relatório do gestor'. */
export interface SeloFonteCvmProps {
  compacto?: boolean;
  className?: string;
}

/** SeloEstado — selos de estado (texto padrão em textosTela.SELOS_ESTADO). */
export interface SeloEstadoProps {
  tipo: TipoSeloEstado;
  texto?: string;
  className?: string;
}

/** Mercado do aviso legal: 'br' (CVM, RODAPE_LEGAL_V2) ou 'eua' (SEC, RODAPE_LEGAL_EUA). */
export type MercadoRodapeLegal = 'br' | 'eua';

/**
 * RodapeLegal — aviso legal RODAPE_LEGAL_V2 (textosLiterais, data-texto-legal); nas telas de
 * Stocks e REITs, RODAPE_LEGAL_EUA (mesmo texto com a fonte da SEC).
 */
export interface RodapeLegalProps {
  className?: string;
  /** padrão 'br' */
  mercado?: MercadoRodapeLegal;
}

/** BannerNovidade — aviso do beta, dispensável (localStorage por 30 dias); aponta para o Suporte. */
export interface BannerNovidadeProps {
  className?: string;
}

// ---- 0a (casca) -----------------------------------------------------------

export interface AnaliseAtivosShellProps {
  children: ReactNode;
  /**
   * 'quadro' mostra título + subtítulo + busca + banner; 'ativo' mostra só a busca compacta.
   * Bloco D: 'comparador' (página /analise-ativos/comparador, fatia C) cai no ramo 'ativo' até a
   * fatia D implementar o ramo próprio (título, subtítulo neutro, PilulasArea, busca compacta).
   * Bloco 1: 'salvos' (página /analise-ativos/salvos, fatia C); até a fatia C implementar o ramo
   * próprio, cai no ramo 'ativo'.
   */
  variante: 'quadro' | 'ativo' | 'comparador' | 'salvos';
  /**
   * Mercado do aviso legal quando a página já sabe (página do ativo: ticker EUA = 'eua'). Sem ele,
   * o Quadro e o Comparador decidem pela URL (?classe=stock|reit, ?c=, tickers EUA em ?t=).
   */
  mercado?: MercadoRodapeLegal;
}

export interface SecaoPreguicosaProps {
  children: ReactNode;
  /** altura reservada antes de montar (evita salto de layout) */
  alturaMinima?: number;
  /** padrão '400px' */
  rootMargin?: string;
  /** rótulo acessível do placeholder */
  rotulo?: string;
}

export interface PaginaAtivoProps {
  /** já validado e em maiúsculas */
  ticker: string;
}

// ---- A (Quadro + busca) ---------------------------------------------------

/** QuadroAnalise — estado (classe, ordem, filtros, modo) vem da URL (useEstadoQuadroUrl). */
export interface QuadroAnaliseProps {
  className?: string;
}

/** BuscaAtivos — combobox; padrão navega para /analise-ativos/[ticker]. */
export interface BuscaAtivosProps {
  variante: 'cabecalho' | 'compacta';
  autoFocus?: boolean;
  onSelecionar?: (ticker: string) => void;
  className?: string;
  /**
   * Bloco D (fatia C implementa): restringe a busca a uma classe (slots do Comparador). Sem a
   * prop, a busca é a de hoje (todas as classes).
   */
  classe?: ClasseQuadro;
  /**
   * Bloco D (fatia C): com `classe`, os itens da outra classe aparecem DESABILITADOS com o motivo
   * (textosComparador.busca.outraClasse) em vez de sumirem. Sem efeito sem `classe`.
   */
  desabilitarOutraClasse?: boolean;
}

// ---- B (topo da página do ativo) ------------------------------------------

export interface CabecalhoAtivoProps {
  ativo: AtivoTopoResposta;
  /** selo Na carteira / Planejado (overlay) */
  seloCarteira?: ReactNode;
  /** slot das ações (AcoesCarteiraAtivo, fatia D) */
  slotAcoes?: ReactNode;
}

export interface BlocoKpisProps {
  classe: ClasseQuadro;
  kpis: KpiAtivo[];
}

export interface GraficoLucroCotacaoProps {
  ticker: string;
  classe: ClasseQuadro;
  grafico: GraficoAtivo;
}

export interface BlocoDividendosProps {
  classe: ClasseQuadro;
  dividendos: DividendosAtivo;
}

export interface BlocoEventosProps {
  classe: ClasseQuadro;
  eventos: EventoAtivo[];
}

export interface CardEducacaoProps {
  educacao: EducacaoAtivo;
}

export interface SeloFrescorProps {
  frescor: FrescorAtivo;
}

// ---- C (análise, preguiçosos: cada bloco busca o próprio dado) -------------

export interface BlocoFundamentosEssencialProps {
  ticker: string;
  classe: ClasseQuadro;
  /**
   * Bloco D (fatia A implementa): conteúdo extra no cabeçalho do card (slot `acao` do
   * CartaoAnalise, antes do menu ⋯) — o SeletorNivel. Ausente = cabeçalho de hoje.
   */
  cabecalhoExtra?: ReactNode;
}

export interface BlocoValuationMultiplosProps {
  ticker: string;
  classe: ClasseQuadro;
  /**
   * Bloco D (fatia B implementa): conteúdo extra no cabeçalho do card (slot `acao` do
   * CartaoAnalise, antes do menu ⋯) — o SeletorNivel. Ausente = cabeçalho de hoje.
   */
  cabecalhoExtra?: ReactNode;
}

export interface BlocoMultiplosHistoricosProps {
  ticker: string;
  classe: ClasseQuadro;
}

export interface BlocoParesProps {
  ticker: string;
  classe: ClasseQuadro;
}

// ---- D (usuário) ----------------------------------------------------------

export interface BlocoNaCarteiraProps {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  assetId: string | null;
  /** preço do cabeçalho, para a nota 'valor pela cotação da Carteira de dd/mm' se divergir */
  precoCabecalho: number | null;
  precoData: string | null;
}

export interface AcoesCarteiraAtivoProps {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  assetId: string | null;
}

export interface BlocoTeseProps {
  ticker: string;
}
