/**
 * Leitura do COTAHIST (zip → linhas → registros) em streaming. O arquivo anual tem ~90 MB zipado e
 * ~500 MB de texto: nunca é carregado inteiro (zipStream infla por partes; filtro barato na linha
 * crua antes do parse).
 *
 * Valida: exatamente uma entrada .TXT; header 00 'COTAHIST' (senão ErroLayoutFonte); trailer 99 com
 * o total de registros igual ao lido — com ou sem header/trailer, a B3 usa as duas convenções
 * (senão ErroFonte 'zip_corrompido'/'zip_truncado').
 * Registros já emitidos antes de uma falha no trailer ficam gravados (são linhas íntegras e
 * imutáveis; a próxima execução completa o que faltar via skipDuplicates).
 */
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { linhasDaEntrada, listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  TPMERC_VISTA,
  bdiAceito,
  filtrarRegistroComBdi14,
  lerTrailerCotahist,
  parseLinhaCotahist,
  validarCabecalhoCotahist,
  type RegistroCotahist,
} from '@/services/analiseAtivos/regras/b3/cotahist';

export interface EstatisticaCotahist {
  /** linhas do arquivo (inclui header e trailer) */
  linhas: number;
  /** registros 01 que passaram no filtro de mercado/BDI/data e foram emitidos */
  emitidos: number;
  /** registros 01 de 010 + BDI 02/12 (e 14 dos tickers pedidos) que não parsearam */
  rejeitados: number;
  dataGeracao: string | null;
  totalDeclarado: number | null;
  /** menor e maior DATPRE emitidos */
  primeiraData: string | null;
  ultimaData: string | null;
}

export function novaEstatistica(): EstatisticaCotahist {
  return {
    linhas: 0,
    emitidos: 0,
    rejeitados: 0,
    dataGeracao: null,
    totalDeclarado: null,
    primeiraData: null,
    ultimaData: null,
  };
}

export interface OpcoesLeituraCotahist {
  /** nome para mensagens de erro (ex.: COTAHIST_A2016.ZIP) */
  arquivo: string;
  /** filtro de data na linha crua, 'AAAAMMDD' (antes do parse) */
  aceitarDataBruta?: (aaaammdd: string) => boolean;
  estat?: EstatisticaCotahist;
  /** tickers aceitos também no BDI 14 (Fiagro/FI-Infra do FiiTickerMap) */
  simbolosBdi14?: ReadonlySet<string>;
  /** só os registros do BDI 14 desses tickers (backfill dos fundos novos sem reler o resto) */
  soBdi14?: boolean;
}

/** Filtro barato na linha crua: TIPREG 01, TPMERC 010, CODBDI 02/12 (14 dos tickers pedidos). */
function passaPreFiltro(l: string, opts: OpcoesLeituraCotahist): boolean {
  if (!l.startsWith('01') || l.slice(24, 27) !== TPMERC_VISTA) return false;
  const bdi = l.slice(10, 12);
  if (opts.soBdi14 && bdi !== '14') return false;
  return bdiAceito(bdi, l.slice(12, 24).trim(), opts.simbolosBdi14);
}

export async function* lerCotahistZip(
  caminho: string,
  opts: OpcoesLeituraCotahist,
): AsyncIterable<RegistroCotahist> {
  const estat = opts.estat ?? novaEstatistica();
  const entradas = (await listarEntradasZip(caminho)).filter((e) => !e.nome.endsWith('/'));
  if (entradas.length !== 1 || !/\.txt$/i.test(entradas[0].nome)) {
    throw new ErroLayoutFonte(opts.arquivo, [
      `uma entrada COTAHIST*.TXT (achou: ${entradas.map((e) => e.nome).join(', ') || 'nenhuma'})`,
    ]);
  }

  let trailer: { totalRegistros: number } | null = null;
  for await (const l of linhasDaEntrada(caminho, entradas[0], {
    encoding: 'latin1',
    maxLinha: 4096,
  })) {
    if (l.length === 0) continue;
    if (trailer) throw new ErroFonte('zip_corrompido', `${opts.arquivo}: linha depois do trailer`);
    estat.linhas++;
    if (estat.linhas === 1) {
      estat.dataGeracao = validarCabecalhoCotahist(l, opts.arquivo).dataGeracao;
      continue;
    }
    if (l.startsWith('99')) {
      trailer = lerTrailerCotahist(l);
      if (!trailer) throw new ErroLayoutFonte(opts.arquivo, ['trailer 99COTAHIST']);
      estat.totalDeclarado = trailer.totalRegistros;
      continue;
    }
    if (!passaPreFiltro(l, opts)) continue;
    if (opts.aceitarDataBruta && !opts.aceitarDataBruta(l.slice(2, 10))) continue;
    const r = parseLinhaCotahist(l);
    if (!r) {
      estat.rejeitados++;
      continue;
    }
    if (!filtrarRegistroComBdi14(r, opts.simbolosBdi14)) continue;
    estat.emitidos++;
    if (estat.primeiraData === null || r.data < estat.primeiraData) estat.primeiraData = r.data;
    if (estat.ultimaData === null || r.data > estat.ultimaData) estat.ultimaData = r.data;
    yield r;
  }

  if (!trailer) throw new ErroFonte('zip_truncado', `${opts.arquivo}: sem trailer 99`);
  // A B3 não é consistente: A2016 e M082026 contam header + trailer; A2025 conta só os registros 01.
  if (trailer.totalRegistros !== estat.linhas && trailer.totalRegistros !== estat.linhas - 2) {
    throw new ErroFonte(
      'zip_corrompido',
      `${opts.arquivo}: trailer declara ${trailer.totalRegistros} registros, lidos ${estat.linhas}`,
    );
  }
}
