/**
 * Leitura da seção "Imóveis e composição do fundo" da página do FII (A6, itens 1 e 2; fatia A).
 * Só o banco (nenhuma fonte externa na requisição):
 *
 * - composição: o último informe mensal do CNPJ com ativo total e composição (fii_monthly, janela de
 *   JANELA_MENSAL_MESES) ⇒ montarComposicaoFii (6 fatias sobre o ativo total);
 * - lista: o último trimestre gravado em fii_imovel_trimestral (janela de JANELA_TRIMESTRAL_MESES)
 *   + os setores do mesmo trimestre ⇒ montarListaImoveis. Papel e FoF: 'não se aplica' (nem lê).
 *   A vacância do resumo é a MESMA célula do Essencial (última linha: 'Últ. 12m' ou o último ano).
 * - ticker↔CNPJ em conferência (flag do Quadro): as duas partes 'sem dado · … em conferência' (o
 *   informe pode ser de outro fundo; nem é lido).
 *
 * null ⇒ a rota responde 404: ticker fora da área, ação, ou FII sem nenhum informe (nem mensal com
 * composição nem trimestral com imóveis) nas janelas. Cache em memória por ticker:versão do Quadro
 * (30 min, o mesmo dos outros blocos da página).
 */
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import {
  hojeSaoPaulo,
  obterFundamentosEssencial,
  semDado,
  type ResultadoLeitura,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { obterLinhaQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  montarComposicaoFii,
  temComposicao,
  type EntradaComposicaoFii,
} from '@/services/analiseAtivos/regras/fii/composicaoFii';
import {
  montarListaImoveis,
  type ImovelLido,
  type SetorLido,
} from '@/services/analiseAtivos/regras/fii/listaImoveis';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { Estado, FiiTipoTela } from '@/types/analiseAtivosApi';
import type { ComposicaoFiiApi, ImoveisFiiResposta } from '@/types/analiseAtivosComplementos';

/** Informe mensal mais antigo aceito como "recente" (meses antes de hoje). */
export const JANELA_MENSAL_MESES = 13;
/** Informe trimestral mais antigo aceito como "recente" (meses antes de hoje: ~5 trimestres). */
export const JANELA_TRIMESTRAL_MESES = 15;

const TTL_MS = 30 * 60_000;
const cache = getTtlCache<ImoveisFiiResposta>('analiseAtivosImoveisFii');

/** Só para testes. */
export function _limparCacheImoveisFii(ticker: string, versao: string): void {
  cache.del(`${ticker}:${versao}`);
}

/** 'AAAA-MM-DD' menos n meses (dia 1), para o filtro das janelas. */
export function mesesAntes(hoje: string, n: number): string {
  const d = new Date(`${hoje.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

function emConferencia(): Estado<ComposicaoFiiApi> {
  return {
    estado: 'ausente',
    motivo: 'cnpj_em_conferencia',
    texto: TEXTOS_IMOVEIS_FII.motivos.cnpj_em_conferencia,
  };
}

/** Último informe mensal com composição (as linhas antigas de layout sem ativo/passivo ficam fora). */
async function lerMensal(cnpj: string, hoje: string): Promise<EntradaComposicaoFii | null> {
  const linhas = await prisma.fiiMonthly.findMany({
    where: {
      cnpj,
      refMonth: { gte: deData(mesesAntes(hoje, JANELA_MENSAL_MESES)) },
      ativoTotal: { not: null },
    },
    orderBy: { refMonth: 'desc' },
    take: 3,
    select: {
      refMonth: true,
      ativoTotal: true,
      imoveis: true,
      spe: true,
      cri: true,
      lciLca: true,
      cotasFii: true,
      rendaFixa: true,
      acoes: true,
      valoresReceber: true,
    },
  });
  for (const l of linhas) {
    const e: EntradaComposicaoFii = {
      refMonth: paraData(l.refMonth),
      ativoTotal: paraNumero(l.ativoTotal),
      imoveis: paraNumero(l.imoveis),
      spe: paraNumero(l.spe),
      cri: paraNumero(l.cri),
      lciLca: paraNumero(l.lciLca),
      cotasFii: paraNumero(l.cotasFii),
      rendaFixa: paraNumero(l.rendaFixa),
      acoes: paraNumero(l.acoes),
      valoresReceber: paraNumero(l.valoresReceber),
    };
    if (temComposicao(e)) return e;
  }
  return null;
}

async function lerTrimestral(
  cnpj: string,
  hoje: string,
): Promise<{ refQuarter: string | null; imoveis: ImovelLido[]; setores: SetorLido[] }> {
  const ultimo = await prisma.fiiImovelTrimestral.findFirst({
    where: { cnpj, refQuarter: { gte: deData(mesesAntes(hoje, JANELA_TRIMESTRAL_MESES)) } },
    orderBy: { refQuarter: 'desc' },
    select: { refQuarter: true },
  });
  if (!ultimo) return { refQuarter: null, imoveis: [], setores: [] };
  const where = { cnpj, refQuarter: ultimo.refQuarter };
  const [imoveis, setores] = await Promise.all([
    prisma.fiiImovelTrimestral.findMany({
      where,
      orderBy: { ordem: 'asc' },
      select: {
        ordem: true,
        classe: true,
        nome: true,
        endereco: true,
        ufInferida: true,
        area: true,
        unidades: true,
        vacanciaPct: true,
        receitaPct: true,
      },
    }),
    prisma.fiiInquilinoSetorTrimestral.findMany({
      where,
      select: { setor: true, pctReceitaFii: true, placeholder: true },
    }),
  ]);
  return {
    refQuarter: paraData(ultimo.refQuarter),
    imoveis: imoveis.map((i) => ({ ...i, area: paraNumero(i.area) })),
    setores,
  };
}

/** A célula 'Vacância' da última linha do Essencial (falha de leitura = sem dado). */
async function vacanciaDoEssencial(symbol: string, hoje: string): Promise<Estado<number>> {
  try {
    const r = await obterFundamentosEssencial(symbol, hoje);
    const linhas = r?.dados.linhas ?? [];
    const ult12m = linhas.find((l) => l.ano === null);
    const ultimoAno = [...linhas]
      .filter((l) => l.ano !== null)
      .sort((a, b) => (b.ano ?? 0) - (a.ano ?? 0))[0];
    return (ult12m ?? ultimoAno)?.valores.vacancia ?? semDado();
  } catch {
    return semDado();
  }
}

export async function obterImoveisFii(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoLeitura<ImoveisFiiResposta> | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha || linha.classe !== 'fii') return null;
  const versao = await versaoQuadro();
  const chave = `${symbol}:${versao}`;
  const emCache = cache.get(chave);
  if (emCache) return { dados: emCache, cache: true };

  const fiiTipo = (linha.fiiTipo as FiiTipoTela | null) ?? null;
  let dados: ImoveisFiiResposta;
  if (linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA)) {
    dados = {
      ticker: symbol,
      composicao: emConferencia(),
      imoveis: montarListaImoveis({
        refQuarter: null,
        imoveis: [],
        setores: [],
        vacancia: semDado(),
        fiiTipo,
        cnpjEmConferencia: true,
      }),
      versao,
    };
  } else {
    const semLista = fiiTipo === 'papel' || fiiTipo === 'fof';
    const [mensal, trimestral] = await Promise.all([
      lerMensal(linha.cnpj, hoje),
      semLista
        ? Promise.resolve({ refQuarter: null, imoveis: [], setores: [] })
        : lerTrimestral(linha.cnpj, hoje),
    ]);
    if (!mensal && trimestral.refQuarter === null) return null;
    const vacancia =
      trimestral.refQuarter !== null ? await vacanciaDoEssencial(symbol, hoje) : semDado();
    dados = {
      ticker: symbol,
      composicao: montarComposicaoFii(mensal),
      imoveis: montarListaImoveis({ ...trimestral, vacancia, fiiTipo }),
      versao,
    };
  }
  cache.set(chave, dados, TTL_MS);
  return { dados, cache: false };
}
