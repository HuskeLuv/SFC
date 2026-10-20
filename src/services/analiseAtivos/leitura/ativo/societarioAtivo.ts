/**
 * Card "Dados societários e estatuto" da página da ação (A6, item 6; fatia D). Só o banco (job
 * 'cvm-fre-societario'); nenhuma chamada a terceiros na requisição.
 *
 *  - acionistas: diretos do FRE mais recente (até 6 por % do total) + 'Outros' + 'Ações em
 *    tesouraria'; só nome e % (decisão 5: nunca CPF/CNPJ do acionista);
 *  - circulação: definição CVM (distribuicao_capital) e nº de acionistas PF/PJ/institucionais; PN
 *    'não emite' quando a companhia não tem PN (tickers vigentes e o próprio FRE);
 *  - tag along por espécie com as duas bases (regras/acoes/tagAlong);
 *  - dividendo mínimo: % por regex sobre o texto do FRE 2022, trecho literal e o LINK_DOC do FRE
 *    vigente (texto, nunca baixado).
 * Cada parte traz o exercício do FRE e a data de entrega (DT_RECEB) — NUNCA a Data_Referencia, que
 * no FRE é futura (31/12 do ano do documento); DT_RECEB depois de hoje também não é exibida.
 *
 * `montarSocietario` é pura; `obterSocietario` lê o banco com cache em memória por ticker (30 min).
 * Só ação: FII/stock/reit ou ticker fora da área ⇒ null (a rota responde 404).
 */
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { linkFreSeguro } from '@/services/analiseAtivos/acoes/freArquivos';
import { obterLinhaQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  TTL_ANALISE_MS,
  hojeSaoPaulo,
  ok,
  type ResultadoLeitura,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { acionistasParaTela } from '@/services/analiseAtivos/regras/acoes/acionistas';
import {
  escolherDireitoDividendo,
  trechoDividendo,
} from '@/services/analiseAtivos/regras/acoes/dividendoMinimo';
import {
  normalizarSegmentoListagem,
  tagAlongPorEspecie,
} from '@/services/analiseAtivos/regras/acoes/tagAlong';
import {
  lerSocietarioCnpj,
  type DadosSocietarioDb,
} from '@/services/analiseAtivos/repositorio/societario';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';
import type { Estado } from '@/types/analiseAtivosApi';
import {
  ANO_FRE_DIREITOS,
  type AcionistasFreApi,
  type CirculacaoFreApi,
  type DividendoMinimoApi,
  type MotivoSocietario,
  type SocietarioResposta,
  type TagAlongEspecieApi,
} from '@/types/analiseAtivosComplementos';

const T = TEXTOS_SOCIETARIO;

function ausente<T>(motivo: MotivoSocietario, texto: string = T.motivos[motivo]): Estado<T> {
  return { estado: 'ausente', motivo, texto };
}

function numero(n: number | null, motivo: MotivoSocietario): Estado<number> {
  return typeof n === 'number' && Number.isFinite(n) ? ok(n) : ausente(motivo);
}

const NAO_EMITE: Estado<number> = {
  estado: 'nao_se_aplica',
  motivo: 'nao_emite',
  texto: T.circulacao.naoEmite,
};

/** DT_RECEB exibível: nunca depois de hoje. */
export function dtRecebExibivel(dtReceb: string | null, hoje: string): string | null {
  return dtReceb && dtReceb <= hoje ? dtReceb : null;
}

/** A companhia emite PN hoje: ticker PN vigente, ou PN em circulação/na posição do FRE. */
export function emitePn(d: DadosSocietarioDb): boolean {
  if (d.classesTickers.includes('PN')) return true;
  if ((d.societario?.pctCirculacaoPn ?? 0) > 0) return true;
  return d.posicao.some((p) => (p.pctPn ?? 0) > 0);
}

export function rotuloSegmento(segmento: string | null): string {
  return T.tagAlong.segmentos[normalizarSegmentoListagem(segmento)];
}

export function montarSocietario(
  ticker: string,
  d: DadosSocietarioDb,
  segmentoListagem: string | null,
  hoje: string,
): SocietarioResposta {
  const soc = d.societario;
  const pn = emitePn(d);
  const ref = soc ? { anoFre: soc.anoFre, dtReceb: dtRecebExibivel(soc.dtReceb, hoje) } : null;

  let acionistas: Estado<AcionistasFreApi>;
  if (!soc || !ref) acionistas = ausente('sem_fre');
  else {
    const lista = acionistasParaTela(d.posicao, { emitePn: pn });
    acionistas =
      lista.length > 0
        ? { estado: 'ok', valor: { ...ref, acionistas: lista } }
        : ausente('sem_fre', T.acionistas.semPosicao);
  }

  let circulacao: Estado<CirculacaoFreApi>;
  if (!soc || !ref) circulacao = ausente('sem_fre');
  else if (
    soc.pctCirculacaoOn === null &&
    soc.pctCirculacaoPn === null &&
    soc.pctCirculacaoTotal === null
  ) {
    circulacao = ausente('sem_distribuicao_capital');
  } else {
    circulacao = {
      estado: 'ok',
      valor: {
        ...ref,
        pctOn: numero(soc.pctCirculacaoOn, 'sem_distribuicao_capital'),
        pctPn: pn ? numero(soc.pctCirculacaoPn, 'sem_distribuicao_capital') : NAO_EMITE,
        pctTotal: numero(soc.pctCirculacaoTotal, 'sem_distribuicao_capital'),
        nAcionistasPf: soc.nAcionistasPf,
        nAcionistasPj: soc.nAcionistasPj,
        nAcionistasInst: soc.nAcionistasInst,
      },
    };
  }

  const tagAlong: Estado<TagAlongEspecieApi[]> = {
    estado: 'ok',
    valor: tagAlongPorEspecie({
      segmentoListagem,
      emitePn: pn,
      emiteUnit: d.classesTickers.includes('UNIT'),
      declarados: d.direitos,
    }),
  };

  const link = linkFreSeguro(soc?.linkDocFre);
  const linha = escolherDireitoDividendo(d.direitos);
  let dividendoMinimo: Estado<DividendoMinimoApi>;
  if (!linha && !link) dividendoMinimo = ausente('sem_fre', T.dividendoMinimo.semFre2022);
  else {
    dividendoMinimo = {
      estado: 'ok',
      valor: {
        anoFre: ANO_FRE_DIREITOS,
        pctLucroAjustado: !linha
          ? ausente('sem_fre', T.dividendoMinimo.semFre2022)
          : linha.pctDividendoMinimo !== null
            ? ok(linha.pctDividendoMinimo)
            : ausente('remete_outro_item'),
        trecho: trechoDividendo(linha?.direitoDividendoTexto),
        linkFreVigente: link,
      },
    };
  }

  return {
    ticker,
    acionistas,
    circulacao,
    tagAlong,
    dividendoMinimo,
    segmentoListagem: rotuloSegmento(segmentoListagem),
    versao: `fre-${soc?.anoFre ?? 0}v${soc?.versao ?? 0}-${ANO_FRE_DIREITOS}`,
  };
}

const cache = getTtlCache<SocietarioResposta>('analise-ativos:societario');

export function _limparCacheSocietario(ticker: string): void {
  cache.del(ticker.toUpperCase());
}

export async function obterSocietario(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoLeitura<SocietarioResposta> | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha || linha.classe !== 'acao') return null;
  const emCache = cache.get(symbol);
  if (emCache) return { dados: emCache, cache: true };
  const dados = await lerSocietarioCnpj(prisma, linha.cnpj);
  const r = montarSocietario(symbol, dados, linha.segmentoListagem ?? null, hoje);
  cache.set(symbol, r, TTL_ANALISE_MS);
  return { dados: r, cache: false };
}
