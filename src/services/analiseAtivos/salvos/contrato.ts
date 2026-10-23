/**
 * Contrato COMPARTILHADO do bloco 1 (fatia 0): Salvos, filtros salvos, comparações salvas, PDF do
 * Comparador e avisos das listas. Puro e isomórfico (servidor e cliente). Mudança aqui = PR na
 * fatia 0. Tipos: src/types/analiseAtivosSalvos.ts.
 *
 * - LIMITES_SALVOS: conferidos NO SERVIDOR (fatia A) dentro de prisma.$transaction com
 *   pg_advisory_xact_lock(hashtext(userId)); excedeu ⇒ 409; devolvidos em `limites` para a cópia
 *   "n de {limite}".
 * - Nomes: normalizarNome (trim + espaços colapsados, o que é gravado/mostrado) e nomeNormalizado
 *   (minúsculas e sem acento, a unicidade por usuário).
 * - Ticker por classe: TICKER_RE_POR_CLASSE (ação/FII = TICKER_RE dos cenários; stock/reit
 *   reservados para o bloco 4). A rota confere também que o ticker está no Quadro (obterLinhaQuadro)
 *   e a classe vem da linha.
 * - Regra do clique em Salvar (decisão 5 do Wellington): 0 listas → cria NOME_LISTA_PADRAO
 *   ('Salvos') com o ativo; 1 → alterna nela; 2+ → "Salvar em…". No PUT /salvos/[ticker] o
 *   SENTINELA_PADRAO (['padrao']) só resolve com 0 ou 1 lista (resolverSentinelaPadrao); com 2+ dá
 *   400. O "Abrir comparador" do modal Comparar continua sem gravar.
 * - Tudo PESSOAL (decisão 1): consultor agindo → GET vazio + podeSalvar=false; mutações 403 com
 *   MENSAGEM_LISTAS_PESSOAIS. PDF liberado (sem dado pessoal).
 * - Avisos: ANALISE_SALVOS_ALERTA_TYPE nas Notification; TIPOS_AVISO; RETENCAO_AVISOS_DIAS (job,
 *   export e lgpd-retention); JANELA_AVISO_CRITERIOS fixa em 5; MAX_AVISOS_POR_RODADA (acima disso,
 *   1 resumo).
 * - Stocks e REITs (feature EUA, fatia D): ClasseSalvoSchema e TickerSalvoSchema aceitam stock|reit
 *   e o ticker EUA (BRK.B; BRK-B vira BRK.B) SÓ com ANALISE_ATIVOS_EUA_HABILITADO (lida na hora da
 *   validação, no servidor). Desligada, o Brasil é o de antes.
 */
import { z } from 'zod';
import { TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';
import { analiseAtivosEuaHabilitado } from '@/lib/analiseAtivosConfig';
import {
  CLASSES_QUADRO,
  ehClasseEua,
  type ClasseQuadro,
  type TipoFiiExibido,
} from '@/types/analiseAtivosApi';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';
import {
  IDS_CRITERIO,
  JANELAS_CRITERIOS,
  JANELA_PADRAO,
  type IdCriterio,
  type Janela,
} from '@/types/analiseAtivosCriterios';
import type {
  AlertasLidosBody,
  AlertasLista,
  ClasseItemReservada,
  ComparacaoPatchBody,
  ComparacaoPostBody,
  EstadoFiltroSalvoV1,
  FiltroPatchBody,
  FiltroPostBody,
  ItemPostBody,
  LimitesSalvos,
  ListaPatchBody,
  ListaPostBody,
  SalvosPutBody,
  TipoAviso,
} from '@/types/analiseAtivosSalvos';

// ---------------------------------------------------------------------------
// Limites e constantes
// ---------------------------------------------------------------------------

export const MAX_NOME = 40;
export const MAX_LISTAS_POR_USUARIO = 20;
export const MAX_ITENS_POR_LISTA = 200;
export const MAX_ITENS_POR_USUARIO = 500;
export const MAX_FILTROS_POR_CLASSE = 20;
export const MAX_COMPARACOES_POR_USUARIO = 30;
export const MAX_PDF_POR_HORA = 10;
/** Tickers por comparação (= MAX_ATIVOS_COMPARADOR do Bloco D, decisão 12). */
export const MAX_TICKERS_COMPARACAO = 4;
/** ids por POST /alertas/lidos (o resto: sem ids = todos). */
export const MAX_IDS_LIDOS = 500;

export const LIMITES_SALVOS: LimitesSalvos = Object.freeze({
  nome: MAX_NOME,
  listas: MAX_LISTAS_POR_USUARIO,
  itensPorLista: MAX_ITENS_POR_LISTA,
  itensPorUsuario: MAX_ITENS_POR_USUARIO,
  filtrosPorClasse: MAX_FILTROS_POR_CLASSE,
  comparacoes: MAX_COMPARACOES_POR_USUARIO,
  pdfPorHora: MAX_PDF_POR_HORA,
});

/** Nome da 1ª lista, criada pelo 1º Salvar (texto do Pedro, D1). */
export const NOME_LISTA_PADRAO = 'Salvos';
/** Sentinela do PUT /salvos/[ticker]: ['padrao'] (0 listas → cria 'Salvos'; 1 → essa; 2+ → 400). */
export const SENTINELA_PADRAO = 'padrao';

/** Mensagem das mutações no modo consultor (403) — mesma do title dos botões desabilitados. */
export const MENSAGEM_LISTAS_PESSOAIS = 'As listas são pessoais';

/** Avisos padrão de uma lista nova: resultado e provento ligados, critérios desligado. */
export const ALERTAS_PADRAO_LISTA: Readonly<AlertasLista> = Object.freeze({
  resultado: true,
  provento: true,
  criterios: false,
});

/** type das Notification dos avisos das listas (sino, aba Alertas, push 'analise', LGPD). */
export const ANALISE_SALVOS_ALERTA_TYPE = 'analise_ativos_salvos_alerta';
export const TIPOS_AVISO: readonly TipoAviso[] = ['resultado', 'provento', 'criterios', 'resumo'];
/** Retenção ÚNICA dos avisos (job, export, lgpd-retention e o texto da tela). */
export const RETENCAO_AVISOS_DIAS = 90;
/** Janela FIXA do aviso de mudança no "n de 6". */
export const JANELA_AVISO_CRITERIOS: Janela = 5;
/** Mais do que isso no dia para um usuário ⇒ 1 resumo "Novidades em N ativos dos seus Salvos". */
export const MAX_AVISOS_POR_RODADA = 5;
/** tipo do marco dos critérios em analise_alerta_marcos */
export const MARCO_CRITERIOS = `criterios:${JANELA_AVISO_CRITERIOS}`;
export const MARCO_FII_TRIMESTRAL = 'fii_trimestral';

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

/** Parâmetro opcional do Quadro: ?filtro=<id> (filtro salvo aplicado; useEstadoQuadroUrl). */
export const PARAM_FILTRO_SALVO = 'filtro';

export const ROTAS_SALVOS = {
  /** página Salvos (fatia C) */
  pagina: '/analise-ativos/salvos',
  /** página Salvos já numa lista */
  paginaLista: (listaId: string, classe?: ClasseQuadro): string =>
    `/analise-ativos/salvos?lista=${enc(listaId)}${classe && classe !== 'acao' ? `&classe=${classe}` : ''}`,
  /** aba Alertas (destino do resumo e de "Ver todos os alertas") */
  paginaAlertas: '/analise-ativos/salvos?aba=alertas',
  api: {
    listas: '/api/analise-ativos/listas',
    lista: (id: string): string => `/api/analise-ativos/listas/${enc(id)}`,
    itens: (id: string): string => `/api/analise-ativos/listas/${enc(id)}/itens`,
    item: (id: string, ticker: string): string =>
      `/api/analise-ativos/listas/${enc(id)}/itens/${enc(ticker)}`,
    salvos: '/api/analise-ativos/salvos',
    salvo: (ticker: string): string => `/api/analise-ativos/salvos/${enc(ticker)}`,
    filtros: '/api/analise-ativos/filtros',
    filtro: (id: string): string => `/api/analise-ativos/filtros/${enc(id)}`,
    comparacoes: '/api/analise-ativos/comparacoes',
    comparacao: (id: string): string => `/api/analise-ativos/comparacoes/${enc(id)}`,
    comparacaoPdf: '/api/analise-ativos/comparacao-pdf',
    alertas: '/api/analise-ativos/alertas',
    alertasLidos: '/api/analise-ativos/alertas/lidos',
    cronAlertas: '/api/cron/analise-ativos/alertas-salvos',
  },
} as const;

/** Link do Comparador de uma comparação salva (tipo só com FII). */
export function hrefComparacao(
  tickers: readonly string[],
  janela: number,
  tipoFii?: TipoFiiExibido | null,
): string {
  const qs = new URLSearchParams();
  qs.set('t', tickers.join(','));
  if (janela !== JANELA_PADRAO) qs.set('janela', String(janela));
  if (tipoFii) qs.set('tipo', tipoFii);
  return `/analise-ativos/comparador?${qs.toString().replace(/%2C/g, ',')}`;
}

/** URL da rota do PDF (mesmos parâmetros do /comparador + tipo). */
export function urlPdfComparacao(
  tickers: readonly string[],
  janela?: number,
  tipoFii?: TipoFiiExibido | null,
): string {
  const qs = new URLSearchParams();
  qs.set('t', tickers.join(','));
  if (janela !== undefined && janela !== JANELA_PADRAO) qs.set('janela', String(janela));
  if (tipoFii) qs.set('tipo', tipoFii);
  return `${ROTAS_SALVOS.api.comparacaoPdf}?${qs.toString().replace(/%2C/g, ',')}`;
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

/** O que é gravado e mostrado: trim + espaços (inclusive quebras) colapsados num só. */
export function normalizarNome(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim();
}

/** Chave de unicidade por usuário: normalizarNome + minúsculas + sem acento. */
export function nomeNormalizado(nome: string): string {
  return normalizarNome(nome).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Nome padrão de uma comparação: "WEGE3 · ITUB4 · BBAS3" (cortado em MAX_NOME). */
export function nomePadraoComparacao(tickers: readonly string[]): string {
  return tickers.join(' · ').slice(0, MAX_NOME).trim();
}

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------

/** Ticker por classe. stock/reit só valem com ANALISE_ATIVOS_EUA_HABILITADO (classesSalvosLigadas). */
export const TICKER_RE_POR_CLASSE: Readonly<Record<ClasseItemReservada, RegExp>> = Object.freeze({
  acao: TICKER_RE,
  fii: TICKER_RE,
  stock: /^[A-Z]{1,5}(\.[A-Z])?$/,
  reit: /^[A-Z]{1,5}(\.[A-Z])?$/,
});

/** Classes aceitas pelo zod do bloco 1 (Brasil). */
export const CLASSES_SALVOS = ['acao', 'fii'] as const satisfies readonly ClasseQuadro[];

/** Classes aceitas agora: as do Brasil e, com ANALISE_ATIVOS_EUA_HABILITADO, stock e reit. */
export function classesSalvosLigadas(): readonly ClasseQuadro[] {
  return analiseAtivosEuaHabilitado() ? CLASSES_QUADRO : CLASSES_SALVOS;
}

/** trim + maiúsculas (o que a rota compara); ticker EUA com hífen da SEC vira a forma com ponto. */
export function normalizarTicker(bruto: string): string {
  const t = bruto.trim().toUpperCase();
  return ehTickerEua(t) ? symbolAnaliseDaSec(t) : t;
}

/** true se o ticker tem o formato da classe (ou de alguma classe ligada, sem classe). */
export function ehTickerValido(ticker: string, classe?: ClasseItemReservada): boolean {
  if (classe) {
    if (ehClasseEua(classe) && !analiseAtivosEuaHabilitado()) return false;
    return TICKER_RE_POR_CLASSE[classe].test(ticker);
  }
  return classesSalvosLigadas().some((c) => TICKER_RE_POR_CLASSE[c].test(ticker));
}

// ---------------------------------------------------------------------------
// Regra do Salvar
// ---------------------------------------------------------------------------

/** O que o clique em Salvar faz, pelo número de listas (fatia B: cabeçalho, linha e cartão). */
export type AcaoDoSalvar = 'criarPadrao' | 'alternar' | 'escolher';

export function acaoDoSalvar(totalListas: number): AcaoDoSalvar {
  if (totalListas <= 0) return 'criarPadrao';
  if (totalListas === 1) return 'alternar';
  return 'escolher';
}

/**
 * Resolução do sentinela 'padrao' NO SERVIDOR (fatia A, dentro da transação com advisory lock):
 * 0 listas → criar NOME_LISTA_PADRAO; 1 → usar a única; 2+ → 400 (o cliente manda o conjunto).
 */
export type ResolucaoSentinela =
  | { acao: 'criar'; nome: string }
  | { acao: 'usar'; listaId: string }
  | { acao: 'invalido' };

export function resolverSentinelaPadrao(listaIdsDoUsuario: readonly string[]): ResolucaoSentinela {
  if (listaIdsDoUsuario.length === 0) return { acao: 'criar', nome: NOME_LISTA_PADRAO };
  if (listaIdsDoUsuario.length === 1) return { acao: 'usar', listaId: listaIdsDoUsuario[0] };
  return { acao: 'invalido' };
}

// ---------------------------------------------------------------------------
// Comparações e PDF
// ---------------------------------------------------------------------------

/**
 * Chave de dedupe da comparação: tickers ORDENADOS + ':' + janela + ':' + (tipoFii ?? '-').
 * Estável à ordem dos slots; salvar de novo a mesma combinação atualiza (200).
 */
export function chaveComparacao(
  tickers: readonly string[],
  janela: number,
  tipoFii?: TipoFiiExibido | null,
): string {
  const ordenados = [...new Set(tickers.map(normalizarTicker))].sort();
  return `${ordenados.join(',')}:${janela}:${tipoFii ?? '-'}`;
}

/** 'AAAA-MM-DD' de uma data (UTC) — dataIso(new Date()) no servidor. */
export function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Nome do PDF: comparacao-<acoes|fiis>-<T1>-<T2>…-AAAA-MM-DD.pdf (`data` em AAAA-MM-DD). O
 * servidor manda no Content-Disposition; o hook usa como fallback.
 */
export function nomeArquivoPdf(
  classe: ClasseQuadro,
  tickers: readonly string[],
  data: string,
): string {
  const rotulo = classe === 'fii' ? 'fiis' : 'acoes';
  const ts = tickers.map((t) => normalizarTicker(t).replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  return `comparacao-${rotulo}-${ts.join('-')}-${data}.pdf`;
}

// ---------------------------------------------------------------------------
// zod — bodies (todos strict: campo extra ⇒ 400)
// ---------------------------------------------------------------------------

const SEM_CONTROLE = /^[^\p{Cc}]*$/u;

/** Nome de lista/filtro/comparação: normalizado e com 1..MAX_NOME caracteres. */
export const NomeSchema = z
  .string()
  .max(MAX_NOME * 4)
  .transform(normalizarNome)
  .pipe(
    z
      .string()
      .min(1, 'Dê um nome.')
      .max(MAX_NOME, `Use até ${MAX_NOME} caracteres.`)
      .regex(SEM_CONTROLE, 'Nome inválido'),
  );

/**
 * Ticker de ação/FII (maiúsculo) e, com ANALISE_ATIVOS_EUA_HABILITADO, de stock/REIT (BRK.B). A
 * rota confere que está no Quadro.
 */
export const TickerSalvoSchema = z
  .string()
  .max(12)
  .transform(normalizarTicker)
  .pipe(z.string().refine((t) => ehTickerValido(t), 'Ticker inválido'));

/** acao | fii; stock | reit só com ANALISE_ATIVOS_EUA_HABILITADO (desligada → 400). */
export const ClasseSalvoSchema = z
  .enum(CLASSES_QUADRO)
  .refine((c) => classesSalvosLigadas().includes(c), 'Classe inválida');
const JanelaSchema = z.union(
  JANELAS_CRITERIOS.map((j) => z.literal(j)) as [
    z.ZodLiteral<3>,
    z.ZodLiteral<5>,
    z.ZodLiteral<10>,
  ],
);
const IdListaSchema = z.uuid();

export const AlertasListaSchema = z
  .strictObject({
    resultado: z.boolean().optional(),
    provento: z.boolean().optional(),
    criterios: z.boolean().optional(),
  })
  .refine((a) => Object.keys(a).length > 0, 'Informe ao menos um aviso');

export const ListaPostSchema = z.strictObject({
  nome: NomeSchema,
  tickerInicial: TickerSalvoSchema.optional(),
  alertas: AlertasListaSchema.optional(),
});

export const ListaPatchSchema = z
  .strictObject({
    nome: NomeSchema.optional(),
    alertas: AlertasListaSchema.optional(),
  })
  .refine((b) => b.nome !== undefined || b.alertas !== undefined, 'Nada para alterar');

export const ItemPostSchema = z.strictObject({ ticker: TickerSalvoSchema });

/**
 * PUT /salvos/[ticker]: ids únicos (até MAX_LISTAS_POR_USUARIO) OU exatamente ['padrao'].
 * [] = remove de todas. 'padrao' misturado com ids ⇒ 400.
 */
export const SalvosPutSchema = z.strictObject({
  listaIds: z
    .array(z.union([z.literal(SENTINELA_PADRAO), IdListaSchema]))
    .max(MAX_LISTAS_POR_USUARIO)
    .refine((ids) => new Set(ids).size === ids.length, 'Listas repetidas')
    .refine((ids) => !ids.includes(SENTINELA_PADRAO) || ids.length === 1, "'padrao' vai sozinho"),
});

/** true quando o corpo do PUT é o sentinela ['padrao']. */
export function ehSentinelaPadrao(listaIds: readonly string[]): boolean {
  return listaIds.length === 1 && listaIds[0] === SENTINELA_PADRAO;
}

const SetorSchema = z
  .string()
  .transform(normalizarNome)
  .pipe(z.string().min(1).max(120).regex(SEM_CONTROLE))
  .nullable();

/** EstadoFiltroSalvoV1 (versaoSchema 1): só janela, critérios, setor e na carteira. */
export const EstadoFiltroSalvoV1Schema = z.strictObject({
  janela: JanelaSchema,
  criterios: z
    .array(z.enum(IDS_CRITERIO))
    .max(IDS_CRITERIO.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Critérios repetidos'),
  naCarteira: z.boolean(),
  setor: SetorSchema,
});
export const VERSAO_SCHEMA_FILTRO = 1;

export const FiltroPostSchema = z.strictObject({
  nome: NomeSchema,
  classe: ClasseSalvoSchema,
  estado: EstadoFiltroSalvoV1Schema,
});

export const FiltroPatchSchema = z
  .strictObject({
    nome: NomeSchema.optional(),
    estado: EstadoFiltroSalvoV1Schema.optional(),
    usado: z.literal(true).optional(),
  })
  .refine(
    (b) => b.nome !== undefined || b.estado !== undefined || b.usado !== undefined,
    'Nada para alterar',
  );

/**
 * Lê o estado gravado de um filtro (Json do banco): critérios que deixaram de existir em
 * `idsDaClasse` são retirados e `ajustado` vira true. Estado ilegível ⇒ null (a fatia A descarta).
 */
export function lerEstadoFiltroSalvo(
  bruto: unknown,
  idsDaClasse: readonly IdCriterio[],
): { estado: EstadoFiltroSalvoV1; ajustado: boolean } | null {
  const r = EstadoFiltroSalvoV1Schema.safeParse(bruto);
  if (!r.success) return null;
  const validos = new Set(idsDaClasse);
  const criterios = r.data.criterios.filter((id) => validos.has(id));
  return {
    estado: { ...r.data, criterios },
    ajustado: criterios.length !== r.data.criterios.length,
  };
}

export const TipoFiiSchema = z.enum(['tijolo', 'papel']);

export const ComparacaoPostSchema = z
  .strictObject({
    classe: ClasseSalvoSchema,
    tickers: z
      .array(TickerSalvoSchema)
      .min(1)
      .max(MAX_TICKERS_COMPARACAO)
      .refine((ts) => new Set(ts).size === ts.length, 'Tickers repetidos'),
    janela: JanelaSchema,
    tipoFii: TipoFiiSchema.nullable().optional(),
    nome: NomeSchema.optional(),
  })
  .refine((b) => b.classe === 'fii' || !b.tipoFii, 'tipoFii só em FIIs');

export const ComparacaoPatchSchema = z.strictObject({ nome: NomeSchema });

export const AlertasLidosSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(MAX_IDS_LIDOS).optional(),
});

// ---------------------------------------------------------------------------
// zod — query strings (valores de URLSearchParams; ausente = undefined)
// ---------------------------------------------------------------------------

const janelaQuery = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number)
  .pipe(JanelaSchema);

/** ?classe=acao|fii (obrigatória) — GET /filtros. */
export const ClasseQuerySchema = z.strictObject({ classe: ClasseSalvoSchema });

/** ?classe= opcional — GET /comparacoes. */
export const ComparacoesQuerySchema = z.strictObject({ classe: ClasseSalvoSchema.optional() });

const ORDENS_QUADRO = [
  'ticker',
  'criterios',
  'lucro10',
  'preco',
  'anosLucro',
  'mesesRendimento',
  'roe',
  'pl',
  'pvp',
  'dy',
  'margem',
  'divLiqEbitda',
  'payout',
  'vacancia',
  'valorMercado',
  'patrimonio',
  'liquidez',
  'obrigacoesPl',
  'cotistas',
  'setor',
  'tipo',
  'segmento',
  'imoveis',
  'naCarteira',
] as const;

/** GET /listas/[id]: o zod do Quadro sem os filtros de critério (classe obrigatória). */
export const LinhasListaQuerySchema = z.strictObject({
  classe: ClasseSalvoSchema,
  janela: janelaQuery.optional(),
  ordem: z.enum(ORDENS_QUADRO).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  modo: z.enum(['resumo', 'detalhado']).optional(),
});

/** GET /alertas?classe=&dias= (dias 1..90, padrão 90). */
export const AlertasQuerySchema = z.strictObject({
  classe: ClasseSalvoSchema.optional(),
  dias: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(RETENCAO_AVISOS_DIAS))
    .optional(),
});

/** GET /comparacao-pdf?t=&janela=&tipo= (o mesmo t/janela do /comparador). */
export const ComparacaoPdfQuerySchema = z.strictObject({
  t: z
    .string()
    .max(80)
    .transform((v) =>
      v
        .split(',')
        .map(normalizarTicker)
        .filter((t) => t.length > 0),
    )
    .pipe(
      z
        .array(z.string().regex(TICKER_RE))
        .min(1)
        .max(MAX_TICKERS_COMPARACAO)
        .refine((ts) => new Set(ts).size === ts.length, 'Tickers repetidos'),
    ),
  janela: janelaQuery.optional(),
  tipo: TipoFiiSchema.optional(),
});

/** URLSearchParams → objeto para os *QuerySchema (strict: parâmetro desconhecido ⇒ 400). */
export function paramsParaObjeto(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Conferência de tipo: os schemas cabem nos tipos públicos (analiseAtivosSalvos.ts)
// ---------------------------------------------------------------------------

type Contem<A, B> = [A] extends [B] ? true : false;
const _c1: Contem<z.infer<typeof ListaPostSchema>, ListaPostBody> = true;
const _c2: Contem<z.infer<typeof ListaPatchSchema>, ListaPatchBody> = true;
const _c3: Contem<z.infer<typeof ItemPostSchema>, ItemPostBody> = true;
const _c4: Contem<z.infer<typeof SalvosPutSchema>, SalvosPutBody> = true;
const _c5: Contem<z.infer<typeof EstadoFiltroSalvoV1Schema>, EstadoFiltroSalvoV1> = true;
const _c6: Contem<EstadoFiltroSalvoV1, z.infer<typeof EstadoFiltroSalvoV1Schema>> = true;
const _c7: Contem<z.infer<typeof FiltroPostSchema>, FiltroPostBody> = true;
const _c8: Contem<z.infer<typeof FiltroPatchSchema>, FiltroPatchBody> = true;
const _c9: Contem<z.infer<typeof ComparacaoPostSchema>, ComparacaoPostBody> = true;
const _c10: Contem<z.infer<typeof ComparacaoPatchSchema>, ComparacaoPatchBody> = true;
const _c11: Contem<z.infer<typeof AlertasLidosSchema>, AlertasLidosBody> = true;
void [_c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11];
