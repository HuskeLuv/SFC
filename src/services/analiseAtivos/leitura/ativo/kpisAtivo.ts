/**
 * Os 8 indicadores (KPIs) do topo da página do ativo, por classe (fatia B). Funções puras sobre a
 * linha do Quadro (Estado<number> com motivo pronto), os múltiplos atuais e as linhas dos pares.
 *
 * Ações: P/L (sub: média 10a se ≥ 5 pontos), P/VP, DY 12m, ROE e margem (sub: mediana dos pares,
 * mín. 3), Dív.líq./EBITDA (n/a em financeira; 'caixa líquido'), Payout (aviso acima de 150%) e
 * CAGR do lucro por ação em 5 anos FECHADOS (series.cagrJanela).
 * FIIs: DY 12m, P/VP, rendimento/cota 12m, patrimônio, cotistas, liquidez 21d, Obrigações/PL e
 * vacância (fonte CVM; papel = n/a). Sem cap rate.
 */
import { formatarNumeroBR, formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_TELA, textoMotivo, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import { cagrJanela } from '@/services/analiseAtivos/leitura/ativo/series';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import type { Estado, KpiAtivo, LinhaQuadroApi, PontoSerieAnual } from '@/types/analiseAtivosApi';

export const PARES_MINIMOS_REFERENCIA = 3;
export const PONTOS_MINIMOS_MEDIA_PL = 5;
export const PAYOUT_LIMITE_AVISO = 150;

/** Campos dos múltiplos atuais (AssetMultiplesCurrent) usados nos KPIs. */
export interface MultiplosAtuaisKpi {
  plMedia10a: number | null;
  plPontosHistorico: number;
  dpa12m: number | null;
  rend12m: number | null;
  vpCota: number | null;
}

export interface EntradaKpis {
  linha: LinhaQuadroApi;
  atuais: MultiplosAtuaisKpi | null;
  pares: readonly LinhaQuadroApi[];
  /** ações: LPA ajustado por ano, só anos FECHADOS */
  lpaAnual?: readonly PontoSerieAnual[];
  /** FIIs: data (AAAA-MM-DD) do informe mensal do patrimônio */
  patrimonioData?: string | null;
}

const R = TEXTOS_TELA.ativo.kpis;

function ok(valor: number | null | undefined, emConferencia = false): Estado<number> {
  if (typeof valor === 'number' && Number.isFinite(valor)) return { estado: 'ok', valor };
  const t = TEXTOS_TELA.ausentesPorCampo;
  return emConferencia
    ? { estado: 'ausente', motivo: 'fonte_defasada', texto: t.dyEmConferencia }
    : { estado: 'ausente', motivo: 'sem_dado_fonte', texto: t.semDado };
}

/**
 * P/L e payout com prejuízo: a linha do Quadro grava o campo em naoSeAplica sem motivo (vira
 * 'fora do escopo'); na página o motivo é o prejuízo (AURE3: P/L '—' com a frase do prejuízo).
 */
function comPrejuizo(linha: LinhaQuadroApi, campo: 'pl' | 'payout'): Estado<number> {
  const v = linha[campo];
  const prejuizo = linha.flags.some((f) => f === 'lucro_nao_positivo' || f === 'prejuizo');
  if (!prejuizo || v.estado !== 'nao_se_aplica' || v.motivo !== 'fora_do_escopo') return v;
  return campo === 'pl'
    ? { estado: 'ausente', motivo: 'prejuizo', texto: TEXTOS_TELA.ausentesPorCampo.plPrejuizo }
    : {
        estado: 'nao_se_aplica',
        motivo: 'base_nao_positiva',
        texto: textoNaoSeAplica('base_nao_positiva'),
      };
}

function moeda(v: number, casas = 2): string {
  return `R$ ${formatarNumeroBR(v, casas)}`;
}

function dataCurta(iso: string): string {
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  return `${meses[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

/** Mediana dos valores 'ok' de um campo nos pares; null com menos de PARES_MINIMOS_REFERENCIA. */
export function medianaPares(
  pares: readonly LinhaQuadroApi[],
  campo: 'roe' | 'margemLiquida' | 'pl' | 'pvp' | 'dy12m',
): { valor: number; n: number } | null {
  const vals = pares
    .map((p) => p[campo])
    .filter((e): e is { estado: 'ok'; valor: number } => e.estado === 'ok')
    .map((e) => e.valor)
    .sort((a, b) => a - b);
  if (vals.length < PARES_MINIMOS_REFERENCIA) return null;
  const meio = Math.floor(vals.length / 2);
  const valor = vals.length % 2 ? vals[meio] : (vals[meio - 1] + vals[meio]) / 2;
  return { valor, n: vals.length };
}

function subPares(
  linha: LinhaQuadroApi,
  pares: readonly LinhaQuadroApi[],
  campo: 'roe' | 'margemLiquida',
  sufixo: string,
): string | null {
  if (linha[campo].estado !== 'ok') return null;
  const m = medianaPares(pares, campo);
  if (!m) return null;
  return formatarTexto(R.medianaPares, {
    pares: m.n,
    valor: `${formatarNumeroBR(m.valor, 1)}${sufixo}`,
  });
}

function kpisAcao(e: EntradaKpis): KpiAtivo[] {
  const { linha, atuais, pares } = e;
  const conferencia = linha.proventosEmConferencia ? 'proventos_em_conferencia' : null;

  const subPl =
    atuais &&
    typeof atuais.plMedia10a === 'number' &&
    atuais.plPontosHistorico >= PONTOS_MINIMOS_MEDIA_PL
      ? formatarTexto(R.mediaDezAnos, { valor: `${formatarNumeroBR(atuais.plMedia10a, 1)}×` })
      : null;

  const div = linha.divLiqEbitda;
  const subDiv = div.estado === 'ok' && div.valor <= 0 ? R.caixaLiquido : null;

  const payout = comPrejuizo(linha, 'payout');
  const subPayout =
    payout.estado === 'ok' && payout.valor > PAYOUT_LIMITE_AVISO ? R.payoutAcima : null;

  const subDy =
    atuais && typeof atuais.dpa12m === 'number' && atuais.dpa12m > 0
      ? formatarTexto(R.dpa12m, { valor: moeda(atuais.dpa12m) })
      : null;

  const janela = cagrJanela(e.lpaAnual ?? [], 5);
  let cagr: Estado<number>;
  if (janela.pct !== null) cagr = { estado: 'ok', valor: janela.pct };
  else if (janela.motivo === 'base_nao_positiva') {
    cagr = {
      estado: 'nao_se_aplica',
      motivo: 'base_nao_positiva',
      texto: textoNaoSeAplica('base_nao_positiva'),
    };
  } else {
    const motivo = janela.motivo ?? 'historico_curto';
    cagr = { estado: 'ausente', motivo, texto: textoMotivo(motivo) };
  }
  const subCagr =
    janela.anoInicio !== null && janela.anoFim !== null
      ? formatarTexto(R.cagrLucroJanela, { valor: `${janela.anoInicio} a ${janela.anoFim}` })
      : null;

  return [
    {
      codigo: 'pl',
      rotulo: R.rotulos.pl,
      valor: comPrejuizo(linha, 'pl'),
      formato: 'multiplo',
      sub: subPl,
      selo: null,
    },
    {
      codigo: 'pvp',
      rotulo: R.rotulos.pvp,
      valor: linha.pvp,
      formato: 'numero2',
      sub: null,
      selo: null,
    },
    {
      codigo: 'dy12m',
      rotulo: R.rotulos.dy12m,
      valor: linha.dy12m,
      formato: 'pct',
      sub: subDy,
      selo: conferencia,
    },
    {
      codigo: 'roe',
      rotulo: R.rotulos.roe,
      valor: linha.roe,
      formato: 'pct',
      sub: subPares(linha, pares, 'roe', '%'),
      selo: null,
    },
    {
      codigo: 'margemLiquida',
      rotulo: R.rotulos.margemLiquida,
      valor: linha.margemLiquida,
      formato: 'pct',
      sub: subPares(linha, pares, 'margemLiquida', '%'),
      selo: null,
    },
    {
      codigo: 'divLiqEbitda',
      rotulo: R.rotulos.divLiqEbitda,
      valor: div,
      formato: 'multiplo',
      sub: subDiv,
      selo: null,
    },
    {
      codigo: 'payout',
      rotulo: R.rotulos.payout,
      valor: payout,
      formato: 'pct',
      sub: subPayout,
      selo: conferencia,
    },
    {
      codigo: 'cagrLucro',
      rotulo: R.rotulos.cagrLucro,
      valor: cagr,
      formato: 'pctSinal',
      sub: subCagr,
      selo: null,
    },
  ];
}

function kpisFii(e: EntradaKpis): KpiAtivo[] {
  const { linha, atuais } = e;
  const conferencia = linha.proventosEmConferencia ? 'proventos_em_conferencia' : null;
  const rend = atuais?.rend12m ?? null;
  // ticker↔CNPJ não conferido: nada do informe CVM (VP/cota, patrimônio, cotistas, vacância...)
  const cnpjConf = linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
  const emConfCnpj: Estado<number> = {
    estado: 'ausente',
    motivo: 'cnpj_em_conferencia',
    texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
  };
  const informe = (v: Estado<number>): Estado<number> => (cnpjConf ? emConfCnpj : v);
  const vpCota = cnpjConf ? null : (atuais?.vpCota ?? null);
  const vac: Estado<number> = cnpjConf
    ? emConfCnpj
    : linha.fiiTipo === 'papel'
      ? {
          estado: 'nao_se_aplica',
          motivo: 'papel_sem_imoveis',
          texto: textoNaoSeAplica('papel_sem_imoveis'),
        }
      : linha.vacanciaCvm;
  return [
    {
      codigo: 'dy12m',
      rotulo: R.rotulos.dy12m,
      valor: linha.dy12m,
      formato: 'pct',
      sub:
        typeof rend === 'number' && rend > 0
          ? formatarTexto(R.rend12m, { valor: moeda(rend) })
          : null,
      selo: conferencia,
    },
    {
      codigo: 'pvp',
      rotulo: R.rotulos.pvp,
      valor: informe(linha.pvp),
      formato: 'numero2',
      sub: typeof vpCota === 'number' ? formatarTexto(R.vpCota, { valor: moeda(vpCota) }) : null,
      selo: null,
    },
    {
      codigo: 'rendCota12m',
      rotulo: R.rotulos.rendCota12m,
      valor: ok(rend, linha.proventosEmConferencia),
      formato: 'moeda',
      sub: null,
      selo: conferencia,
    },
    {
      codigo: 'patrimonio',
      rotulo: R.rotulos.patrimonio,
      valor: informe(ok(linha.patrimonio)),
      formato: 'moedaCompacta',
      sub:
        !cnpjConf && e.patrimonioData
          ? formatarTexto(R.informeCvm, { data: dataCurta(e.patrimonioData) })
          : null,
      selo: null,
    },
    {
      codigo: 'cotistas',
      rotulo: R.rotulos.cotistas,
      valor: informe(ok(linha.cotistas)),
      formato: 'inteiro',
      sub: cnpjConf ? null : R.cotistasSub,
      selo: null,
    },
    {
      codigo: 'liquidez21',
      rotulo: R.rotulos.liquidez21,
      valor: ok(linha.liquidezMedia21),
      formato: 'moedaCompacta',
      sub: R.liquidezSub,
      selo: linha.baixaLiquidez ? 'baixa_liquidez' : null,
    },
    {
      codigo: 'obrigacoesPl',
      rotulo: R.rotulos.obrigacoesPl,
      valor: informe(linha.obrigacoesPl),
      formato: 'pct',
      sub: null,
      selo: null,
    },
    {
      codigo: 'vacanciaCvm',
      rotulo: R.rotulos.vacanciaCvm,
      valor: vac,
      formato: 'pct',
      sub: cnpjConf || linha.fiiTipo === 'papel' ? null : TEXTOS_TELA.selos.fonteCvm,
      selo: null,
    },
  ];
}

export function montarKpis(e: EntradaKpis): KpiAtivo[] {
  return e.linha.classe === 'fii' ? kpisFii(e) : kpisAcao(e);
}
