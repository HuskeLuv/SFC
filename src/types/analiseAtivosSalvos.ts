/**
 * CONTRATOS do bloco 1 da Análise de Ativos (fatia 0): Salvos (listas com nome), filtros salvos do
 * Quadro, comparações salvas, Exportar PDF do Comparador e os avisos das listas. As fatias A
 * (backend), B (entradas), C (página Salvos) e D (avisos) programam contra estes tipos. Mudança aqui
 * = PR na fatia 0.
 *
 * Fonte: docs/analise-ativos/bloco1-salvos/desenho.json (arquitetura.apis/modelos_prisma/alertas/pdf).
 * Rotas e zod: src/services/analiseAtivos/salvos/contrato.ts (ROTAS_SALVOS, *Schema, LIMITES_SALVOS).
 *
 * Convenções
 * - Tudo é PESSOAL (decisão do Wellington, 16/10): a rota usa SEMPRE payload.id; consultor agindo
 *   pelo cliente → GET vazio com podeSalvar=false e motivoSemSalvar='consultor'; mutações 403
 *   (MENSAGEM_LISTAS_PESSOAIS). O PDF não leva dado pessoal e continua liberado.
 * - Datas e horas em ISO 8601 (UTC). Nenhuma resposta tem chave de nota, índice, semáforo ou
 *   destaque (contratoSemNota). Nenhum número é gravado: listas e comparações guardam tickers; a
 *   leitura recalcula com os dados do dia.
 * - NÃO confundir com o Watchlist da Carteira (planejados/objetivo).
 */
import type { ReactNode } from 'react';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  LinhaQuadroApi,
  ModoQuadro,
  OrdemQuadro,
  TipoFiiExibido,
} from '@/types/analiseAtivosApi';
import type { DefCriterioChip, IdCriterio, Janela } from '@/types/analiseAtivosCriterios';

// ===========================================================================
// Comuns
// ===========================================================================

/**
 * Classe de um item salvo. No bloco 1 o zod aceita só 'acao' | 'fii'; stock/reit entram pela fatia D
 * da feature EUA (ClasseSalvoSchema com ANALISE_ATIVOS_EUA_HABILITADO).
 */
export type ClasseItemSalvo = ClasseQuadro;
/** Classes que a coluna `classe` admite no banco (= ClasseQuadro desde a fatia 0 da feature EUA). */
export type ClasseItemReservada = ClasseQuadro;

/** Limites por usuário (salvos/contrato.ts, LIMITES_SALVOS), devolvidos nas respostas. */
export interface LimitesSalvos {
  /** caracteres do nome de lista, filtro ou comparação */
  nome: number;
  listas: number;
  itensPorLista: number;
  itensPorUsuario: number;
  filtrosPorClasse: number;
  comparacoes: number;
  pdfPorHora: number;
}

/** Motivo de o usuário não poder salvar (só o modo consultor no bloco 1). */
export type MotivoSemSalvar = 'consultor' | null;

/** Campos comuns às leituras pessoais (GET): o consultor recebe vazio + podeSalvar=false. */
export interface PermissaoSalvos {
  limites: LimitesSalvos;
  podeSalvar: boolean;
  motivoSemSalvar: MotivoSemSalvar;
}

export interface OkResposta {
  ok: true;
}

// ===========================================================================
// Listas — /api/analise-ativos/listas
// ===========================================================================

/** Os 3 avisos neutros de uma lista (criterios desligado por padrão). */
export interface AlertasLista {
  /** resultado entregue à CVM (padrão ligado) */
  resultado: boolean;
  /** provento anunciado, data-com (padrão ligado) */
  provento: boolean;
  /** mudança no "n de 6", janela FIXA de 5 anos (padrão desligado) */
  criterios: boolean;
}

export interface ContagemPorClasse {
  acao: number;
  fii: number;
  /** EUA (fatia D): ausente = 0 */
  stock?: number;
  reit?: number;
}

export interface ResumoLista {
  id: string;
  nome: string;
  contagem: ContagemPorClasse;
  alertas: AlertasLista;
  /** ISO */
  criadaEm: string;
}

/** GET /listas — em ordem de criação (sem reordenar no bloco 1). */
export interface ListasResposta extends PermissaoSalvos {
  listas: ResumoLista[];
}

/**
 * POST /listas (CSRF) → 201 ResumoLista. `tickerInicial` cobre o "Nova lista com TAEE11";
 * `alertas` (só com o recurso alertas; senão ignorado) cobre a opção "Avisar resultado e provento
 * anunciado" do Criar lista — ausente = padrão (resultado e provento ligados, critérios desligado).
 * 409: nome repetido (nomeNormalizado) ou 21ª lista.
 */
export interface ListaPostBody {
  nome: string;
  tickerInicial?: string;
  alertas?: Partial<AlertasLista>;
}

/** PATCH /listas/[id] (CSRF): alertas só com o recurso alertas (senão 400). */
export interface ListaPatchBody {
  nome?: string;
  alertas?: Partial<AlertasLista>;
}

/** GET /listas/[id]?classe=&janela=&ordem=&dir=&modo= */
export interface LinhasListaParams {
  classe: ClasseItemSalvo;
  janela?: Janela;
  ordem?: OrdemQuadro;
  dir?: DirecaoOrdem;
  modo?: ModoQuadro;
}

/** "antes 5 de 6 · 16/10": do marco 'criterios:5', só quando mudouEm > adicionadoEm. */
export interface CriteriosAnterior {
  atendidos: number;
  aplicaveis: number;
  /** ISO */
  mudouEm: string;
}

/** Linha da tabela Salvos = a linha do Quadro + "Adicionado em" (+ contagem anterior). */
export interface LinhaLista extends LinhaQuadroApi {
  /** ISO (createdAt do item) */
  adicionadoEm: string;
  criteriosAnterior?: CriteriosAnterior;
}

/** Item que saiu do Quadro (ou de classe reservada): fica visível para poder ser removido. */
export type MotivoForaDoQuadro = 'fora_do_quadro' | 'classe_reservada';

export interface ItemForaDoQuadro {
  ticker: string;
  classe: ClasseItemReservada;
  motivo: MotivoForaDoQuadro;
  /** ISO */
  adicionadoEm: string;
}

export interface LinhasListaResposta {
  lista: ResumoLista;
  classe: ClasseItemSalvo;
  janela: Janela;
  contagem: ContagemPorClasse;
  /** ordem padrão A–Z */
  linhas: LinhaLista[];
  foraDoQuadro: ItemForaDoQuadro[];
  definicoes: DefCriterioChip[];
}

/** POST /listas/[id]/itens (CSRF) → 201 (novo) ou 200 (já estava; Desfazer). */
export interface ItemPostBody {
  ticker: string;
}
export interface ItemPostResposta {
  ticker: string;
  classe: ClasseItemSalvo;
  /** ISO */
  adicionadoEm: string;
}

// ===========================================================================
// Índice do botão Salvar — /api/analise-ativos/salvos
// ===========================================================================

/** GET /salvos (staleTime 5 min): pertença de cada ticker, para cabeçalho, linhas e cartões. */
export interface IndiceSalvosResposta extends PermissaoSalvos {
  /** ticker → ids das listas que o contêm (só tickers salvos; no máximo 500 itens) */
  porTicker: Record<string, string[]>;
  /** em ordem de criação */
  listas: Array<{ id: string; nome: string }>;
}

/**
 * PUT /salvos/[ticker] (CSRF): define a pertença do ativo. ['padrao'] (SENTINELA_PADRAO) resolve:
 * 0 listas → cria 'Salvos' com o ativo; 1 lista → essa lista; 2+ → 400 (o cliente abre "Salvar
 * em…" e manda o conjunto explícito). [] remove de todas. Lista de outro usuário → 404.
 */
export interface SalvosPutBody {
  listaIds: string[];
}
export interface SalvosPutResposta {
  ticker: string;
  listaIds: string[];
  salvo: boolean;
  /** quando o sentinela criou a 1ª lista ('Salvos') */
  listaCriada?: { id: string; nome: string };
}

// ===========================================================================
// Filtros salvos do Quadro — /api/analise-ativos/filtros
// ===========================================================================

/** Só janela, critérios, setor (ou segmento) e "Na minha carteira" (sem modo/ordem/dir). */
export interface EstadoFiltroSalvoV1 {
  janela: Janela;
  criterios: IdCriterio[];
  naCarteira: boolean;
  /** setor (ações) ou segmento CVM (FIIs) */
  setor: string | null;
}

export interface FiltroSalvoApi {
  id: string;
  nome: string;
  classe: ClasseItemSalvo;
  estado: EstadoFiltroSalvoV1;
  /** true = algum critério deixou de existir na classe e foi retirado na leitura */
  ajustado: boolean;
  /** ISO */
  atualizadoEm: string;
  /** ISO ou null */
  ultimoUsoEm: string | null;
}

/** GET /filtros?classe= */
export interface FiltrosResposta extends PermissaoSalvos {
  filtros: FiltroSalvoApi[];
}

/** POST /filtros (CSRF) → 201 FiltroSalvoApi; mesmo nome na classe → 409 (o cliente oferece Substituir). */
export interface FiltroPostBody {
  nome: string;
  classe: ClasseItemSalvo;
  estado: EstadoFiltroSalvoV1;
}

/** PATCH /filtros/[id] (CSRF): estado = "Salvar alterações"; usado=true marca ultimoUsoEm. */
export interface FiltroPatchBody {
  nome?: string;
  estado?: EstadoFiltroSalvoV1;
  usado?: true;
}

// ===========================================================================
// Comparações salvas — /api/analise-ativos/comparacoes (salvos && comparador)
// ===========================================================================

export interface ComparacaoSalvaApi {
  id: string;
  nome: string;
  classe: ClasseItemSalvo;
  /** 1..4, na ordem dos slots */
  tickers: string[];
  janela: Janela;
  tipoFii: TipoFiiExibido | null;
  /** /analise-ativos/comparador?t=…&janela=…(&tipo=…) — hrefComparacao (contrato) */
  href: string;
  /** ISO */
  atualizadoEm: string;
}

/** GET /comparacoes?classe= (classe ausente = todas) */
export interface ComparacoesResposta extends PermissaoSalvos {
  comparacoes: ComparacaoSalvaApi[];
}

/**
 * POST /comparacoes (CSRF) → 201 {comparacao, atualizada:false}, ou 200 {comparacao,
 * atualizada:true} quando a chave (chaveComparacao) já existe. 31ª → 409. nome ausente =
 * nomePadraoComparacao(tickers).
 */
export interface ComparacaoPostBody {
  classe: ClasseItemSalvo;
  tickers: string[];
  janela: Janela;
  tipoFii?: TipoFiiExibido | null;
  nome?: string;
}
export interface ComparacaoPostResposta {
  comparacao: ComparacaoSalvaApi;
  atualizada: boolean;
}

export interface ComparacaoPatchBody {
  nome: string;
}

// ===========================================================================
// PDF do Comparador — GET /api/analise-ativos/comparacao-pdf?t=&janela=&tipo=
// ===========================================================================

/** Mesmos parâmetros do /comparador (+ tipo do FII). Resposta: application/pdf (attachment). */
export interface ComparacaoPdfParams {
  tickers: string[];
  janela?: Janela;
  tipoFii?: TipoFiiExibido | null;
}

/**
 * Resultado de baixarPdfComparacao (hook): 'baixado' = download ou menu de compartilhar abertos;
 * 'compartilhar' = iOS recusou o share depois do await (NotAllowedError): o arquivo fica guardado
 * e o botão vira "Compartilhar PDF" — o segundo toque chama `compartilhar()` com ativação nova.
 */
export type ResultadoPdfComparacao =
  | { estado: 'baixado'; nome: string }
  | { estado: 'compartilhar'; nome: string; compartilhar: () => Promise<void> };

// ===========================================================================
// Avisos das listas — /api/analise-ativos/alertas (exige o recurso alertas)
// ===========================================================================

/** Tipos de aviso (TIPOS_AVISO no contrato). 'resumo' = "Novidades em N ativos dos seus Salvos". */
export type TipoAviso = 'resultado' | 'provento' | 'criterios' | 'resumo';

/** metadata da Notification type ANALISE_SALVOS_ALERTA_TYPE (gravada pelo job da fatia D). */
export interface MetadataAvisoSalvos {
  /** '/analise-ativos/<TICKER>' ou ROTAS_SALVOS.paginaAlertas no resumo */
  href: string;
  /** 'PETR3/PETR4' no aviso por companhia; '*' no resumo */
  symbol: string;
  tipo: TipoAviso;
  /** null no resumo */
  classe: ClasseItemSalvo | null;
  /** a chave de dedupe do envio (AnaliseAlertaEnvio.chave) */
  eventoId: string;
}

export interface AvisoApi {
  /** id da Notification */
  id: string;
  titulo: string;
  mensagem: string;
  href: string;
  symbol: string;
  tipo: TipoAviso;
  classe: ClasseItemSalvo | null;
  /** ISO */
  criadoEm: string;
  lido: boolean;
}

/** GET /alertas?classe=&dias=90 (90 dias; mais novos primeiro). Consultor: vazio. */
export interface AlertasResposta {
  avisos: AvisoApi[];
  naoLidos: number;
  podeSalvar: boolean;
  motivoSemSalvar: MotivoSemSalvar;
}

/** POST /alertas/lidos (CSRF): ids ausente = todos os 90 dias. Consultor 403. */
export interface AlertasLidosBody {
  ids?: string[];
}
export interface AlertasLidosResposta {
  ok: true;
  marcados: number;
}

// ===========================================================================
// LGPD — privacidadeSalvos (fatia A): blocos do /api/profile/export
// ===========================================================================

export interface ExportacaoSalvos {
  listas: Array<{
    nome: string;
    alertas: AlertasLista;
    criadaEm: string;
    itens: Array<{ ticker: string; classe: string; adicionadoEm: string }>;
  }>;
  filtrosSalvos: Array<{
    nome: string;
    classe: string;
    estado: unknown;
    criadoEm: string;
    atualizadoEm: string;
    ultimoUsoEm: string | null;
  }>;
  comparacoes: Array<{
    nome: string;
    classe: string;
    tickers: string[];
    janela: number;
    tipoFii: string | null;
    criadaEm: string;
    atualizadaEm: string;
  }>;
  /** últimos 90 dias */
  alertasEnviados: Array<{ tipo: string; symbol: string; chave: string; data: string }>;
}

// ===========================================================================
// Componentes compartilhados (fatia 0) e stubs (fatia D)
// ===========================================================================

/** ModalNomeLista: criar (com tickerInicial opcional) ou renomear uma lista. */
export interface ModalNomeListaProps {
  aberto: boolean;
  modo: 'criar' | 'renomear';
  onFechar: () => void;
  /** criar: ResumoLista criada; renomear: a lista atualizada */
  onConcluir: (lista: ResumoLista) => void;
  /** renomear: a lista atual (nome preenchido) */
  lista?: Pick<ResumoLista, 'id' | 'nome'>;
  /** criar: "Nova lista com TAEE11" (o ativo entra na lista nova) */
  tickerInicial?: string;
  /** mostra "Avisar resultado e provento anunciado" (recursos.alertas) */
  alertasLigados?: boolean;
  /** listas atuais / limite (para o aviso do limite de 20); ausente = sem aviso prévio */
  totalListas?: number;
  limites?: LimitesSalvos;
}

/** ListaComparacoesSalvas: 'popover' (Comparador, fatia B) ou 'pagina' (Salvos, fatia C). */
export interface ListaComparacoesSalvasProps {
  variante: 'popover' | 'pagina';
  /** filtra pela classe; ausente = todas */
  classe?: ClasseItemSalvo;
  /** popover: fecha depois de abrir uma comparação */
  onFechar?: () => void;
  /** reabrir: padrão router.push(href) */
  onAbrir?: (c: ComparacaoSalvaApi) => void;
  className?: string;
}

/** Dados do toast do Salvar/Remover (mostrarToastSalvo, sobre mostrarToastMover). */
export type ToastSalvo =
  | {
      tipo: 'salvo';
      ticker: string;
      lista: string;
      /** acrescenta " · você recebe aviso de resultado e data-com" (só com recursos.alertas) */
      comAviso?: boolean;
      desfazer?: () => void;
    }
  | { tipo: 'removido'; ticker: string; lista: string; desfazer?: () => void }
  | { tipo: 'listaCriada'; lista: string; ticker?: string }
  | { tipo: 'erro'; mensagem: string; tentarDeNovo?: () => void }
  | { tipo: 'info'; mensagem: string };

/** AlertasDaLista (fatia D): os 3 interruptores da lista, PATCH /listas/[id]. */
export interface AlertasDaListaProps {
  aberto: boolean;
  lista: Pick<ResumoLista, 'id' | 'nome' | 'alertas'> & { totalAtivos: number };
  onFechar: () => void;
  onSalvo?: (lista: ResumoLista) => void;
}

/** AbaAlertas (fatia D): lista de 90 dias por dia, na classe da aba. */
export interface AbaAlertasProps {
  classe: ClasseItemSalvo;
  onTrocarClasse?: (classe: ClasseItemSalvo) => void;
  /** atalho "Ligar alertas de <lista>" no vazio */
  primeiraLista?: Pick<ResumoLista, 'id' | 'nome'> | null;
  onConfigurarAlertas?: (listaId: string) => void;
  onCriarLista?: () => void;
  /** slot opcional (ex.: o painel "Como os avisos chegam" montado pela página) */
  rodape?: ReactNode;
}
