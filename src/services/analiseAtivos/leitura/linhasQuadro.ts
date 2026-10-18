/**
 * Leitor ÚNICO de analise_quadro_linhas (Fase 1). Usado pelo Quadro, busca, página do ativo, pares
 * e tese (validação do ticker). Nenhum provedor externo: só o banco.
 *
 * - versaoQuadro(): max(geradoEm) em ISO ('vazio' sem linhas), sondado no máximo 1×/60 s.
 * - As ~800 linhas ficam num array em memória por versão (instância única no Lightsail); quando o
 *   job 'quadro' grava uma versão nova, os leitores trocam em até 60 s.
 * - paraLinhaQuadroApi(row) / paraLinhaQuadroApiNaJanela(row, janela): converte Decimal/Date, monta Estado<number> com motivo + texto
 *   (textosTela), projeta os critérios da JANELA pedida (cópia compacta gravada pelo job
 *   'criterios', projetarCriteriosCompactos) e os motivos de conferência (motivosConferencia, os
 *   códigos que antes vinham dentro do indicador antigo). v2.4: NÃO emite `indice` (nenhuma chave
 *   /indice|semaforo|destaque/ no JSON do Quadro); a tabela AnaliseQuadroLinha segue intacta (D6).
 * - A conversão fica memorizada por versão E janela (3 | 5 | 10).
 *
 * CONVENÇÃO das colunas de array gravadas pelo job (fatia A):
 * - naoSeAplica: nome do campo ('divLiqEbitda') ou 'campo:motivo' ('vacanciaFisicaCvmPct:
 *   papel_sem_imoveis'). Sem motivo explícito, vale o da régua (acao_financeira → financeira).
 * - motivosIncompleto: 'componente:motivo' do AssetScore ('div:fonte_defasada').
 * - componentesZeroRegra: 'componente:motivo' ('lucro:prejuizo', 'preco:pl_negativo').
 * - flags: inclui 'provento_suspeito', 'proventos_defasados*' e 'proventos_em_conferencia_*' (trava
 *   de plausibilidade do DY) (⇒ proventosEmConferencia).
 * - bloco C (só params v2): flags 'conf:<grupo>:<regra>@<chave>' (conferencia.ts). Campo com
 *   exibição 'ocultar' vira ausente('em_conferencia:<grupo>') SEM valor (vai para o fim da
 *   ordenação); 'selo' fica ok com o valor (a tela põe o chip lendo as mesmas flags). A v1 nunca
 *   grava 'conf:' ⇒ a resposta não muda.
 */
import type { AnaliseQuadroLinha } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { proventosEmConferencia } from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import { gruposConf } from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  aplicarConferenciaCampo,
  conferenciaConf,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { projetarCriteriosCompactos } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { TEXTOS_TELA, motivoTela, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import { BOLSAS_EUA, type BolsaEua } from '@/types/analiseAtivosEua';
import type {
  ClasseQuadro,
  Estado,
  FiiTipoTela,
  ForaDoQuadroMotivo,
  LinhaQuadroApi,
  MotivoTela,
  PontoSerieAnual,
} from '@/types/analiseAtivosApi';
import {
  JANELA_PADRAO,
  PERFIS_CRITERIO,
  type CriteriosLinhaApi,
  type Janela,
  type PerfilCriterio,
} from '@/types/analiseAtivosCriterios';

export const INTERVALO_SONDA_VERSAO_MS = 60_000;
export const VERSAO_VAZIA = 'vazio';

interface CacheLinhas {
  versao: string;
  linhas: AnaliseQuadroLinha[];
  porSymbol: Map<string, AnaliseQuadroLinha>;
  api: Map<string, LinhaQuadroApi>;
}

let versaoAtual: { valor: string; sondadoEm: number } | null = null;
let sondaEmVoo: Promise<string> | null = null;
let cache: CacheLinhas | null = null;
let cargaEmVoo: Promise<CacheLinhas> | null = null;

/** Só para testes: zera versão e linhas em memória. */
export function _resetarCacheLinhasQuadro(): void {
  versaoAtual = null;
  sondaEmVoo = null;
  cache = null;
  cargaEmVoo = null;
}

/** Versão das linhas = max(geradoEm) ISO; sondada no máximo 1×/60 s. */
export async function versaoQuadro(agora: number = Date.now()): Promise<string> {
  if (versaoAtual && agora - versaoAtual.sondadoEm < INTERVALO_SONDA_VERSAO_MS) {
    return versaoAtual.valor;
  }
  if (!sondaEmVoo) {
    sondaEmVoo = prisma.analiseQuadroLinha
      .aggregate({ _max: { geradoEm: true } })
      .then((r) => {
        const valor = r._max.geradoEm ? r._max.geradoEm.toISOString() : VERSAO_VAZIA;
        versaoAtual = { valor, sondadoEm: agora };
        return valor;
      })
      .finally(() => {
        sondaEmVoo = null;
      });
  }
  return sondaEmVoo;
}

async function carregar(): Promise<CacheLinhas> {
  const versao = await versaoQuadro();
  if (cache && cache.versao === versao) return cache;
  if (!cargaEmVoo) {
    cargaEmVoo = prisma.analiseQuadroLinha
      .findMany({ orderBy: { symbol: 'asc' } })
      .then((linhas) => {
        cache = {
          versao,
          linhas,
          porSymbol: new Map(linhas.map((l) => [l.symbol, l])),
          api: new Map(),
        };
        return cache;
      })
      .finally(() => {
        cargaEmVoo = null;
      });
  }
  return cargaEmVoo;
}

// ---------------------------------------------------------------------------
// Params dos critérios (chips e equivalências do Quadro)
// ---------------------------------------------------------------------------

/** Params dos critérios em memória (o seed/admin grava raramente): TTL de 10 min. */
export const TTL_CRITERIA_PARAMS_MS = 10 * 60 * 1000;
let paramsMemo: { params: CriteriaParams; lidoEm: number } | null = null;

/** Só para testes. */
export function _resetarParamsQuadro(): void {
  paramsMemo = null;
}

/**
 * CriteriaParams ativo. Sem versão no banco (seed ainda não rodou) cai no v1 do código, para o
 * Quadro não quebrar: os chips são os mesmos e o filtro só acha quem o job já avaliou.
 */
export async function obterCriteriaParamsQuadro(agora = Date.now()): Promise<CriteriaParams> {
  if (paramsMemo && agora - paramsMemo.lidoEm < TTL_CRITERIA_PARAMS_MS) return paramsMemo.params;
  let params: CriteriaParams;
  try {
    params = (await obterCriteriaParams(prisma)).params;
  } catch (error: unknown) {
    console.warn(
      '[analise-ativos/linhasQuadro] criteria_params indisponível, usando os params vigentes do código:',
      error instanceof Error ? error.message : error,
    );
    params = CRITERIA_PARAMS_CODIGO;
  }
  paramsMemo = { params, lidoEm: agora };
  return params;
}

export interface OpcoesLinhasQuadro {
  /** inclui linhas noQuadro=false (busca, página do ativo); padrão false */
  incluirForaDoQuadro?: boolean;
  /** janela dos critérios projetada em LinhaQuadroApi.criterios; padrão JANELA_PADRAO (5) */
  janela?: Janela;
}

export async function obterLinhasQuadro(
  classe?: ClasseQuadro,
  opts: OpcoesLinhasQuadro = {},
): Promise<AnaliseQuadroLinha[]> {
  const { linhas } = await carregar();
  return linhas.filter(
    (l) => (!classe || l.classe === classe) && (opts.incluirForaDoQuadro || l.noQuadro),
  );
}

/** Linha de um ticker (inclusive fora do Quadro); null se não existe. */
export async function obterLinhaQuadro(symbol: string): Promise<AnaliseQuadroLinha | null> {
  const { porSymbol } = await carregar();
  return porSymbol.get(symbol.toUpperCase()) ?? null;
}

/** Linhas já convertidas para a API, memorizadas por versão e janela. */
export async function obterLinhasQuadroApi(
  classe?: ClasseQuadro,
  opts: OpcoesLinhasQuadro = {},
): Promise<LinhaQuadroApi[]> {
  const c = await carregar();
  const linhas = await obterLinhasQuadro(classe, opts);
  const janela = opts.janela ?? JANELA_PADRAO;
  return linhas.map((l) => {
    const chave = `${janela}:${l.symbol}`;
    let api = c.api.get(chave);
    if (!api) {
      api = paraLinhaQuadroApiNaJanela(l, janela);
      c.api.set(chave, api);
    }
    return api;
  });
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

type Decimalish = { toNumber(): number } | { toString(): string } | number | null | undefined;

export function decimalParaNumero(d: Decimalish): number | null {
  if (d === null || d === undefined) return null;
  if (typeof d === 'number') return Number.isFinite(d) ? d : null;
  const n =
    'toNumber' in d && typeof d.toNumber === 'function' ? d.toNumber() : Number(d.toString());
  return Number.isFinite(n) ? n : null;
}

function dataIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Campos com Estado na API → coluna da linha. */
const CAMPOS = {
  roe: 'roePct',
  pl: 'pl',
  pvp: 'pvp',
  dy12m: 'dy12mPct',
  margemLiquida: 'margemLiquidaPct',
  divLiqEbitda: 'divLiqEbitda',
  payout: 'payoutPct',
  vacanciaCvm: 'vacanciaFisicaCvmPct',
  obrigacoesPl: 'obrigacoesPlPct',
} as const;
type CampoApi = keyof typeof CAMPOS;

const APLICAVEIS: Record<ClasseQuadro, ReadonlySet<CampoApi>> = {
  acao: new Set<CampoApi>(['roe', 'pl', 'pvp', 'dy12m', 'margemLiquida', 'divLiqEbitda', 'payout']),
  fii: new Set<CampoApi>(['pvp', 'dy12m', 'vacanciaCvm', 'obrigacoesPl']),
  // EUA (fatia 0): P/L e DY dependem da cotação (null sem ANALISE_ATIVOS_EUA_PRECO_HABILITADO)
  stock: new Set<CampoApi>(['roe', 'pl', 'dy12m', 'margemLiquida', 'divLiqEbitda', 'payout']),
  reit: new Set<CampoApi>(['dy12m', 'divLiqEbitda', 'payout']),
};

const CAMPOS_PROVENTO: ReadonlySet<CampoApi> = new Set<CampoApi>(['dy12m', 'payout']);
/** Campos do FII que vêm do informe do CNPJ (ficam 'em conferência' se o ticker↔CNPJ não conferiu). */
const CAMPOS_CNPJ_FII: ReadonlySet<CampoApi> = new Set<CampoApi>([
  'pvp',
  'vacanciaCvm',
  'obrigacoesPl',
]);

function mapaNaoSeAplica(row: AnaliseQuadroLinha): Map<string, string> {
  const padrao =
    row.regua === 'acao_financeira'
      ? 'financeira'
      : row.fiiTipo === 'fof'
        ? 'fof'
        : 'fora_do_escopo';
  const m = new Map<string, string>();
  for (const item of row.naoSeAplica) {
    const [campo, motivo] = item.split(':');
    m.set(campo, motivo || padrao);
  }
  return m;
}

function temProventosEmConferencia(row: AnaliseQuadroLinha): boolean {
  return proventosEmConferencia(row.flags, row.motivosIncompleto);
}

function temPrejuizo(row: AnaliseQuadroLinha): boolean {
  return (
    row.componentesZeroRegra.some((c) => c.endsWith(':prejuizo')) || row.flags.includes('prejuizo')
  );
}

function ausente(motivo: string, texto: string): Estado<number> {
  return { estado: 'ausente', motivo, texto };
}

function estadoCampo(
  row: AnaliseQuadroLinha,
  campo: CampoApi,
  naoSeAplica: Map<string, string>,
  emConferencia: boolean,
): Estado<number> {
  const coluna = CAMPOS[campo];
  const classe = row.classe as ClasseQuadro;
  if (!APLICAVEIS[classe]?.has(campo)) {
    return {
      estado: 'nao_se_aplica',
      motivo: 'fora_do_escopo',
      texto: textoNaoSeAplica('fora_do_escopo'),
    };
  }
  const motivoNa =
    naoSeAplica.get(coluna) ??
    (campo === 'vacanciaCvm' && row.fiiTipo === 'papel' ? 'papel_sem_imoveis' : undefined);
  if (motivoNa) {
    return { estado: 'nao_se_aplica', motivo: motivoNa, texto: textoNaoSeAplica(motivoNa) };
  }
  const v = row[coluna];
  const valor: Estado<number> | null =
    typeof v === 'number' && Number.isFinite(v) ? { estado: 'ok', valor: v } : null;
  // (b) bloco C: grupo 'conf:' que marca o campo. 'ocultar' → '—' sem valor (fim da ordenação);
  // 'selo' → segue com o valor (o chip vem das mesmas flags). Legado de proventos: caminho (c).
  const conf = conferenciaConf(row.flags, row.motivosIncompleto, campo, classe);
  if (conf?.exibicao === 'ocultar') {
    return aplicarConferenciaCampo(
      valor ?? ausente('sem_dado_fonte', TEXTOS_TELA.ausentesPorCampo.semDado),
      row.flags,
      row.motivosIncompleto,
      campo,
      classe,
    ).estado;
  }
  // (c) caminho de hoje
  if (valor) return valor;
  const t = TEXTOS_TELA.ausentesPorCampo;
  if (CAMPOS_CNPJ_FII.has(campo) && row.flags.includes(FLAG_CNPJ_EM_CONFERENCIA)) {
    return ausente('cnpj_em_conferencia', t.cnpjEmConferencia);
  }
  if (campo === 'pl' && temPrejuizo(row)) return ausente('prejuizo', t.plPrejuizo);
  if (CAMPOS_PROVENTO.has(campo) && emConferencia) {
    return ausente('fonte_defasada', t.dyEmConferencia);
  }
  return ausente('sem_dado_fonte', t.semDado);
}

/**
 * Motivos de conferência/incompletude da linha (os códigos 'componente:motivo' gravados pelo job,
 * ex.: 'div:fonte_defasada'), com o texto de textosTela. Substituem os motivos que vinham dentro do
 * indicador antigo; a conferência do bloco C (legado de proventos) e a página do ativo leem daqui.
 */
export function motivosConferenciaDaLinha(row: AnaliseQuadroLinha): MotivoTela[] {
  return row.motivosIncompleto.map(motivoTela);
}

function ehPerfil(v: unknown): v is PerfilCriterio {
  return typeof v === 'string' && (PERFIS_CRITERIO as readonly string[]).includes(v);
}

/** Critérios da janela (cópia compacta da linha); null = job 'criterios' ainda não avaliou. */
export function criteriosDaLinha(
  row: AnaliseQuadroLinha,
  janela: Janela,
): CriteriosLinhaApi | null {
  const perfil = ehPerfil(row.perfilCriterios) ? row.perfilCriterios : null;
  return projetarCriteriosCompactos(row.criterios, janela, perfil);
}

function serieDaLinha(json: unknown): PontoSerieAnual[] {
  if (!Array.isArray(json)) return [];
  const out: PontoSerieAnual[] = [];
  for (const p of json) {
    if (!p || typeof p !== 'object') continue;
    const { ano, valor, suspeito } = p as Record<string, unknown>;
    if (typeof ano !== 'number') continue;
    const ponto: PontoSerieAnual = {
      ano,
      valor: typeof valor === 'number' && Number.isFinite(valor) ? valor : null,
    };
    if (suspeito === true) ponto.suspeito = true;
    out.push(ponto);
  }
  return out.sort((a, b) => a.ano - b.ano);
}

/**
 * Conversão na janela padrão (5). Um argumento só de propósito: `linhas.map(paraLinhaQuadroApi)`
 * continua válido (o índice do map nunca vira janela). Outra janela: paraLinhaQuadroApiNaJanela.
 */
export function paraLinhaQuadroApi(row: AnaliseQuadroLinha): LinhaQuadroApi {
  return paraLinhaQuadroApiNaJanela(row, JANELA_PADRAO);
}

export function paraLinhaQuadroApiNaJanela(
  row: AnaliseQuadroLinha,
  janela: Janela,
): LinhaQuadroApi {
  const classe = row.classe as ClasseQuadro;
  const naoSeAplica = mapaNaoSeAplica(row);
  const emConferencia = temProventosEmConferencia(row);
  const est = (campo: CampoApi) => estadoCampo(row, campo, naoSeAplica, emConferencia);
  const preco = decimalParaNumero(row.preco);
  // bloco C: valor de mercado depende do nº de ações/cotação (acoes_escala, preco_base...)
  const vmOculto =
    conferenciaConf(row.flags, row.motivosIncompleto, 'valorMercado', classe)?.exibicao ===
    'ocultar';
  const grupos = gruposConf(row.flags);
  const extras: Pick<LinhaQuadroApi, 'conferencias'> = {};
  // só com flag 'conf:' (v2): com a v1 a resposta fica idêntica à da Fase 1
  if (grupos.length > 0) {
    extras.conferencias =
      emConferencia && !grupos.includes('proventos') ? [...grupos, 'proventos'] : [...grupos];
  }
  return {
    ticker: row.symbol,
    classe,
    nome: row.nome,
    setor: row.setor,
    subsetor: row.subsetor,
    segmento: row.segmento,
    listagem: row.segmentoListagem,
    fiiTipo: (row.fiiTipo as FiiTipoTela | null) ?? null,
    segmentoCvm: row.segmentoCvm,
    noQuadro: row.noQuadro,
    foraDoQuadroMotivo: (row.foraDoQuadroMotivo as ForaDoQuadroMotivo | null) ?? null,
    preco:
      preco === null
        ? ausente('sem_preco', TEXTOS_TELA.motivosPorSufixo.sem_preco)
        : { estado: 'ok', valor: preco },
    precoData: dataIso(row.precoData),
    variacaoDiaPct: row.variacaoDiaPct,
    liquidezMedia21: decimalParaNumero(row.volumeMedio21),
    baixaLiquidez: row.baixaLiquidez,
    criterios: criteriosDaLinha(row, janela),
    motivosConferencia: motivosConferenciaDaLinha(row),
    anosLucroConsecutivos: row.anosLucroConsecutivos,
    mesesComRendimento: row.mesesComRendimento,
    anosDividendo: row.anosDividendo,
    roe: est('roe'),
    pl: est('pl'),
    pvp: est('pvp'),
    dy12m: est('dy12m'),
    margemLiquida: est('margemLiquida'),
    divLiqEbitda: est('divLiqEbitda'),
    payout: est('payout'),
    vacanciaCvm: est('vacanciaCvm'),
    obrigacoesPl: est('obrigacoesPl'),
    nImoveisCvm: row.nImoveisCvm,
    nCri: row.nCri,
    valorMercado: vmOculto ? null : decimalParaNumero(row.valorMercado),
    patrimonio: decimalParaNumero(row.patrimonio),
    cotistas: row.cotistas,
    serie10a: serieDaLinha(row.serie10a),
    tipoSerie: classe === 'fii' ? 'rendimento' : 'lucro',
    serieUlt12m: row.serieUlt12m,
    proventosEmConferencia: emConferencia,
    flags: row.flags,
    pares: row.pares,
    assetId: row.assetId,
    ...extras,
    ...camposEuaDaLinha(row),
  };
}

/**
 * Stocks e REITs (fatia 0): moeda/bolsa/dpa/fcoPorAcao/dividendosFcoPct SÓ nas linhas com moeda
 * gravada (stock/reit, gerarQuadroEua da fatia B) — a resposta das linhas BR fica idêntica.
 */
export function camposEuaDaLinha(
  row: Pick<AnaliseQuadroLinha, 'moeda' | 'bolsa' | 'dpa' | 'fcoPorAcao' | 'dividendosFcoPct'>,
): Pick<LinhaQuadroApi, 'moeda' | 'bolsa' | 'dpa' | 'fcoPorAcao' | 'dividendosFcoPct'> {
  if (row.moeda !== 'USD') return {};
  return {
    moeda: 'USD',
    bolsa: (BOLSAS_EUA as readonly string[]).includes(row.bolsa ?? '')
      ? (row.bolsa as BolsaEua)
      : null,
    dpa: row.dpa,
    fcoPorAcao: row.fcoPorAcao,
    dividendosFcoPct: row.dividendosFcoPct,
  };
}
