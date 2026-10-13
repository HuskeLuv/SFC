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
 * - Nenhuma chave destes tipos casa /indice|semaforo|destaque|nota|rating|score/i (contratoSemNota).
 *
 * Mapa de donos (cada arquivo tem UM dono; ver tabela de ownership em spec-desenho.json):
 *   0  — este arquivo, params/*, textosCriterios, textosLiterais, linguagemV2, varrerDom,
 *        comum/{CelulaCriterios,MarcaCriterio,PilulasJanela,MiniBarrasAnuais}, lerCriterios (stub).
 *   A  — regras/criterios/*, calculo/executarCriterios, repositorio/criterios, lerCriterios (corpo),
 *        job 'criterios', gerarQuadro/montarLinhasQuadro (gravam CriteriosCompactos).
 *   B  — rota/consulta do Quadro (QuadroParams.janela/criterios, QuadroResposta.definicoes/
 *        totalClasse), busca sem i/e, BarraFiltrosCriterios, RodapeCriterios, textosQuadro.
 *   C1 — BarraAcoesAtivo + 4 modais (ModalAnalise), desvioAlvo/registroOperacao/secaoOperacao,
 *        overlay (objetivoPct/estrategia/tipoFii/secao/id), sugestoesComparar + rota,
 *        useAcoesCarteiraAnalise, textosAcoesCarteira (TEXTOS_OPERACAO).
 *   C2 — CardCriterios/ItemCriterio, AtivoTopoResposta.criterios, Essencial (ultimoAno, R$ bi),
 *        Valuation, cenários V2 (PremissasAcaoV2/PremissasFiiV2), pares, conferência sem
 *        efeitoIndice, textosAtivo.
 *   D  — Comparador (AtivoComparador.criterios, ComparadorResposta.leitura), BlocoCriteriosComparador,
 *        LeituraDosDados, SeletorTipoFii.
 *   F  — limpeza (textosTela, textos, respostas, constantes), torna obrigatórios os campos novos.
 */
import type { ReactNode } from 'react';
import type { ClasseQuadro, Estado, FiiTipoTela, FormatoAnalise } from '@/types/analiseAtivosApi';

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
export const PERFIS_CRITERIO = ['acao', 'acao_financeira', 'fii_tijolo', 'fii_papel'] as const;
export type PerfilCriterio = (typeof PERFIS_CRITERIO)[number];

/** Perfis com lista própria de 6 critérios em criteria_params (a financeira deriva de 'acao'). */
export type PerfilComLista = Exclude<PerfilCriterio, 'acao_financeira'>;

/**
 * Tipos de verificação (port do screen.js):
 * - up: cresceu em todos os anos da janela (J+1 valores, J comparações; empate não conta);
 * - pos: > 0 em todos os J anos; max: ≤ limite em todos os J anos; min: ≥ limite;
 * - months: rendimento pago em todos os 12×J meses (âncora jan/(fim−J+1)–dez/fim, rec. 4).
 */
export type TipoCriterio = 'up' | 'pos' | 'max' | 'min' | 'months';

/**
 * Ids dos critérios (estáveis: URL ?c=, criteria_eval.resultados, CriteriosCompactos):
 * Ações:  rec · luc · ebitda · mg · dl · fcl
 * FII tijolo: rend · vp · vac · alav · mes · res
 * FII papel:  rend · vp · inad · ltv · mes · res   (equivalências vac↔inad, alav↔ltv)
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
] as const;
export type IdCriterio = (typeof IDS_CRITERIO)[number];

export function ehIdCriterio(v: unknown): v is IdCriterio {
  return typeof v === 'string' && (IDS_CRITERIO as readonly string[]).includes(v);
}

/**
 * Série do banco que alimenta o critério (a fatia A monta; mesmas fontes do Essencial):
 * receita = FY.receita · lucroLiquido = FY.lucroAtribuivel (controladores, D2) · ebitda = ebit +
 * D&A · margemLiquida = lucro ÷ receita (receita ≤ 0 = ausente) · dlEbitda = (dívida bruta − caixa −
 * aplicações) ÷ EBITDA · fcl = fco − capex (NUNCA o campo fcf) · rendCota/vpCota =
 * AssetPerShareYearly × fatorCotasApos · obrigacoesPl = AssetMultiplesYearly.obrigacoesPlPct ·
 * resultadoFii = Σ 4 trimestres de FiiQuarterly.resultadoTrimestral · mesesRendimento = proventos
 * auditados · vacancia/inadimplencia/ltv = sem fonte confiável (D3, critério inativo).
 */
export const SERIES_CRITERIO = [
  'receita',
  'lucroLiquido',
  'ebitda',
  'margemLiquida',
  'dlEbitda',
  'fcl',
  'rendCota',
  'vpCota',
  'vacancia',
  'obrigacoesPl',
  'mesesRendimento',
  'resultadoFii',
  'inadimplencia',
  'ltv',
] as const;
export type SerieCriterio = (typeof SERIES_CRITERIO)[number];

/**
 * Formato dos números do fato (fmtC do screen.js; formatarValorCriterio em textosCriterios.ts):
 * n = inteiro com milhar ('17.500') · n1 = 1 casa · n2 = 2 casas · % = 1 casa + '%' · x = 1 casa
 * + '×'. |v| < 0,05 vira 0 (exceto n2); sinal negativo tipográfico '−'.
 */
export type FormatoCriterio = 'n' | 'n1' | 'n2' | '%' | 'x';

/** Unidade exibida entre parênteses no fato de 'up' ('cresceu … (R$ mi)'). */
export type UnidadeCriterio = 'R$ mi' | 'R$ bi' | 'R$';

/** Os 4 estados de um critério. 'sem_dado' conta como não atende. */
export const ESTADOS_CRITERIO = ['atende', 'nao_atende', 'sem_dado', 'nao_se_aplica'] as const;
export type EstadoCriterio = (typeof ESTADOS_CRITERIO)[number];

/**
 * Por que o critério não tem resultado normal (texto em textosCriterios.motivos):
 * - sem_dado_demonstracoes: valor ausente em algum ano exigido da janela (ou ano em conferência);
 * - sem_fonte_confiavel: critério inativo por D3 (vacância, inadimplência, LTV);
 * - base_proventos_curta: base de proventos começa depois do início da janela (rec. 4,
 *   params.meses.mesesBaseCurta = 'sem_dado');
 * - ebitda_nao_positivo: Dív.líq/EBITDA com EBITDA ≤ 0 e DL > 0 (fora, fato 'EBITDA ≤ 0 em AAAA');
 * - instituicao_financeira: n/a para bancos/seguradoras/holdings (D4).
 */
export type MotivoCriterio =
  | 'sem_dado_demonstracoes'
  | 'sem_fonte_confiavel'
  | 'base_proventos_curta'
  | 'ebitda_nao_positivo'
  | 'instituicao_financeira';

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
}

/** Avaliação de um ativo numa janela (= uma linha de criteria_eval sem as chaves técnicas). */
export interface AvaliacaoJanela {
  janela: Janela;
  anoInicio: number;
  anoFim: number;
  /** contagem de 'atende' (não é nota) */
  atendidos: number;
  /** critérios que se aplicam ao perfil (6; financeira 3) */
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

/** Marca compacta: [id, estado, fato]. */
export type MarcaCompacta = [IdCriterio, EstadoCriterio, string];

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
 * - fonte: 'DFP/ITR (CVM)' | 'informes de FIIs (CVM)';
 * - observacaoPerfil: FoF/indefinido 'avaliado com os critérios de papel (regra de composição)', ou null.
 */
export interface CriteriosAtivo {
  perfil: PerfilCriterio;
  fonte: string;
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
// Carteira (fatia C1) — base ÚNICA = % da aba (rec. 1)
// ===========================================================================

/** Entrada de desvioAlvo (puro): todos os valores na base da ABA. */
export interface EntradaDesvioAlvo {
  /** valor de mercado da posição (R$) */
  valorPosicao: number;
  /** valor da aba (distribuicao[aba].valor), base de posição, alvo e desvio */
  valorBaseAba: number;
  /** alvo em % da aba (null = sem alvo) */
  alvoPct: number | null;
  /** cotação usada para as quantidades */
  preco: number | null;
}

export interface ResultadoDesvioAlvo {
  posicaoPct: number;
  alvoValor: number | null;
  alvoQtd: number | null;
  /** posição − alvo, em p.p. da aba (negativo = abaixo do alvo) */
  desvioPp: number | null;
  desvioValor: number | null;
  desvioQtd: number | null;
}

/** Origem da seção da Carteira numa compra (secaoOperacao, fatia C1). */
export type OrigemSecaoOperacao = 'posicao' | 'planejado' | 'sugestao_cvm' | 'obrigatoria';

export interface SecaoOperacao {
  /** estrategia (ação: value|growth|risk) ou tipoFii (FII: tijolo|tvm|fofi…); null = obrigatória */
  valor: string | null;
  editavel: boolean;
  origem: OrigemSecaoOperacao;
}

// ===========================================================================
// PROPS dos componentes (fatia 0 = comuns; demais = stubs com props FINAIS)
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
  /** série anual por SerieCriterio; ano ausente = sem dado; anos em conferência já removidos */
  series: Partial<Record<SerieCriterio, Record<number, number | null>>>;
  /** meses com rendimento pago até dez/anoFim e o mês de início da base (meses) */
  meses: { consecutivos: number; inicioBase: string | null } | null;
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
