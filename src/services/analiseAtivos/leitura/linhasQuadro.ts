/**
 * Leitor ÚNICO de analise_quadro_linhas (Fase 1). Usado pelo Quadro, busca, página do ativo, pares
 * e tese (validação do ticker). Nenhum provedor externo: só o banco.
 *
 * - versaoQuadro(): max(geradoEm) em ISO ('vazio' sem linhas), sondado no máximo 1×/60 s.
 * - As ~800 linhas ficam num array em memória por versão (instância única no Lightsail); quando o
 *   job 'quadro' grava uma versão nova, os leitores trocam em até 60 s.
 * - paraLinhaQuadroApi(row): converte Decimal/Date, monta Estado<number> com motivo + texto
 *   (textosTela) e o Índice nos 5 estados.
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
import {
  TEXTOS_TELA,
  motivoTela,
  motivosEstadoIndice,
  textoNaoSeAplica,
  textoZeroRegra,
} from '@/services/analiseAtivos/textosTela';
import type {
  ClasseQuadro,
  Estado,
  EstadoIndice,
  FiiTipoTela,
  ForaDoQuadroMotivo,
  IndiceLinha,
  LinhaQuadroApi,
  PontoSerieAnual,
  StatusCriterioTela,
} from '@/types/analiseAtivosApi';

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

export interface OpcoesLinhasQuadro {
  /** inclui linhas noQuadro=false (busca, página do ativo); padrão false */
  incluirForaDoQuadro?: boolean;
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

/** Linhas já convertidas para a API, memorizadas por versão. */
export async function obterLinhasQuadroApi(
  classe?: ClasseQuadro,
  opts: OpcoesLinhasQuadro = {},
): Promise<LinhaQuadroApi[]> {
  const c = await carregar();
  const linhas = await obterLinhasQuadro(classe, opts);
  return linhas.map((l) => {
    let api = c.api.get(l.symbol);
    if (!api) {
      api = paraLinhaQuadroApi(l);
      c.api.set(l.symbol, api);
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

function indiceDaLinha(row: AnaliseQuadroLinha): IndiceLinha {
  const estado = row.estadoIndice as EstadoIndice;
  let motivos;
  if (estado === 'incompleto') motivos = row.motivosIncompleto.map(motivoTela);
  else if (estado === 'zero_regra') {
    motivos = row.componentesZeroRegra.map((c) => ({ codigo: c, texto: textoZeroRegra(c) }));
  } else motivos = motivosEstadoIndice(estado);
  const semNumero = estado === 'sem_score' || estado === 'fora_do_indice';
  return {
    valor: semNumero ? null : row.indiceMf,
    estado,
    motivos,
    criteriosAtendidos: row.criteriosAtendidos,
    criteriosAplicaveis: row.criteriosAplicaveis,
    statusCriterios: row.statusCriterios as StatusCriterioTela[],
  };
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

export function paraLinhaQuadroApi(row: AnaliseQuadroLinha): LinhaQuadroApi {
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
    indice: indiceDaLinha(row),
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
  };
}
