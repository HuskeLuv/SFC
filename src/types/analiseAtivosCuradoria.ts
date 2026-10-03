/**
 * CONTRATOS do bloco C da Análise de Ativos — relatar dado incorreto + curadoria (fatia 0).
 * Congelados: as fatias C (curadoria admin) e D (relato do usuário) programam contra estes tipos.
 *
 * Fonte: docs/analise-ativos/blocoC/spec-desenho.json (arquitetura.apis) + decisoes.md (prevalece).
 * Constantes, enums e funções puras: src/services/analiseAtivos/curadoria/contrato.ts.
 *
 * Convenções (as da Fase 1): datas civis 'AAAA-MM-DD'; instantes ISO; erros
 * { error, details? } (withErrorHandler); Cache-Control: no-store em todas as rotas abaixo.
 * Texto livre do usuário é SEMPRE renderizado como texto (nunca HTML, nunca link automático).
 *
 * Mapa de rotas (dono):
 *   POST  /api/analise-ativos/reportes   ReportePostBody → 201 ReportePostResposta
 *                                        | 409 ReporteConflito409 (duplicado)   (D, CSRF)
 *   GET   /api/analise-ativos/meus-reportes?ticker=&cursor= → MeusReportesResposta   (D)
 *   GET   /api/admin/analise-ativos/casos?{CasosListaQuery} → CasosListaResposta     (C)
 *   GET   /api/admin/analise-ativos/casos/[id]             → CasoDetalheResposta    (C)
 *   PATCH /api/admin/analise-ativos/casos/[id] CasoPatchBody → CasoPatchResposta     (C, CSRF)
 *   GET   /api/cron/analise-ativos/curadoria               → RelatorioJob            (C)
 * Guardas: rotas do usuário = exigirAcessoAnalise + ANALISE_ATIVOS_REPORTE_HABILITADO (404);
 * rotas admin = requireAdmin (403). Curadores = admins (decisão 13).
 */
import type {
  BlocoReporte,
  CampoReporte,
  EfeitoTela,
  OrigemCaso,
  ResolucaoCaso,
  StatusCaso,
  StatusParaUsuario,
  TipoEventoCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import type { CampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ClasseQuadro, FrescorBloco } from '@/types/analiseAtivosApi';

export type {
  BlocoReporte,
  CampoReporte,
  EfeitoTela,
  OrigemCaso,
  ResolucaoCaso,
  StatusCaso,
  StatusParaUsuario,
  TipoEventoCaso,
};

// ===========================================================================
// POST /api/analise-ativos/reportes (D)
// ===========================================================================

/**
 * Corpo do relato (zod strict na rota). Textos passam por sanearTextoLivre ANTES da validação de
 * tamanho; HTML (contemHtml) → 400. Limites em contrato.LIMITES.
 */
export interface ReportePostBody {
  ticker: string;
  bloco: BlocoReporte;
  /** CAMPOS_REPORTAVEIS[bloco] ou 'outro' */
  campo: CampoReporte;
  /** o que a tela mostrava (≤ 64) */
  valorExibido?: string;
  /** período exibido ('2025', 'últ. 12m', '2T26') (≤ 32) */
  periodo?: string;
  /** fonte exibida ('CVM DFP 2025') (≤ 160) */
  fonteExibida?: string;
  /** frescor exibido ('atualizado em 29/09') (≤ 160) */
  frescorExibido?: string;
  /** versão do Quadro/página (AtivoTopoResposta.versao) (≤ 40) */
  versao: string;
  /** "O que está errado?" (10..1000) */
  mensagem: string;
  /** "Valor que você esperava" (opcional, ≤ 64; decisão 8) */
  valorEsperado?: string;
  /** "Onde você viu?" (opcional, ≤ 300; guardado como texto, nunca link automático) */
  fonteEsperada?: string;
}

/** 201 */
export interface ReportePostResposta {
  id: string;
  casoId: string;
  /** 8 caracteres (contrato.gerarProtocolo) */
  protocolo: string;
  status: StatusCaso;
  /** AAAA-MM-DD (5 dias úteis desde o 1º relato do caso) */
  slaAte: string | null;
}

/**
 * 409 — já há relato ABERTO do mesmo usuário para (ticker, campo, periodo): nada é criado e a tela
 * leva ao relato existente (decisão 7).
 */
export interface ReporteConflito409 {
  error: string;
  casoId: string;
  reporteId: string;
}

/** 429 — limite atingido (por dia, por hora no ativo, global ou IP). */
export interface ReporteLimite429 {
  error: string;
  /** qual limite; a tela escolhe o texto */
  limite: 'dia' | 'hora_ativo' | 'global' | 'ip';
  /** ISO de quando o envio volta, se conhecido */
  voltaEm?: string | null;
}

// ===========================================================================
// GET /api/analise-ativos/meus-reportes (D)
// ===========================================================================

export interface ItemMeuReporte {
  id: string;
  protocolo: string;
  ticker: string;
  bloco: BlocoReporte;
  campo: CampoReporte;
  periodo: string | null;
  /** ISO */
  criadoEm: string;
  caso: {
    /** como o usuário vê (rejeitado = 'conferido_sem_alteracao') */
    status: StatusParaUsuario;
    slaAte: string | null;
    atualizadoEm: string;
    /** só fechado */
    resolucao: ResolucaoCaso | null;
    /** só fechado */
    respostaPublica: string | null;
    /** resposta ainda não vista (fechado depois do último acesso) */
    novo: boolean;
  };
}

export interface MeusReportesResposta {
  itens: ItemMeuReporte[];
  proximoCursor: string | null;
}

// ===========================================================================
// /api/admin/analise-ativos/casos (C)
// ===========================================================================

export type TipoCaso = 'bloqueante' | 'revisao';

export interface CasosListaQuery {
  status?: StatusCaso;
  origem?: OrigemCaso;
  tipo?: TipoCaso;
  classe?: ClasseQuadro;
  grupo?: string;
  /** busca por ticker */
  q?: string;
  prazo?: 'vence_hoje' | 'vencido';
  responsavel?: 'eu' | 'ninguem';
  cursor?: string;
  /** ≤ 50 */
  limite?: number;
}

export interface ResponsavelCaso {
  id: string;
  nome: string;
}

export interface CasoListaItem {
  id: string;
  symbol: string;
  classe: ClasseQuadro;
  /** GrupoConferencia | 'outro' */
  grupo: string;
  campo: string;
  periodo: string | null;
  origem: OrigemCaso;
  regraCodigo: string | null;
  /** a regra disparou no último run (false = 'regra deixou de disparar') */
  regraAtiva: boolean;
  status: StatusCaso;
  /** regra bloqueante ativa (conf:) */
  emConferencia: boolean;
  /** reservado; sempre false nesta fase (decisão 16) */
  conferenciaManual: boolean;
  nReportes: number;
  slaAte: string | null;
  /** null = sem prazo (caso só de regra) */
  diasUteisRestantes: number | null;
  idadeDiasUteis: number;
  responsavel: ResponsavelCaso | null;
  /** ISO */
  abertoEm: string;
  /** ISO (concorrência otimista: vai em atualizadoEmEsperado) */
  atualizadoEm: string;
}

export interface CasosListaResposta {
  itens: CasoListaItem[];
  contagens: { aberto: number; em_analise: number; venceHoje: number; vencido: number };
  proximoCursor: string | null;
}

export interface ReporteDetalhe {
  id: string;
  protocolo: string;
  autor: { id: string; nome: string; email: string };
  /** consultor agindo: o cliente (registrado, não notificado — decisão 10) */
  cliente: { id: string; nome: string } | null;
  bloco: BlocoReporte;
  campo: CampoReporte;
  periodo: string | null;
  valorExibido: string | null;
  valorEsperado: string | null;
  fonteExibida: string | null;
  frescorExibido: string | null;
  versaoQuadro: string;
  /** texto livre (renderizar como TEXTO); '[removido]' depois de anonimizado */
  mensagem: string;
  fonteEsperada: string | null;
  /** snapshot do servidor (valores da linha, flags, motivos, estadoIndice, dataRef, paramsVersion) */
  contextoServidor: Record<string, unknown>;
  criadoEm: string;
  anonimizado: boolean;
}

export interface EventoCasoDetalhe {
  id: string;
  tipo: TipoEventoCaso;
  autor: { id: string; nome: string } | null;
  de: string | null;
  para: string | null;
  texto: string | null;
  criadoEm: string;
}

export interface CasoDetalheResposta {
  caso: CasoListaItem & {
    cnpj: string | null;
    resolucao: ResolucaoCaso | null;
    efeitoTela: EfeitoTela | null;
    respostaPublica: string | null;
    notaCurador: string | null;
    resolvidoEm: string | null;
    casoAnteriorId: string | null;
  };
  /** o que o usuário viu (1º relato), ou null em caso só de regra */
  oQueUsuarioViu: {
    bloco: BlocoReporte;
    campo: CampoReporte;
    valorExibido: string | null;
    periodo: string | null;
    fonteExibida: string | null;
    frescorExibido: string | null;
  } | null;
  regra: { codigo: string; chave: string | null; ativa: boolean; desde: string | null } | null;
  reportes: ReporteDetalhe[];
  /** valores atuais da linha do Quadro (AnaliseQuadroLinha) para o campo/grupo */
  linhaAtual: Record<string, unknown> | null;
  fontes: Array<{ rotulo: string; url: string }>;
  eventos: EventoCasoDetalhe[];
}

/**
 * PATCH (união discriminada; zod strict). Todos levam atualizadoEmEsperado (ISO do caso lido): se
 * diverge → 409. Transição inválida → 409. Termo proibido na resposta pública → 400 com
 * details.termos. Decisão 16: NÃO há conferenciaManual aqui.
 */
export type CasoPatchBody =
  | { acao: 'assumir' | 'soltar'; atualizadoEmEsperado: string }
  | {
      acao: 'decidir';
      status: StatusCaso;
      /** obrigatória ao fechar e coerente com o status (contrato.resolucaoValida) */
      resolucao?: ResolucaoCaso;
      /** 'liberar_valor' só com rejeitado/dado_confirmado (contrato.efeitoTelaValido) */
      efeitoTela: EfeitoTela;
      /** ≤ 500, varrida por encontrarPalavrasProibidas; enviada ao autor só ao fechar */
      respostaPublica?: string;
      /** ≤ 2000, só interna */
      notaCurador?: string;
      atualizadoEmEsperado: string;
    }
  | { acao: 'nota'; notaCurador: string; atualizadoEmEsperado: string };

export type CasoPatchResposta = CasoDetalheResposta & { notificados: number };

/** 409 do PATCH: quem alterou e quando (a tela mantém o texto digitado e oferece recarregar). */
export interface CasoConflito409 {
  error: string;
  atualizadoEm: string;
  atualizadoPor: { id: string; nome: string } | null;
}

/** Detalhes do job 'curadoria' (ResultadoJob.detalhes). */
export type RelatorioCuradoria = {
  abertos: number;
  atualizados: number;
  autorresolvidos: number;
  regraCessou: number;
  digestEnviados: number;
};

// ===========================================================================
// PROPS dos componentes do bloco C (props FINAIS: mudar = PR na fatia 0)
// ===========================================================================

/** Um dado do bloco, como aparece no "Qual dado?" (rótulo · valor · período). */
export interface DadoBlocoReporte {
  campo: CampoTela;
  /** 'Payout' */
  rotulo: string;
  /** valor formatado como na tela ('52%', '—') */
  valorExibido: string | null;
  /** '2025', 'últ. 12m' */
  periodo: string | null;
}

/** Contexto do bloco que vai junto com o relato (o servidor acrescenta o snapshot). */
export interface ContextoBlocoReporte {
  /** 'Valuation · Múltiplos' */
  rotuloBloco: string;
  /** opções do "Qual dado?" (pode ser [] → só 'outro') */
  dados: DadoBlocoReporte[];
  fonteExibida: string | null;
  frescorExibido: string | null;
  /** versão do Quadro/página */
  versao: string;
}

/**
 * MenuBlocoAtivo (fatia 0, componente FINAL; B o encaixa no slot `acao` de CartaoAnalise e nos
 * cabeçalhos de BlocoKpis/BlocoIndiceSemaforo/BlocoDividendos/GraficoLucroCotacao). Botão ⋯ de
 * 44×44 em todas as larguras; menu de 248px no computador, BottomSheet no celular.
 * Itens: 'Reportar dado incorreto' (só com `reporteHabilitado`) e 'Fonte e atualização' (só com
 * `frescor`). Sem nenhum item, o menu NÃO renderiza (página idêntica à de hoje com flag desligada e
 * params v1).
 */
export interface MenuBlocoAtivoProps {
  ticker: string;
  classe: ClasseQuadro;
  bloco: BlocoReporte;
  contexto: ContextoBlocoReporte;
  /** config.reporteHabilitado */
  reporteHabilitado: boolean;
  /** frescor do bloco; null = sem item 'Fonte e atualização' */
  frescor: FrescorBloco | null;
  className?: string;
}

/** @deprecated nome da spec; use MenuBlocoAtivoProps */
export type MenuBlocoProps = MenuBlocoAtivoProps;

/**
 * BotaoReportarDado (fatia 0 = STUB que devolve null; fatia D implementa o formulário).
 * - variante 'link': renderiza o próprio gatilho ("Tem uma informação sobre isso? Reportar", no fim
 *   do "Por quê?" de um campo em conferência) e abre o formulário;
 * - variante 'controlado': SEM gatilho; o formulário (modal de 560px / sheet de tela cheia) abre
 *   quando `aberto` é true e chama `onFechar` ao fechar. É como o MenuBlocoAtivo o usa: o item do
 *   menu fecha o menu e liga `aberto` (o componente fica montado fora do menu, para o formulário não
 *   desmontar junto com ele).
 * O foco volta ao elemento de origem ao fechar (D).
 */
export interface BotaoReportarDadoProps {
  ticker: string;
  classe: ClasseQuadro;
  bloco: BlocoReporte;
  contexto: ContextoBlocoReporte;
  /** campo pré-escolhido no "Qual dado?" (padrão: o 1º de contexto.dados, ou 'outro') */
  campo?: CampoReporte;
  variante: 'link' | 'controlado';
  /** variante 'controlado' */
  aberto?: boolean;
  /** variante 'controlado' */
  onFechar?: () => void;
  className?: string;
}
