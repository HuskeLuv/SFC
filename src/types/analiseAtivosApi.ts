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
 */
import type { ReactNode } from 'react';

// ===========================================================================
// Básicos
// ===========================================================================

/** Classes com tela na Fase 1 (Stocks/REITs escondidos, decisão 7). */
export type ClasseQuadro = 'acao' | 'fii';

/** Tipo do FII (Fase 0: regras/fii/tipoFii). */
export type FiiTipoTela = 'tijolo' | 'papel' | 'hibrido' | 'fof' | 'indefinido';

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
  | { estado: 'ausente'; motivo: string; texto: string }
  | { estado: 'nao_se_aplica'; motivo: string; texto: string };

/**
 * Estado do Índice MF de uma linha/ativo (decisão 4: três estados visualmente distintos + 2):
 * - calculado: anel sólido com número;
 * - incompleto: anel com trilho tracejado + selo "dados incompletos" + "o que falta";
 * - zero_regra: anel sólido normal + caixa "Componente zerado pela regra" (ex.: AURE3);
 * - fora_do_indice: FoF, "fora do Índice MF nesta fase" (sem número);
 * - sem_score: tem múltiplos mas não tem score (ex.: HCTR11), "Índice MF não calculado".
 */
export type EstadoIndice =
  | 'calculado'
  | 'incompleto'
  | 'zero_regra'
  | 'fora_do_indice'
  | 'sem_score';

/** Status de um critério do semáforo. */
export type StatusCriterioTela = 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | 'sem_dado';

/** Por que uma linha está fora do Quadro (aparece só na busca). */
export type ForaDoQuadroMotivo = 'sem_negociacao_30' | 'fiagro';

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
  | 'na_carteira';

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
}

// ===========================================================================
// /api/analise-ativos/quadro (A)
// ===========================================================================

export type OrdemQuadro =
  | 'indiceMf'
  | 'ticker'
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

/** Query da rota (zod na rota; estado espelhado na URL da página: ?classe=&ordem=&dir=&modo=&f=). */
export interface QuadroParams {
  classe: ClasseQuadro;
  ordem?: OrdemQuadro;
  dir?: DirecaoOrdem;
  lucroConsistente?: boolean;
  dyMin?: number;
  pvpMax?: number;
  tipo?: FiiTipoTela;
  naCarteira?: boolean;
  setor?: string;
  segmento?: string;
  somenteCompletos?: boolean;
  offset?: number;
  /** padrão 25, máximo 100 */
  limite?: number;
}

/** Índice MF numa linha do Quadro/pares. */
export interface IndiceLinha {
  valor: number | null;
  estado: EstadoIndice;
  /** incompleto: motivosIncompleto; zero_regra: componentes zerados; sem_score/fora: 1 motivo */
  motivos: MotivoTela[];
  criteriosAtendidos: number | null;
  criteriosAplicaveis: number | null;
  statusCriterios: StatusCriterioTela[];
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
  fiiTipo: FiiTipoTela | null;
  segmentoCvm: string | null;
  noQuadro: boolean;
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  preco: Estado<number>;
  precoData: string | null;
  variacaoDiaPct: number | null;
  liquidezMedia21: number | null;
  baixaLiquidez: boolean;
  indice: IndiceLinha;
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
  flags: string[];
  pares: string[];
  /** Asset.id do catálogo (null = fora do catálogo: o wizard abre no passo Ativo) */
  assetId: string | null;
}

export interface FrescorCotacao {
  data: string | null;
  status: 'em_dia' | 'atrasado' | 'sem_dado';
}

/**
 * GET /api/analise-ativos/quadro — só linhas noQuadro=true. Nulos e n/a sempre no fim; desempate
 * por ticker. 400 (zod); 404 sem acesso. Cache-Control: no-store (cache em memória no servidor).
 */
export interface QuadroResposta {
  classe: ClasseQuadro;
  dataRef: string | null;
  /** versão das linhas (max(geradoEm) ISO) */
  versao: string;
  total: number;
  offset: number;
  limite: number;
  contagens: { acao: number; fii: number };
  facetas: { setores: string[]; tipos: FiiTipoTela[] };
  frescorCotacao: FrescorCotacao;
  itens: LinhaQuadroApi[];
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
  /** Índice MF ou null */
  i: number | null;
  /** estado do Índice */
  e: EstadoIndice;
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
 * Alimenta o filtro "Na minha carteira", o selo e a busca. Os NÚMEROS do bloco "Na sua carteira"
 * vêm dos hooks da própria Carteira (useAcoes/useFii/resumo/configuração), não daqui.
 */
export interface OverlayCarteiraResposta {
  posicoes: Record<
    string,
    { portfolioId: string; quantidade: number; categoria: CategoriaCarteira }
  >;
  planejados: Record<
    string,
    { watchlistId: string; categoria: CategoriaCarteira; objetivoPct: number | null }
  >;
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

export interface ComponenteIndiceTela {
  /** 'lucro' | 'divida' | 'rent' | 'div' | 'preco' */
  nome: string;
  rotulo: string;
  nota: number | null;
  estado: 'calculado' | 'zero_regra' | 'ausente' | 'nao_se_aplica';
  /** peso efetivo (0–1) */
  peso: number | null;
  texto: string;
}

export interface IndiceTopo {
  valor: number | null;
  estado: EstadoIndice;
  /** 'acao' | 'acao_financeira' | 'fii_tijolo' | 'fii_papel' | 'fora_do_indice' */
  regua: string | null;
  motivos: MotivoTela[];
  /** incompleto: "o que falta"; zero_regra: "Componente zerado pela regra"; senão null */
  caixaExplicativa: { titulo: string; itens: string[] } | null;
  /** "4 de 5 critérios atendidos" */
  leitura: string;
  componentes: ComponenteIndiceTela[];
  /** fórmula pública */
  formula: string;
  criteriosAtendidos: number | null;
  criteriosAplicaveis: number | null;
}

export interface CriterioSemaforoTela {
  codigo: string;
  titulo: string;
  status: StatusCriterioTela;
  frase: string;
  provisorio: boolean;
  /** critério desligado até a validação da fonte (aparece como 'Não se aplica · critério desligado') */
  desligado: boolean;
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
export interface AtivoTopoResposta {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  /** setor · segmento · listagem (ações) | tipo · segmento CVM (FIIs). SEM índice de mercado. */
  tags: string[];
  noQuadro: boolean;
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  tickerReferenciaIndice: string | null;
  assetId: string | null;
  cotacao: CotacaoTopo;
  indice: IndiceTopo;
  semaforo: CriterioSemaforoTela[];
  /** 8 por classe */
  kpis: KpiAtivo[];
  grafico: GraficoAtivo;
  dividendos: DividendosAtivo;
  /** no máximo 3; sem JCP estimado */
  eventos: EventoAtivo[];
  educacao: EducacaoAtivo;
  frescor: FrescorAtivo;
  versao: string;
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
}

export interface LinhaFundamentos {
  /** '2025' ou 'Últ. 12m' */
  rotulo: string;
  ano: number | null;
  /** último ano FECHADO destacado */
  destaque: boolean;
  valores: Record<string, Estado<number>>;
  selos: TipoSeloEstado[];
}

export interface FundamentosResposta {
  nivel: 'essencial';
  unidade: 'R$ mi';
  fonte: 'CVM';
  padraoContabil: string | null;
  escopo: string | null;
  variante: 'acao' | 'fii_tijolo' | 'fii_papel';
  colunas: ColunaFundamentos[];
  /** só anos fechados + 'Últ. 12m' */
  linhas: LinhaFundamentos[];
  notas: string[];
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

export interface ValuationResposta {
  grupos: GrupoValuation[];
  /** 2 mini-gráficos (ações: P/L e P/VP; FIIs: P/VP e DY) */
  historicos: HistoricoMultiplo[];
  pares: { criterio: string; itens: LinhaQuadroApi[] };
  nota: string;
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
// PROPS dos componentes (stubs da 0a; donos indicados). Props FINAIS: mudar = PR na 0a.
// ===========================================================================

// ---- 0b (comuns) ----------------------------------------------------------

export type TamanhoAnel = 32 | 40 | 96;

/** AnelIndice — anel numa cor (outside), trilho tracejado só no incompleto. */
export interface AnelIndiceProps {
  valor: number | null;
  estado: EstadoIndice;
  tamanho: TamanhoAnel;
  className?: string;
}

/** BadgeCriterio — sempre ícone + texto (STATUS_CRITERIO), nunca só cor. */
export interface BadgeCriterioProps {
  status: StatusCriterioTela;
  /** texto alternativo ao rótulo padrão do status */
  rotulo?: string;
  compacto?: boolean;
  className?: string;
}

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

/** SeloIncompleto — chip tracejado + popover (celular: BottomSheet) com os motivos. */
export interface SeloIncompletoProps {
  motivos: MotivoTela[];
  ticker?: string;
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

/** RodapeLegal — texto de TEXTOS_ANALISE.rodapeLegal. */
export interface RodapeLegalProps {
  className?: string;
}

/** BannerNovidade — aviso do beta, dispensável (localStorage por 30 dias); aponta para o Suporte. */
export interface BannerNovidadeProps {
  className?: string;
}

// ---- 0a (casca) -----------------------------------------------------------

export interface AnaliseAtivosShellProps {
  children: ReactNode;
  /** 'quadro' mostra título + subtítulo + busca + banner; 'ativo' mostra só a busca compacta */
  variante: 'quadro' | 'ativo';
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
}

// ---- B (topo da página do ativo) ------------------------------------------

export interface CabecalhoAtivoProps {
  ativo: AtivoTopoResposta;
  /** selo Na carteira / Planejado (overlay) */
  seloCarteira?: ReactNode;
  /** slot das ações (AcoesCarteiraAtivo, fatia D) */
  slotAcoes?: ReactNode;
}

export interface BlocoIndiceSemaforoProps {
  ticker: string;
  classe: ClasseQuadro;
  indice: IndiceTopo;
  semaforo: CriterioSemaforoTela[];
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
}

export interface BlocoValuationMultiplosProps {
  ticker: string;
  classe: ClasseQuadro;
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
