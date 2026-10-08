/**
 * CONTRATOS do Bloco D da Análise de Ativos (Fase 2: Raio-X, Meus cenários e Comparador), fatia 0.
 * Congelados: as fatias A (Raio-X), B (Cenários), C (Comparador) e D (entradas do Comparador)
 * programam contra estes tipos em worktrees separados, sem nenhum arquivo em comum. Mudança aqui =
 * PR na fatia 0.
 *
 * Fontes: docs/analise-ativos/blocoD/spec-desenho.json (apis, fatias) + decisoes.md, que PREVALECE.
 * Pontos em que as decisões mudam a spec e que estes tipos já trazem:
 *  - D3: a taxa de administração do FII APARECE no Raio-X ("Taxa de adm. (% do PL no ano)" =
 *    soma dos 12 meses; < 12 meses ⇒ ausente; soma acima de LIMIAR_TAXA_ADM_ANO_PCT ⇒ em
 *    conferência, política 'ocultar'): CodigoLinhaRaioXFii inclui 'taxaAdmAnoPct'.
 *  - D4: inadimplência, prazo médio, vencimentos e indexadores NÃO existem como linha.
 *  - D5: rendimento distribuído (2º tri + 4º tri) e payout do resultado do FII existem.
 *  - D9–D12: Resumo sem placar (sem contagem de ★, sem "X tem o maior"); dados de imóveis da CVM
 *    sem ★ (motivo 'sem_validacao_cvm'); payout neutro; até 4 ativos; tijolo + papel com aviso.
 *  - D13: nível Essencial/Raio-X NA URL (?fund=raiox); CSV `raio-x_<TICKER>_<AAAA-MM-DD>.csv`
 *    (constantes e helpers em src/services/analiseAtivos/cenarios/contrato.ts).
 *  - D7: consultor agindo — GET dos cenários 200 com salvo = null e podeSalvar = false.
 *
 * Mapa de rotas (dono):
 *   GET  /api/analise-ativos/ativos/[ticker]/raio-x            → RaioXResposta          (A)
 *   GET  /api/analise-ativos/ativos/[ticker]/raio-x?formato=csv → text/csv (anexo)      (A)
 *   GET  /api/analise-ativos/cenarios/[ticker]                  → CenariosResposta       (B)
 *   PUT  /api/analise-ativos/cenarios/[ticker]  CenarioPutBody  → CenarioPutResposta     (B, CSRF)
 *   DEL  /api/analise-ativos/cenarios/[ticker]                  → CenarioDeleteResposta  (B, CSRF)
 *   GET  /api/analise-ativos/comparador?t=A,B,C,D               → ComparadorResposta     (C)
 *   POST /api/planejamento-sonhos (EXISTENTE)                   ← Meta de renda          (B)
 * Toda rota do bloco passa por exigirRecursoAnalise(request, recurso) (404 com a flag desligada),
 * só lê o banco (nenhum provedor externo no caminho) e responde erros por withErrorHandler.
 *
 * Convenções iguais às da Fase 1 (src/types/analiseAtivosApi.ts): datas 'AAAA-MM-DD', percentuais
 * em pontos (6 = 6%), Estado<T> com motivo e texto prontos, só anos FECHADOS nas séries anuais.
 */
import type {
  ClasseQuadro,
  Estado,
  ExibicaoConferenciaTela,
  FiiTipoTela,
  ForaDoQuadroMotivo,
  FormatoAnalise,
  IndiceLinha,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';

// ===========================================================================
// Níveis dos cards (seletores)
// ===========================================================================

/**
 * Nível do card Fundamentos. Fica NA URL (decisão 13): `?fund=raiox` = Raio-X; ausente ou outro
 * valor = Essencial. Nada em localStorage. Constantes em cenarios/contrato.ts
 * (PARAM_NIVEL_FUNDAMENTOS, VALOR_NIVEL_RAIO_X). Sem config.recursos.raioX o parâmetro é ignorado.
 */
export type NivelFundamentos = 'essencial' | 'raioX';

/** Nível do card Valuation (estado local da página; sem decisão de URL). */
export type NivelValuation = 'multiplos' | 'cenarios';

/** Opção do SeletorNivel (controle segmentado). */
export interface OpcaoSeletorNivel<T extends string> {
  valor: T;
  rotulo: string;
}

/**
 * SeletorNivel (fatia 0) — controle segmentado role=group com botões aria-pressed, todos com
 * altura mínima de 44px EM TODOS OS TAMANHOS (decisão 13). Abaixo de 560px de container ocupa a
 * largura toda.
 */
export interface SeletorNivelProps<T extends string> {
  opcoes: ReadonlyArray<OpcaoSeletorNivel<T>>;
  ativo: T;
  onTrocar: (valor: T) => void;
  /** nome acessível do grupo (ex.: textosRaioX.seletor.rotuloGrupo) */
  rotuloGrupo: string;
  className?: string;
}

// ===========================================================================
// Raio-X (fatia A)
// ===========================================================================

/** Catálogo de linhas por variante (linhasRaioX.ts). */
export type VarianteRaioX = 'acao' | 'acao_financeira' | 'fii_tijolo' | 'fii_papel' | 'fii_outro';

/** Blocos (chips) do Raio-X. Ações: 3; FIIs: até 4 (tijolo OU papel na "carteira"). */
export type CodigoBlocoRaioX =
  | 'lucro_caixa'
  | 'caixa_divida'
  | 'fluxo_caixa'
  | 'resultado_distribuicao'
  | 'patrimonio_cota'
  | 'carteira_imoveis'
  | 'carteira_recebiveis'
  | 'alavancagem_custos';

/**
 * Linhas de AÇÕES (só as 'mostra' de cobertura_raio_x). Financeira: dívida, EBITDA, margens, caixa,
 * liquidez e ROIC saem e vão para RaioXResposta.linhasNaoAplicaveis. 'caixaFinanciamento' é o campo
 * `fcf` do banco (DFC 6.03) — a tela NUNCA rotula "FCF".
 */
export type CodigoLinhaRaioXAcao =
  | 'receita'
  | 'lucroBruto'
  | 'margemBrutaPct'
  | 'ebitda'
  | 'margemEbitdaPct'
  | 'ebit'
  | 'lucroLiquido'
  | 'margemLiquidaPct'
  | 'lpa'
  | 'roePct'
  | 'roicPct'
  | 'payoutPct'
  | 'patrimonioLiquido'
  | 'caixaAplicacoes'
  | 'dividaBruta'
  | 'dividaLiquida'
  | 'divLiqEbitda'
  | 'divLiqPl'
  | 'liquidezCorrente'
  | 'nAcoesMi'
  | 'fco'
  | 'fci'
  | 'caixaFinanciamento'
  | 'capex'
  | 'fcl'
  | 'fclLucroPct'
  | 'dividendosJcpPagos';

/**
 * Linhas de FIIs. Decisão 3: 'taxaAdmAnoPct' = Σ dos 12 taxaAdmPct mensais do ano ("% do PL no
 * ano"); com menos de 12 meses ⇒ ausente; soma > LIMIAR_TAXA_ADM_ANO_PCT ⇒ em conferência
 * (exibicao 'ocultar'). Decisão 4: sem inadimplência, prazo médio, vencimentos, indexadores.
 * Decisão 5: 'rendimentoDistribuido' (2º tri + 4º tri) e 'payoutResultadoPct' existem.
 * Valores por cota na base de cotas de HOJE (÷ fatorCotasApos).
 */
export type CodigoLinhaRaioXFii =
  | 'receitaAluguel'
  | 'resultado'
  | 'rendimentoDistribuido'
  | 'rendimentoCota'
  | 'dyPct'
  | 'payoutResultadoPct'
  | 'resultadoCota'
  | 'patrimonioLiquido'
  | 'vpCota'
  | 'pvp'
  | 'nCotasMi'
  | 'cotistas'
  | 'nImoveis'
  | 'areaInformadaMilM2'
  | 'vacanciaFisicaPct'
  | 'nCri'
  | 'maiorCriPct'
  | 'obrigacoesPlPct'
  | 'taxaAdmAnoPct'
  | 'taxaPerformance';

export type CodigoLinhaRaioX = CodigoLinhaRaioXAcao | CodigoLinhaRaioXFii;

/**
 * Formatos do Raio-X (tela; o CSV tem as casas próprias da fatia A):
 * moedaMi = R$ mi · moeda = R$ por ação/cota · pct = '%' (taxa de adm. com 2 casas) ·
 * multiplo = 'x' · milhoes = nº em milhões (1 casa) · inteiro · areaMilM2 = mil m².
 */
export type FormatoRaioX =
  | 'moedaMi'
  | 'moeda'
  | 'pct'
  | 'multiplo'
  | 'milhoes'
  | 'inteiro'
  | 'areaMilM2';

/** Conferência de UMA célula (ano) — alimenta o ChipConferencia ("Por quê?"). */
export interface ConferenciaCelulaRaioX {
  exibicao: ExibicaoConferenciaTela;
  /** texto pronto (textosRaioX.conferencia.* ou textosTela.conferencia.motivos) */
  motivo: string;
}

export interface LinhaRaioX {
  codigo: CodigoLinhaRaioX;
  rotulo: string;
  /** explicação curta sob o rótulo (11,5px), ex.: 'na base de ações de hoje' */
  sub: string | null;
  /** 'razao' = itálico + fundo cinza + aria '(razão)' */
  tipo: 'valor' | 'razao';
  formato: FormatoRaioX;
  /** selo 'fonte CVM · pode diferir do relatório do gestor' (imóveis, CRIs) */
  fonteCvmAviso: boolean;
  /** CampoTela da conferência (CAMPO_LINHA_RAIOX) ou null */
  campoConferencia: string | null;
  /** chave = ano (número em string no JSON). Ano sem chave = sem dado ('—'). */
  valores: Record<number, Estado<number>>;
  /** selos por ano (ex.: ['em_conferencia'] na política 'selo', ['proventos_em_conferencia']) */
  selos: Record<number, TipoSeloEstado[]>;
  /** conferência por ano ('ocultar' = '—' + chip; 'selo' = valor + chip) */
  conferencias: Record<number, ConferenciaCelulaRaioX>;
  observacao: string | null;
}

export interface BlocoRaioX {
  codigo: CodigoBlocoRaioX;
  rotulo: string;
  linhas: LinhaRaioX[];
}

/**
 * GET /api/analise-ativos/ativos/[ticker]/raio-x (?formato=json, padrão).
 * Cache-Control: private, max-age=300. 404 com a flag desligada, sem acesso ou ticker fora do
 * Quadro; 400 com formato inválido. Sem nenhum dado do usuário.
 */
export interface RaioXResposta {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
  variante: VarianteRaioX;
  unidade: 'R$ mi';
  base: 'ano fiscal';
  fonte: 'CVM';
  /** 'IFRS' | 'BRGAAP' | ... (ações) ou null (FII) */
  padraoContabil: string | null;
  /** 'con' | 'ind' (ações) ou null */
  escopo: 'con' | 'ind' | null;
  /** anos FECHADOS, decrescente (mais recente primeiro), até 10 */
  anos: number[];
  blocos: BlocoRaioX[];
  /** bloco "Sobre os dados" (nunca "Notas") */
  observacoes: string[];
  /** rótulos das linhas n/a em TODOS os anos (saem da tabela; ITUB4: 9 linhas) */
  linhasNaoAplicaveis: string[];
  versao: string;
}

/** Query da rota do Raio-X. Outro valor ⇒ 400. */
export type FormatoRespostaRaioX = 'json' | 'csv';

// ===========================================================================
// Meus cenários (fatia B)
// ===========================================================================

/** Premissas de AÇÃO (pontos percentuais; margem em passos de 5). plAlvo vazio = null. */
export interface PremissasCenarioAcao {
  yieldPct: number;
  gPct: number;
  kPct: number;
  margemPct: number;
  plAlvo?: number | null;
}

/** Premissas de FII. */
export interface PremissasCenarioFii {
  yieldPct: number;
  margemPct: number;
  rendaMensal: number;
  pvpAlvo: number;
}

/** Só o que o usuário editou e difere do valor do ativo (diffDadosEditados). */
export interface DadosEditadosAcao {
  lpa?: number;
  vpa?: number;
  dpa?: number;
}

export interface DadosEditadosFii {
  rend12m?: number;
  vpCota?: number;
}

export type CampoDadoCenarioAcao = keyof DadosEditadosAcao;
export type CampoDadoCenarioFii = keyof DadosEditadosFii;

/**
 * Dado do ativo em conferência nos cenários (decisão 6, política do grupo do Bloco C):
 * 'ocultar' ⇒ campo vazio + chip (o usuário pode digitar); 'selo' ⇒ campo preenchido + chip e os
 * métodos que usam o dado mostram 'usa <dado> em conferência'.
 */
export interface ConferenciaCampoCenario {
  campo: CampoDadoCenarioAcao | CampoDadoCenarioFii | 'cotacao';
  exibicao: ExibicaoConferenciaTela;
  motivo: string;
}

export interface BaseCenarioAcao {
  lpa: Estado<number>;
  vpa: Estado<number>;
  dpa: Estado<number>;
  /** plMedia10a só com plPontosHistorico ≥ 5; senão ausente('historico_curto') */
  plAlvoPadrao: Estado<number>;
  conferencias: ConferenciaCampoCenario[];
}

export interface BaseCenarioFii {
  rend12m: Estado<number>;
  vpCota: Estado<number>;
  pvpAtual: Estado<number>;
  conferencias: ConferenciaCampoCenario[];
}

/** Limites de validação (LIMITES_CENARIO em cenarios/contrato.ts), enviados ao cliente. */
export interface LimitesCenario {
  yieldPct: readonly [number, number];
  gPct: readonly [number, number];
  kPct: readonly [number, number];
  margemPct: readonly [number, number];
  margemPasso: number;
  plAlvo: readonly [number, number];
  pvpAlvo: readonly [number, number];
  rendaMensal: readonly [number, number];
  /** |dado do ativo| ≤ este valor (finito) */
  dadoAbsMax: number;
}

export interface CenarioSalvo<P, D> {
  premissas: P;
  dadosEditados: D | null;
  /** ISO */
  atualizadoEm: string;
  /**
   * Fatia B (acréscimo opcional): valor do ATIVO, no momento do salvamento, de cada campo de
   * dadosEditados (o servidor grava a partir da base). Diferente do valor de hoje ⇒ a tela avisa
   * "O valor do ativo mudou desde que você salvou" + "Usar o valor atual". Ausente = sem aviso.
   */
  valoresDoAtivoNoSalvamento?: D | null;
}

interface CenariosRespostaComum {
  ticker: string;
  nome: string;
  cotacao: {
    valor: Estado<number>;
    /** AAAA-MM-DD do precoData ('fechamento de dd/mm') */
    data: string | null;
    conferencia: ConferenciaCampoCenario | null;
  };
  limites: LimitesCenario;
  /** false com consultor agindo (decisão 7) */
  podeSalvar: boolean;
  motivoSemSalvar: 'consultor' | null;
  versao: string;
}

/**
 * GET /api/analise-ativos/cenarios/[ticker] — no-store. O salvo é SEMPRE do payload.id; com
 * consultor agindo: 200 com salvo = null, podeSalvar = false, motivoSemSalvar = 'consultor' e a
 * base completa (a calculadora funciona com a posição do cliente, que vem do overlay da carteira).
 */
export type CenariosResposta =
  | (CenariosRespostaComum & {
      classe: 'acao';
      base: BaseCenarioAcao;
      premissasPadrao: PremissasCenarioAcao;
      salvo: CenarioSalvo<PremissasCenarioAcao, DadosEditadosAcao> | null;
    })
  | (CenariosRespostaComum & {
      classe: 'fii';
      base: BaseCenarioFii;
      premissasPadrao: PremissasCenarioFii;
      salvo: CenarioSalvo<PremissasCenarioFii, DadosEditadosFii> | null;
    });

/**
 * PUT /api/analise-ativos/cenarios/[ticker] — CenarioPutSchema (zod strict, cenarios/contrato.ts).
 * classe ≠ classe do ativo ⇒ 400; consultor ⇒ 403; 301º cenário do usuário ⇒ 409.
 */
export type CenarioPutBody =
  | { classe: 'acao'; premissas: PremissasCenarioAcao; dados?: DadosEditadosAcao }
  | { classe: 'fii'; premissas: PremissasCenarioFii; dados?: DadosEditadosFii };

export interface CenarioPutResposta {
  atualizadoEm: string;
}

/** DELETE (idempotente) — "Restaurar valores do ativo" (sem confirmação; "Desfazer" regrava). */
export interface CenarioDeleteResposta {
  ok: true;
}

/** Métodos da tabela de cenários (ordem fixa, sem ranking). */
export type MetodoCenario =
  | 'bazin'
  | 'graham'
  | 'multiplo'
  | 'gordon'
  | 'rendaDesejada'
  | 'pvpAlvo';

// ===========================================================================
// Comparador (fatia C)
// ===========================================================================

/**
 * Direção do ★ ('valor numericamente mais favorável', nunca 'melhor'):
 * maior · menor · menor_positivo (P/L: ≤ 0 fica fora) · perto_de_1 (P/VP de papel) · neutro (sem ★).
 */
export type DirecaoDestaque = 'maior' | 'menor' | 'menor_positivo' | 'perto_de_1' | 'neutro';

/** Por que uma linha ficou sem ★ (texto em textosComparador.semDestaque). */
export type MotivoSemDestaque =
  | 'menos_de_2'
  | 'empate'
  | 'neutro'
  | 'tipos_diferentes'
  | 'sem_validacao_cvm';

/** Por que um ticker do ?t= ficou de fora (aviso no topo; textosComparador.ignorados). */
export type MotivoIgnorado = 'inexistente' | 'outra_classe' | 'excesso' | 'formato';

/** Célula do Comparador em conferência ('ocultar' = '—' + chip; 'selo' = valor + chip; sem ★). */
export interface ConferenciaCelulaComparador {
  exibicao: ExibicaoConferenciaTela;
  motivo: string;
}

export interface LinhaComparador {
  codigo: string;
  rotulo: string;
  sub: string | null;
  formato: FormatoAnalise;
  direcao: DirecaoDestaque;
  /** selo 'fonte CVM' (imóveis/CRIs; decisão 10: sem ★) */
  fonteCvmAviso: boolean;
  /** selo 'critério provisório' (nº de CRIs, maior CRI) */
  criterioProvisorio: boolean;
  /** chave = ticker; n/a no misto (tijolo × papel) */
  valores: Record<string, Estado<number>>;
  conferencia: Record<string, ConferenciaCelulaComparador | null>;
  /** ticker com ★ (calculado no servidor sobre o valor arredondado como exibido) ou null */
  destaque: string | null;
  motivoSemDestaque: MotivoSemDestaque | null;
}

export interface GrupoComparador {
  codigo: string;
  rotulo: string;
  /** a que o grupo se aplica ('acao' ou tipos de FII) */
  aplicavelA: Array<'acao' | FiiTipoTela>;
  linhas: LinhaComparador[];
}

export interface AtivoComparador {
  ticker: string;
  nome: string;
  preco: Estado<number>;
  precoData: string | null;
  fiiTipo: FiiTipoTela | null;
  /** régua do Índice (ex.: 'tijolo'), null em ação */
  regua: string | null;
  /** Índice MF + statusCriterios (anel; incompleto tracejado) */
  indice: IndiceLinha;
  noQuadro: boolean;
  /** fora do Quadro entra com o selo 'sem negociação recente' */
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  /** CampoTela em conferência neste ativo */
  conferencias: string[];
  /** sugestões do mesmo segmento/tipo para o slot vazio */
  pares: string[];
}

/** Mini-gráficos em base 100, MESMA escala para todos (min = min(mín. global, 100)). */
export interface GraficosComparador {
  tipo: 'lucro' | 'vpCota';
  titulo: string;
  anos: number[];
  escala: { min: number; max: number };
  series: Array<{
    ticker: string;
    /** base 100 no 1º ano > 0; null = sem dado ou ano com salto per-share */
    pontos: Array<number | null>;
    /** ano em conferência (traço) */
    emConferencia: boolean[];
    /** menos de 3 pontos ⇒ 'histórico insuficiente' */
    insuficiente: boolean;
  }>;
}

/** Resumo numérico SEM placar (decisão 9): ordem dos slots, sem contar ★, sem "X tem o maior". */
export interface ResumoComparador {
  indices: Array<{ ticker: string; valor: number | null; incompleto: boolean }>;
  criteriosAtendidos: Array<{ ticker: string; atende: number | null; total: number | null }>;
  emConferencia: Array<{ ticker: string; rotulos: string[] }>;
  /** textosComparador.resumo.responsabilidade */
  responsabilidade: string;
}

/**
 * GET /api/analise-ativos/comparador?t=WEGE3,ITUB4 (1 a MAX_ATIVOS_COMPARADOR; ≤ 80 caracteres;
 * TICKER_RE; nenhum válido ⇒ 400). private, max-age=300. Sem dado do usuário ("Na minha carteira"
 * vem do overlay no cliente). A classe é a do 1º ticker válido; os de outra classe saem em
 * `ignorados`. ORDEM: `tickers`, `ativos`, `resumo.*` e `graficos.series` seguem a ordem pedida
 * (slots). O cache do servidor e o do cliente usam o conjunto ORDENADO + a classe decidida (o 1º
 * slot, no cliente) como chave; quem lê do cache reordena pelos slots (no cliente,
 * ordenarComparadorPelosSlots; no servidor, montarComparador antes de responder).
 */
export interface ComparadorResposta {
  classe: ClasseQuadro;
  tickers: string[];
  ignorados: Array<{ ticker: string; motivo: MotivoIgnorado }>;
  /** tijolo + papel no mesmo conjunto (aviso neutro; n/a nas linhas do outro tipo) */
  misto: boolean;
  ativos: AtivoComparador[];
  grupos: GrupoComparador[];
  /** null com menos de 1 ativo válido */
  graficos: GraficosComparador | null;
  resumo: ResumoComparador;
  versao: string;
}

// ===========================================================================
// Props dos componentes de fronteira (stubs da fatia 0)
// ===========================================================================

/**
 * BlocoFundamentos (dono: A) — card "Fundamentos" com o SeletorNivel 'Essencial | Raio-X' quando
 * config.recursos.raioX; sem o recurso, renderiza exatamente o BlocoFundamentosEssencial de hoje.
 * Nível lido/escrito em ?fund=raiox (router.replace, sem rolar). A PaginaAtivo NUNCA muda por A.
 */
export interface BlocoFundamentosProps {
  ticker: string;
  classe: ClasseQuadro;
}

/**
 * BlocoValuation (dono: B) — card "Valuation" com o SeletorNivel 'Múltiplos | Meus cenários'
 * quando config.recursos.cenarios; sem o recurso, renderiza exatamente o BlocoValuationMultiplos.
 * `nome` serve ao nome do objetivo da Meta de renda.
 */
export interface BlocoValuationProps {
  ticker: string;
  classe: ClasseQuadro;
  nome: string;
}

/** Comparador (dono: C) — a página lê o estado de ?t= (useEstadoComparadorUrl). */
export interface ComparadorProps {
  className?: string;
}

/** PilulasArea (dono: D) — 'Quadro' | 'Comparador' (aria-current; 44px). Só com recursos.comparador. */
export interface PilulasAreaProps {
  ativa: 'quadro' | 'comparador';
  className?: string;
}

/** BotaoComparar (dono: D) — no CabecalhoAtivo; link para ROTAS_BLOCO_D.comparar([ticker]). */
export interface BotaoCompararProps {
  ticker: string;
  classe: ClasseQuadro;
}

/**
 * BandejaComparar (dono: D) — barra do modo Comparar do Quadro. Abre o Comparador a partir de 1
 * ativo (decisão 13; com 1, o Comparador diz "adicione mais um para ver destaques").
 */
export interface BandejaCompararProps {
  classe: ClasseQuadro;
  tickers: string[];
  onLimpar: () => void;
}
