/**
 * CONTRATO DE CURADORIA — bloco C da Análise de Ativos (fatia 0). Funções puras, sem I/O.
 *
 * Fonte: docs/analise-ativos/blocoC/spec-desenho.json (fatia 0 item 4, apis, fluxo_curadoria) +
 * decisoes.md (prevalece). Fatias que usam: C (fila /admin/curadoria, job 'curadoria', decisões do
 * curador) e D (POST /api/analise-ativos/reportes, Meus relatos, LGPD).
 *
 * Caso = ativo × dado: um caso por chaveCaso({symbol, campo, periodo}). Casos de REGRA usam
 * periodo = chave da detecção (curadoria de C: `chaveCaso({symbol, campo: CAMPO_PRINCIPAL, periodo:
 * chave})`). Um relato só se junta a um caso de regra se `campoPertenceAoGrupo(campo, grupo)` (o
 * caso vira 'misto'); senão abre caso próprio.
 *
 * Estados: aberto → em_analise (assumir) → corrigido | rejeitado. Fechado é final (relato novo
 * abre outro caso com casoAnteriorId). A decisão separa o STATUS do EFEITO NA TELA
 * ('manter_conferencia' | 'liberar_valor' | 'sem_efeito'); 'liberar_valor' só com
 * rejeitado/dado_confirmado e vale no próximo cálculo diário (decisão 15).
 * Decisão 16: NÃO existe conferência manual pelo curador nesta fase (a coluna conferenciaManual do
 * schema fica sempre false; nenhuma ação a liga).
 *
 * Limites (decisão 6): 5 relatos/24 h por usuário, 3/h por usuário × ativo, 1 aberto por usuário ×
 * ativo × dado (duplicado NÃO cria: HTTP 409 {error, casoId, reporteId} e a tela leva ao relato
 * existente — decisão 7), 300/24 h no total. Prazo (decisão 14): 5 dias úteis (calendário B3) desde
 * o 1º relato; caso só de regra não tem prazo. Retenção (decisão 19): 12 meses após o fechamento,
 * anonimizando o texto livre.
 */
import { ehPregaoB3 } from '@/services/analiseAtivos/regras/comum/pregoes';
import {
  CAMPOS_TELA,
  DEF_GRUPO,
  ehGrupoConferencia,
  type CampoTela,
  type GrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';

// ===========================================================================
// Estados, transições, resoluções e efeito na tela
// ===========================================================================

export const STATUS_CASO = ['aberto', 'em_analise', 'corrigido', 'rejeitado'] as const;
export type StatusCaso = (typeof STATUS_CASO)[number];

export const STATUS_FECHADOS = ['corrigido', 'rejeitado'] as const;
export type StatusFechado = (typeof STATUS_FECHADOS)[number];

export function ehStatusCaso(s: string): s is StatusCaso {
  return (STATUS_CASO as readonly string[]).includes(s);
}

export function casoFechado(status: string): status is StatusFechado {
  return (STATUS_FECHADOS as readonly string[]).includes(status);
}

/** Transições permitidas. Fechado é final. Assumir = aberto→em_analise; soltar = em_analise→aberto. */
export const TRANSICOES: Record<StatusCaso, readonly StatusCaso[]> = {
  aberto: ['em_analise', 'corrigido', 'rejeitado'],
  em_analise: ['aberto', 'corrigido', 'rejeitado'],
  corrigido: [],
  rejeitado: [],
};

export function podeTransitar(de: StatusCaso, para: StatusCaso): boolean {
  return TRANSICOES[de].includes(para);
}

export const RESOLUCOES = {
  corrigido: ['corrigido_fonte', 'corrigido_reprocessado', 'fonte_corrigiu'],
  rejeitado: ['dado_confirmado', 'sem_procedencia', 'duplicado'],
} as const satisfies Record<StatusFechado, readonly string[]>;

export type ResolucaoCorrigido = (typeof RESOLUCOES.corrigido)[number];
export type ResolucaoRejeitado = (typeof RESOLUCOES.rejeitado)[number];
export type ResolucaoCaso = ResolucaoCorrigido | ResolucaoRejeitado;

export const TODAS_RESOLUCOES: readonly ResolucaoCaso[] = [
  ...RESOLUCOES.corrigido,
  ...RESOLUCOES.rejeitado,
];

/** Resolução obrigatória ao fechar e coerente com o status. */
export function resolucaoValida(status: StatusFechado, resolucao: string | null | undefined) {
  return !!resolucao && (RESOLUCOES[status] as readonly string[]).includes(resolucao);
}

export const EFEITOS_TELA = ['manter_conferencia', 'liberar_valor', 'sem_efeito'] as const;
export type EfeitoTela = (typeof EFEITOS_TELA)[number];

/**
 * Coerência do efeito na tela com a decisão: 'liberar_valor' só com rejeitado/dado_confirmado (a
 * regra deixa de marcar aquela chave a partir do próximo cálculo diário).
 */
export function efeitoTelaValido(
  status: StatusCaso,
  resolucao: string | null | undefined,
  efeito: EfeitoTela,
): boolean {
  if (efeito !== 'liberar_valor') return true;
  return status === 'rejeitado' && resolucao === 'dado_confirmado';
}

/** Liberação lida pelo motor (fatia A): caso fechado com efeito 'liberar_valor'. */
export function ehLiberacao(c: {
  status: string;
  resolucao: string | null;
  efeitoTela: string | null;
}): boolean {
  return (
    c.status === 'rejeitado' &&
    c.resolucao === 'dado_confirmado' &&
    c.efeitoTela === 'liberar_valor'
  );
}

export const ORIGENS_CASO = ['usuario', 'regra', 'misto'] as const;
export type OrigemCaso = (typeof ORIGENS_CASO)[number];

export const TIPOS_EVENTO_CASO = [
  'aberto',
  'reporte',
  'regra_disparou',
  'regra_cessou',
  'assumido',
  'solto',
  'decisao',
  'nota',
  'notificado',
  'anonimizado',
] as const;
export type TipoEventoCaso = (typeof TIPOS_EVENTO_CASO)[number];

/** Status como o USUÁRIO vê (decisão 11: rejeitado = "Conferido, sem alteração"). */
export type StatusParaUsuario = 'aberto' | 'em_analise' | 'corrigido' | 'conferido_sem_alteracao';

export function statusParaUsuario(status: StatusCaso): StatusParaUsuario {
  return status === 'rejeitado' ? 'conferido_sem_alteracao' : status;
}

// ===========================================================================
// Blocos e campos reportáveis
// ===========================================================================

/** Blocos da página do ativo com menu ⋯ (carteira, tese e educação NÃO têm menu). */
export const BLOCOS_REPORTE = [
  'cabecalho',
  'indice',
  'criterios',
  'kpis',
  'grafico',
  'dividendos',
  'fundamentos',
  'valuation',
  'historicos',
  'pares',
  'eventos',
] as const;
export type BlocoReporte = (typeof BLOCOS_REPORTE)[number];

export const BLOCOS_SEM_MENU = ['carteira', 'tese', 'educacao'] as const;

export function ehBlocoReporte(s: string): s is BlocoReporte {
  return (BLOCOS_REPORTE as readonly string[]).includes(s);
}

/** Campo genérico ("outro dado deste bloco"), aceito em qualquer bloco. */
export const CAMPO_OUTRO = 'outro';
export type CampoReporte = CampoTela | typeof CAMPO_OUTRO;

/** Campos que o "Qual dado?" oferece em cada bloco (+ 'outro' em todos). */
export const CAMPOS_REPORTAVEIS: Record<BlocoReporte, readonly CampoTela[]> = {
  cabecalho: ['preco', 'valorMercado'],
  indice: ['indiceMf'],
  criterios: ['criterioSemaforo'],
  kpis: [
    'pl',
    'pvp',
    'dy12m',
    'roe',
    'margemLiquida',
    'divLiqEbitda',
    'payout',
    'valorMercado',
    'rendCota12m',
    'vpCota',
    'obrigacoesPl',
    'vacanciaCvm',
    'cotistas',
    'patrimonio',
    'liquidez21',
    'anosLucroConsecutivos',
    'mesesComRendimento',
  ],
  grafico: ['lpa', 'vpCota', 'preco'],
  dividendos: ['proventosAno', 'dpa12m', 'rendCota12m', 'dy12m'],
  fundamentos: [
    'receita',
    'lucroLiquido',
    'margemLiquida',
    'roe',
    'lpa',
    'proventosAno',
    'payout',
    'pl',
    'pvp',
    'dy12m',
    'rendCota12m',
    'vpCota',
    'vacanciaCvm',
    'nImoveisCvm',
    'nCri',
    'patrimonioLiquido',
    'ativoTotal',
  ],
  valuation: [
    'pl',
    'pvp',
    'pReceita',
    'evEbitda',
    'pFco',
    'pFcl',
    'lpa',
    'vpa',
    'dpa12m',
    'dy12m',
    'dyMedio5a',
    'payout',
    'margemLiquida',
    'roe',
    'divLiqEbitda',
    'divLiqPl',
    'vpCota',
    'rendCota12m',
    'vacanciaCvm',
    'obrigacoesPl',
    'taxaAdm',
    'liquidez21',
    'valorMercado',
    'nAcoes',
  ],
  historicos: ['historicoPl', 'historicoPvp', 'historicoPReceita', 'historicoDy'],
  pares: [],
  eventos: ['dataEvento'],
};

/** O campo pode ser reportado a partir do bloco ('outro' vale em todos). */
export function campoReportavel(bloco: BlocoReporte, campo: string): campo is CampoReporte {
  return campo === CAMPO_OUTRO || (CAMPOS_REPORTAVEIS[bloco] as readonly string[]).includes(campo);
}

/** Todo campo listado em CAMPOS_REPORTAVEIS existe em CAMPOS_TELA (conferido no teste). */
export function camposReportaveisValidos(): boolean {
  return Object.values(CAMPOS_REPORTAVEIS).every((cs) =>
    cs.every((c) => (CAMPOS_TELA as readonly string[]).includes(c)),
  );
}

/**
 * O relato se junta a um caso de REGRA só se o campo é do grupo da regra (DEF_GRUPO.campos ou o
 * campo principal). Grupo 'outro' (caso de usuário/revisão sem grupo) e campo 'outro' nunca.
 */
export function campoPertenceAoGrupo(campo: string, grupo: string): boolean {
  if (campo === CAMPO_OUTRO || !ehGrupoConferencia(grupo)) return false;
  const def = DEF_GRUPO[grupo as GrupoConferencia];
  return campo === def.campoPrincipal || Object.prototype.hasOwnProperty.call(def.campos, campo);
}

/**
 * Chave do caso aberto (coluna única chaveAberta; null ao fechar): 'SYMBOL|campo|periodo'.
 * Symbol em maiúsculas, periodo aparado ('' quando ausente). Caso de regra: periodo = chave da
 * detecção.
 */
export function chaveCaso(c: { symbol: string; campo: string; periodo?: string | null }): string {
  const symbol = c.symbol.trim().toUpperCase();
  const periodo = (c.periodo ?? '').trim();
  return `${symbol}|${c.campo}|${periodo}`;
}

// ===========================================================================
// Limites
// ===========================================================================

export const LIMITES = {
  mensagemMin: 10,
  mensagemMax: 1000,
  /** decisão 8: "Valor que você esperava" até 40 caracteres (a coluna é VarChar(64)) */
  valorEsperado: 40,
  fonteEsperada: 300,
  valorExibido: 64,
  periodo: 32,
  fonteExibida: 160,
  frescorExibido: 160,
  versao: 40,
  /** relatos por usuário em 24 h */
  porDia: 5,
  /** relatos por usuário × ativo em 1 h */
  porHoraAtivo: 3,
  /** relatos no total em 24 h (proteção contra abuso coordenado) */
  globalDia: 300,
  /** relatos ABERTOS por usuário × ativo × dado (duplicado responde 409) */
  abertosPorDado: 1,
  respostaPublica: 500,
  notaCurador: 2000,
  /** tier por IP (rateLimit.ts, fatia D) só em /api/analise-ativos/reportes */
  ipPorMinuto: 10,
} as const;

/** Código HTTP do relato duplicado (decisão 7; corpo ReporteConflito409). */
export const HTTP_REPORTE_DUPLICADO = 409;

/** Retenção (decisão 19): texto livre anonimizado 12 meses após o fechamento. */
export const RETENCAO_MESES_APOS_FECHAR = 12;
export const TEXTO_ANONIMIZADO = '[removido]';

// ===========================================================================
// Prazo (SLA) em dias úteis — calendário de pregões da B3 (regras/comum/pregoes)
// ===========================================================================

export const SLA_DIAS_UTEIS = 5;
/** "vencendo" no digest e nos contadores: até 2 dias úteis */
export const SLA_ALERTA_DIAS_UTEIS = 2;
/** caso só de regra: alerta de idade depois disto (sem prazo) */
export const IDADE_ALERTA_REGRA_DIAS_UTEIS = 10;

const DIA_MS = 24 * 60 * 60 * 1000;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil (AAAA-MM-DD) de um instante no fuso de São Paulo. */
export function dataCivilSaoPaulo(d: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return partes.slice(0, 10);
}

function paraCivil(d: Date | string): string {
  if (typeof d !== 'string') return dataCivilSaoPaulo(d);
  if (!RE_DATA.test(d)) throw new Error(`Data inválida (esperado AAAA-MM-DD): ${d}`);
  return d;
}

function somarDias(data: string, n: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** Dias úteis em (de, ate] (0 se ate ≤ de). */
function diasUteisEntre(de: string, ate: string): number {
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) if (ehPregaoB3(d)) n += 1;
  return n;
}

/**
 * Prazo: o `dias`-ésimo dia útil DEPOIS da data do 1º relato (o dia do relato não conta). Relato
 * na sexta 09/10/2026 → 12/10 é feriado → 13, 14, 15, 16, 19 → prazo 19/10/2026.
 */
export function slaAte(inicio: Date | string, dias: number = SLA_DIAS_UTEIS): string {
  let d = paraCivil(inicio);
  let faltam = dias;
  while (faltam > 0) {
    d = somarDias(d, 1);
    if (ehPregaoB3(d)) faltam -= 1;
  }
  return d;
}

/**
 * Dias úteis até o prazo: 0 = vence hoje; > 0 = faltam N; < 0 = vencido há N dias úteis. Depois do
 * prazo é sempre ≤ -1, mesmo num fim de semana logo após (não pode parecer "vence hoje").
 */
export function diasUteisRestantes(prazo: string, hoje: Date | string): number {
  const h = paraCivil(hoje);
  const p = paraCivil(prazo);
  if (h === p) return 0;
  if (h < p) return diasUteisEntre(h, p);
  return -Math.max(1, diasUteisEntre(p, h));
}

/** Idade do caso em dias úteis desde a abertura. */
export function idadeDiasUteis(abertoEm: Date | string, hoje: Date | string): number {
  return diasUteisEntre(paraCivil(abertoEm), paraCivil(hoje));
}

export type SituacaoPrazo = 'sem_prazo' | 'no_prazo' | 'vencendo' | 'vence_hoje' | 'vencido';

/** Situação do prazo para a fila (contadores 'venceHoje' e 'vencido') e o digest. */
export function situacaoPrazo(prazo: string | null, hoje: Date | string): SituacaoPrazo {
  if (!prazo) return 'sem_prazo';
  const r = diasUteisRestantes(prazo, hoje);
  if (r < 0) return 'vencido';
  if (r === 0) return 'vence_hoje';
  return r <= SLA_ALERTA_DIAS_UTEIS ? 'vencendo' : 'no_prazo';
}

// ===========================================================================
// Texto livre
// ===========================================================================

/**
 * Controle (\p{Cc}) exceto \n e \t; bidi (U+202A–U+202E, U+2066–U+2069, U+061C); zero-width e
 * invisíveis (U+200B–U+200F, U+2060–U+2064, U+FEFF) e hífen suave (U+00AD). Escritos como escapes
 * \uXXXX de propósito: caractere invisível literal no código-fonte é armadilha ("trojan source").
 */
const RE_REMOVER =
  /(?![\n\t])[\p{Cc}]|[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u2060-\u2064\u061C\uFEFF\u00AD]/gu;

/**
 * Saneia texto livre do usuário ANTES da validação de tamanho: NFC; CRLF/CR → LF; remove controle,
 * bidi, zero-width e hífen suave; colapsa espaços/tabs repetidos e ≥ 3 quebras; apara cada linha e
 * o todo. Devolve também quantos caracteres invisíveis foram removidos (log/teste).
 */
export function sanearTextoLivreComContagem(s: string): { texto: string; removidos: number } {
  const nfc = s.normalize('NFC').replace(/\r\n?/g, '\n');
  let removidos = 0;
  const limpo = nfc.replace(RE_REMOVER, () => {
    removidos += 1;
    return '';
  });
  const texto = limpo
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { texto, removidos };
}

export function sanearTextoLivre(s: string): string {
  return sanearTextoLivreComContagem(s).texto;
}

/** Texto com cara de HTML/markup (rejeitado com 400; nunca é renderizado como HTML). */
export function contemHtml(s: string): boolean {
  return /<[a-zA-Z/!?]/.test(s);
}

// ===========================================================================
// Protocolo e notificações
// ===========================================================================

/** Alfabeto do protocolo: sem 0/O, 1/I/L (ditado por telefone/suporte). */
const ALFABETO_PROTOCOLO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TAMANHO_PROTOCOLO = 8;

/** Protocolo de 8 caracteres (único no banco; colisão → nova tentativa na fatia D). */
export function gerarProtocolo(
  aleatorio: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = aleatorio(TAMANHO_PROTOCOLO);
  let out = '';
  for (let i = 0; i < TAMANHO_PROTOCOLO; i += 1) {
    out += ALFABETO_PROTOCOLO[bytes[i] % ALFABETO_PROTOCOLO.length];
  }
  return out;
}

export function protocoloValido(s: string): boolean {
  return new RegExp(`^[${ALFABETO_PROTOCOLO}]{${TAMANHO_PROTOCOLO}}$`).test(s);
}

/** Notification.type do bloco C. */
export const TIPOS_NOTIFICACAO = {
  /** admins: caso novo de usuário (href /admin/curadoria/<id>) */
  novoCaso: 'analise_ativos_reporte',
  /** autor: relato respondido ao fechar (href /analise-ativos/<TICKER>?relatos=1) */
  resposta: 'analise_ativos_reporte_resposta',
  /** admins: resumo diário de prazos (vencidos e vencendo em ≤ 2 dias úteis) */
  sla: 'analise_ativos_curadoria_sla',
} as const;

/** Rotas de tela do bloco C. */
export const ROTAS_CURADORIA = {
  fila: '/admin/curadoria',
  caso: (id: string) => `/admin/curadoria/${encodeURIComponent(id)}`,
  meusRelatos: '/analise-ativos/meus-relatos',
  ativoComRelatos: (ticker: string) =>
    `/analise-ativos/${encodeURIComponent(ticker.toUpperCase())}?relatos=1`,
} as const;
