/**
 * Linhas da tabela Salvos (bloco 1, fatia A): a linha do Quadro de cada ativo da lista, na classe
 * e na janela pedidas, + "Adicionado em" (createdAt do item) + a contagem ANTERIOR dos critérios
 * ("antes 5 de 6 · 16/10").
 *
 * - As linhas vêm de obterLinhasQuadroApi(classe, {janela}) (em memória, só banco) filtradas pelos
 *   symbols da lista; a ordem é a do Quadro (compararLinhas; padrão A–Z).
 * - Item que não está mais no Quadro (ou de classe reservada do bloco 4) vai para `foraDoQuadro`
 *   com o motivo — senão some da tela e não dá para remover.
 * - criteriosAnterior: do marco GLOBAL 'criterios:5' (analise_alerta_marcos, gravado pela fatia D),
 *   SÓ quando mudouEm > adicionadoEm (mudança anterior ao Salvar não é novidade para o usuário).
 *   A fatia A só LÊ a tabela.
 * - Nenhum número é gravado na lista: tudo é recalculado com os dados do dia.
 */
import { prisma } from '@/lib/prisma';
import {
  obterCriteriaParamsQuadro,
  obterLinhasQuadroApi,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { compararLinhas, definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { MARCO_CRITERIOS } from '@/services/analiseAtivos/salvos/contrato';
import {
  contagemDe,
  itensDaLista,
  paraResumoLista,
  type ListaRow,
} from '@/services/analiseAtivos/salvos/listasService';
import type { DirecaoOrdem, LinhaQuadroApi, OrdemQuadro } from '@/types/analiseAtivosApi';
import { JANELA_PADRAO, type Janela } from '@/types/analiseAtivosCriterios';
import type {
  ClasseItemReservada,
  ClasseItemSalvo,
  CriteriosAnterior,
  ItemForaDoQuadro,
  LinhaLista,
  LinhasListaResposta,
} from '@/types/analiseAtivosSalvos';

export interface ItemDaLista {
  symbol: string;
  classe: ClasseItemReservada;
  createdAt: Date;
}

/** marco 'criterios:5' como a fatia D grava (só os campos lidos aqui). */
interface MarcoCriteriosLido {
  anterior?: { atendidos?: unknown; aplicaveis?: unknown } | null;
  mudouEm?: unknown;
}

const ehInteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Contagem anterior do marco, só se a mudança é POSTERIOR ao item ter sido salvo. Marco ilegível,
 * sem `anterior` ou sem `mudouEm` ⇒ undefined.
 */
export function criteriosAnteriorDoMarco(
  marco: unknown,
  adicionadoEm: Date,
): CriteriosAnterior | undefined {
  if (!marco || typeof marco !== 'object') return undefined;
  const { anterior, mudouEm } = marco as MarcoCriteriosLido;
  if (!anterior || typeof mudouEm !== 'string') return undefined;
  const quando = new Date(mudouEm);
  if (Number.isNaN(quando.getTime()) || quando.getTime() <= adicionadoEm.getTime()) {
    return undefined;
  }
  if (!ehInteiro(anterior.atendidos) || !ehInteiro(anterior.aplicaveis)) return undefined;
  return {
    atendidos: anterior.atendidos,
    aplicaveis: anterior.aplicaveis,
    mudouEm: quando.toISOString(),
  };
}

export interface EntradaLinhasLista {
  classe: ClasseItemSalvo;
  itens: readonly ItemDaLista[];
  /** linhas do Quadro (noQuadro) da classe, na janela pedida */
  linhasQuadro: readonly LinhaQuadroApi[];
  /** symbol → marco 'criterios:5' */
  marcos: ReadonlyMap<string, unknown>;
  ordem?: OrdemQuadro;
  dir?: DirecaoOrdem;
}

/** Parte PURA: junta itens e linhas do Quadro, separa os de fora e ordena. */
export function montarLinhasDaLista(e: EntradaLinhasLista): {
  linhas: LinhaLista[];
  foraDoQuadro: ItemForaDoQuadro[];
} {
  const porSymbol = new Map(e.linhasQuadro.map((l) => [l.ticker, l]));
  const linhas: LinhaLista[] = [];
  const foraDoQuadro: ItemForaDoQuadro[] = [];
  for (const item of e.itens) {
    const adicionadoEm = item.createdAt.toISOString();
    if (item.classe !== 'acao' && item.classe !== 'fii') {
      foraDoQuadro.push({
        ticker: item.symbol,
        classe: item.classe,
        motivo: 'classe_reservada',
        adicionadoEm,
      });
      continue;
    }
    if (item.classe !== e.classe) continue;
    const linha = porSymbol.get(item.symbol);
    if (!linha) {
      foraDoQuadro.push({
        ticker: item.symbol,
        classe: item.classe,
        motivo: 'fora_do_quadro',
        adicionadoEm,
      });
      continue;
    }
    const anterior = criteriosAnteriorDoMarco(e.marcos.get(item.symbol), item.createdAt);
    linhas.push({ ...linha, adicionadoEm, ...(anterior ? { criteriosAnterior: anterior } : {}) });
  }
  linhas.sort(compararLinhas(e.ordem ?? 'ticker', e.dir ?? 'asc'));
  foraDoQuadro.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { linhas, foraDoQuadro };
}

/** Marcos 'criterios:5' dos symbols (tabela global, sem dado pessoal). */
export async function marcosCriterios(symbols: readonly string[]): Promise<Map<string, unknown>> {
  if (symbols.length === 0) return new Map();
  const rows = await prisma.analiseAlertaMarco.findMany({
    where: { tipo: MARCO_CRITERIOS, symbol: { in: [...symbols] } },
    select: { symbol: true, marco: true },
  });
  return new Map(rows.map((r) => [r.symbol, r.marco]));
}

/** GET /listas/[id]: a lista (já conferida como do usuário) na classe/janela/ordem pedidas. */
export async function linhasDaLista(
  userId: string,
  lista: ListaRow,
  params: { classe: ClasseItemSalvo; janela?: Janela; ordem?: OrdemQuadro; dir?: DirecaoOrdem },
): Promise<LinhasListaResposta> {
  const janela = params.janela ?? JANELA_PADRAO;
  const itens = await itensDaLista(userId, lista.id);
  const daClasse = itens.filter((i) => i.classe === params.classe).map((i) => i.symbol);
  const [linhasQuadro, marcos, criteriaParams] = await Promise.all([
    obterLinhasQuadroApi(params.classe, { janela }),
    marcosCriterios(daClasse),
    obterCriteriaParamsQuadro(),
  ]);
  const { linhas, foraDoQuadro } = montarLinhasDaLista({
    classe: params.classe,
    itens,
    linhasQuadro,
    marcos,
    ordem: params.ordem,
    dir: params.dir,
  });
  const contagem = contagemDe(itens);
  return {
    lista: paraResumoLista(lista, contagem),
    classe: params.classe,
    janela,
    contagem,
    linhas,
    foraDoQuadro,
    definicoes: definicoesQuadro(params.classe, criteriaParams),
  };
}
