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
 *
 * v2.4 — Filtros de Fundamentos (fatia F): o Comparador é ISONÔMICO (sem marca de valor, sem
 * direção, sem resumo com placar: critérios + indicadores lado a lado + "Leitura dos dados"); os
 * Cenários abrem com premissas EM BRANCO (premissasIniciais) e as premissas do usuário são
 * anuláveis (null = "informe …") no GET, no PUT e no salvo. Nenhuma chave do indicador antigo, de
 * nota, rating ou score (contratoSemNota.test.ts).
 */
import type {
  ClasseQuadro,
  Estado,
  ExibicaoConferenciaTela,
  FiiTipoTela,
  ForaDoQuadroMotivo,
  FormatoAnalise,
  SinaisLeituraV2,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';
import type {
  CriteriosLinhaApi,
  IdCriterio,
  Janela,
  LeituraDosDados,
  PremissasAcaoV2,
  PremissasFiiV2,
} from '@/types/analiseAtivosCriterios';
import type {
  CodigoBlocoRaioXFinanceira,
  CodigoLinhaRaioXBanco,
  CodigoLinhaRaioXFiiComplemento,
  CodigoLinhaRaioXSeguradora,
  TemplateFinanceira,
} from '@/types/analiseAtivosComplementos';

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
  /** A6 (fatia B): blocos de banco e seguradora */
  | CodigoBlocoRaioXFinanceira
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

/**
 * A6 (fatia 0): + linhas de banco/seguradora (fatia B) e 'obrigacoesAtivoPct' do FII ('Alavancagem
 * (% do ativo)', lida de asset_multiples_yearly; nula até a fatia E + scores). Contratos em
 * src/types/analiseAtivosComplementos.ts.
 */
export type CodigoLinhaRaioX =
  | CodigoLinhaRaioXAcao
  | CodigoLinhaRaioXFii
  | CodigoLinhaRaioXBanco
  | CodigoLinhaRaioXSeguradora
  | CodigoLinhaRaioXFiiComplemento;

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
  /**
   * A6 (fatia B): template de financeira (blocos intermediacao_resultado/balanco/fluxo_caixa no
   * banco; receita_resultado/operacao_seguros/proventos na seguradora), só com
   * ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO. Ausente = Raio-X de hoje.
   */
  template?: TemplateFinanceira;
  /**
   * F0 fundamentei-regras (A4.c, só com ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO): rótulo do
   * cabeçalho por ano quando o exercício não fecha em dezembro ('fev/2026') e a frase 'exercício
   * encerrado em {mês}'. Ausente = cabeçalho String(ano), como hoje.
   */
  rotulosAnos?: Record<number, string>;
  observacaoExercicio?: string;
}

/** Query da rota do Raio-X. Outro valor ⇒ 400. */
export type FormatoRespostaRaioX = 'json' | 'csv';

// ===========================================================================
// Meus cenários (fatia B)
// ===========================================================================

/**
 * Premissas de AÇÃO do usuário (pontos percentuais; margem em passos de 5). v2.4: em branco = null
 * ("informe …"); plAlvo pode faltar num cenário salvo antes da v2.4.
 */
export type PremissasCenarioAcao = Omit<PremissasAcaoV2, 'plAlvo'> & { plAlvo?: number | null };

/** Premissas de FII do usuário (v2.4: em branco = null). */
export type PremissasCenarioFii = PremissasFiiV2;

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
  /**
   * Só na cotação: política do "vs. cotação" (resultado ÷ cotação), a mesma do DY 12m no grupo que
   * marcou a cotação — preco_base ⇒ 'ocultar' ("—" e sem a linha da cotação nas barras);
   * preco_esporadico ⇒ 'selo' ("usa cotação em conferência"). Ausente = 'selo'.
   */
  vsCotacao?: ExibicaoConferenciaTela;
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
      /** v2.4 (C2): premissas em branco (yield/g/k null, margem 0, plAlvo = média 10a | null) */
      premissasIniciais: PremissasAcaoV2;
      salvo: CenarioSalvo<PremissasCenarioAcao, DadosEditadosAcao> | null;
    })
  | (CenariosRespostaComum & {
      classe: 'fii';
      base: BaseCenarioFii;
      /** v2.4 (C2): premissas em branco (yield/pvpAlvo/rendaMensal null, margem 0) */
      premissasIniciais: PremissasFiiV2;
      salvo: CenarioSalvo<PremissasCenarioFii, DadosEditadosFii> | null;
    });

/**
 * PUT /api/analise-ativos/cenarios/[ticker] — CenarioPutSchema (zod strict, cenarios/contrato.ts;
 * o teste de tipo confere que o schema e este tipo são o mesmo). Premissas anuláveis (v2.4).
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
 * Tipo do ativo para a aplicabilidade de grupo/linha: 'acao' ou o perfil de critérios do FII
 * (tijolo | papel; FoF, híbrido e indefinido seguem a regra de composição do motor, rec. 3).
 */
export type TipoAtivoComparador = 'acao' | 'tijolo' | 'papel';

/** Por que um ticker do ?t= ficou de fora (aviso no topo; textosComparador.ignorados). */
export type MotivoIgnorado = 'inexistente' | 'outra_classe' | 'excesso' | 'formato';

/** Célula do Comparador em conferência ('ocultar' = '—' + chip; 'selo' = valor + chip). */
export interface ConferenciaCelulaComparador {
  exibicao: ExibicaoConferenciaTela;
  motivo: string;
}

/** Uma linha de indicador (sem direção, sem marca de valor: todos com o mesmo peso visual). */
export interface LinhaComparador {
  codigo: string;
  rotulo: string;
  sub: string | null;
  formato: FormatoAnalise;
  /** selo 'fonte CVM' sob o valor (vacância física da CVM, que pode diferir do gestor) */
  fonteCvmAviso: boolean;
  /** chave = ticker; 'n/a' no misto (tijolo × papel) e nas financeiras */
  valores: Record<string, Estado<number>>;
  conferencia: Record<string, ConferenciaCelulaComparador | null>;
}

export interface GrupoComparador {
  codigo: string;
  rotulo: string;
  aplicavelA: TipoAtivoComparador[];
  linhas: LinhaComparador[];
}

/** Ativo do Comparador. */
export interface AtivoComparador {
  ticker: string;
  nome: string;
  preco: Estado<number>;
  precoData: string | null;
  fiiTipo: FiiTipoTela | null;
  /** 'acao' | 'tijolo' | 'papel' (perfil de critérios) */
  tipoComparacao: TipoAtivoComparador;
  /** critérios na janela pedida; null = sem avaliação */
  criterios: CriteriosLinhaApi | null;
  noQuadro: boolean;
  /** fora do Quadro entra com o selo 'sem negociação recente' */
  foraDoQuadroMotivo: ForaDoQuadroMotivo | null;
  /** grupos de conferência deste ativo */
  conferencias: string[];
  /** sugestões do mesmo segmento/tipo para o slot vazio */
  pares: string[];
}

/** Rótulos e equivalências do bloco de critérios (linhas na ordem do perfil). */
export interface CriteriosComparador {
  /** id da linha → rótulo, na ORDEM das linhas (no misto, 'Obrigações/PL ≤ 20% / LTV ≤ 60%') */
  rotulos: Partial<Record<IdCriterio, string>>;
  /** id da linha (tijolo) → id equivalente (papel); só no misto */
  equivalencias: Partial<Record<IdCriterio, IdCriterio>>;
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

/**
 * GET /api/analise-ativos/comparador?t=WEGE3,ITUB4&janela=5 (1 a MAX_ATIVOS_COMPARADOR; ≤ 80
 * caracteres; TICKER_RE; nenhum válido ⇒ 400). private, max-age=300. Sem dado do usuário ("Na
 * minha carteira" vem do overlay no cliente). A classe é a do 1º ticker válido; os de outra classe
 * saem em `ignorados`. Resposta ISONÔMICA: nenhuma direção, marca de valor ou placar.
 * ORDEM: `tickers`, `ativos`, `graficos.series` e `leitura.contagens` seguem a ordem pedida
 * (slots). O cache do servidor e o do cliente usam o conjunto ORDENADO + a classe decidida como
 * chave; quem lê do cache reordena pelos slots (no cliente, ordenarComparadorPelosSlots; no
 * servidor, montarComparador antes de responder).
 */
export interface ComparadorResposta extends SinaisLeituraV2 {
  classe: ClasseQuadro;
  janela: Janela;
  tickers: string[];
  ignorados: Array<{ ticker: string; motivo: MotivoIgnorado }>;
  /** tijolo + papel no mesmo conjunto (pelo perfil de critérios) */
  misto: boolean;
  ativos: AtivoComparador[];
  criterios: CriteriosComparador;
  grupos: GrupoComparador[];
  /** null com menos de 1 ativo válido */
  graficos: GraficosComparador | null;
  /** "Leitura dos dados" — só contagens + literal */
  leitura: LeituraDosDados;
  versao: string;
}

// ===========================================================================
// Props dos componentes de fronteira
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

/**
 * BandejaComparar (dono: D) — barra do modo Comparar do Quadro. Abre o Comparador a partir de 1
 * ativo (decisão 13; com 1, o Comparador pede mais um ativo para ver os dados lado a lado).
 */
export interface BandejaCompararProps {
  classe: ClasseQuadro;
  tickers: string[];
  onLimpar: () => void;
}
