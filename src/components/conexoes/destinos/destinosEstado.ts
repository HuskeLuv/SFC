/**
 * Estado da revisão "Confira onde seus investimentos entraram" (destino na importação Open
 * Finance, out/2026 — docs/pluggy-importar-destino/). PURO: sem React, sem fetch.
 *
 * Nenhuma regra de destino nem texto de motivo mora aqui: o que vale para cada item vem de
 * `item.opcoes` (GET /api/carteira/mover do servidor) lido por `escolhaValeParaItem` e
 * `intersecaoDestinos` (src/lib/pluggyDestinos.ts). A sugestão é onde a importação colocou o
 * investimento (`opcoes.atual`); a escolha só existe quando difere dela.
 */
import {
  GRUPOS_DESTINO,
  ROTULO_GRUPO_DESTINO,
  escolhaValeParaItem,
  intersecaoDestinos,
  type AplicarDestinosBody,
  type DestinoComum,
  type DestinoImportadoItem,
  type ErroDestinoItem,
  type GrupoDestino,
} from '@/lib/pluggyDestinos';
import {
  AVISO_LIQUIDEZ_RESERVA,
  type CategoriaMovivel,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';

/** Aba + seção escolhidas (`subgrupo` null = a aba não tem seção escolhível). */
export interface EscolhaItem {
  categoria: CategoriaMovivel;
  subgrupo: string | null;
}

export interface EstadoDestinos {
  /** bankInvestmentId → escolha diferente da sugestão. */
  escolhas: Record<string, EscolhaItem>;
  /** Caixas marcadas (só no computador). */
  selecionados: Set<string>;
  /** Já gravados numa tentativa anterior (resultado parcial): saem do próximo POST. */
  salvos: Set<string>;
  /** bankInvestmentId → motivo da última falha (409 ou parcial). */
  falhas: Record<string, string>;
}

export const estadoInicial = (): EstadoDestinos => ({
  escolhas: {},
  selecionados: new Set(),
  salvos: new Set(),
  falhas: {},
});

/** Item com escolha: 'para-revisar', com as opções do mover e movível. */
export type ItemRevisavel = DestinoImportadoItem & { opcoes: MoverOpcoesResponse };

export const ehRevisavel = (item: DestinoImportadoItem): item is ItemRevisavel =>
  item.situacao === 'para-revisar' && !!item.opcoes && item.opcoes.movivel;

/** A escolha é a própria sugestão (onde a importação colocou)? */
export function ehSugestao(opcoes: MoverOpcoesResponse, escolha: EscolhaItem): boolean {
  if (escolha.categoria !== opcoes.atual.categoria) return false;
  if (escolha.subgrupo === null) return true;
  return escolha.subgrupo === opcoes.atual.subgrupo;
}

const semChave = <T>(registro: Record<string, T>, id: string): Record<string, T> => {
  if (!(id in registro)) return registro;
  const copia = { ...registro };
  delete copia[id];
  return copia;
};

/**
 * Escolhe um destino para o item. Volta à sugestão quando a escolha é ela; ignora destino que
 * o servidor não oferece/permite (a UI só mostra os permitidos). Limpa a falha do item.
 */
export function escolher(
  estado: EstadoDestinos,
  item: ItemRevisavel,
  categoria: CategoriaMovivel,
  subgrupo?: string | null,
): EstadoDestinos {
  const vale = escolhaValeParaItem(item.opcoes, categoria, subgrupo);
  if (!vale.ok) return estado;
  const escolha: EscolhaItem = { categoria, subgrupo: vale.subgrupo };
  const id = item.bankInvestmentId;
  const falhas = semChave(estado.falhas, id);
  if (ehSugestao(item.opcoes, escolha)) {
    return { ...estado, escolhas: semChave(estado.escolhas, id), falhas };
  }
  return { ...estado, escolhas: { ...estado.escolhas, [id]: escolha }, falhas };
}

export function voltarASugestao(estado: EstadoDestinos, id: string): EstadoDestinos {
  return {
    ...estado,
    escolhas: semChave(estado.escolhas, id),
    falhas: semChave(estado.falhas, id),
  };
}

export function alternarSelecao(estado: EstadoDestinos, id: string): EstadoDestinos {
  const selecionados = new Set(estado.selecionados);
  if (selecionados.has(id)) selecionados.delete(id);
  else selecionados.add(id);
  return { ...estado, selecionados };
}

/** "Marcar todos" da faixa: marca (ou desmarca) todos os ids. */
export function marcarVarios(
  estado: EstadoDestinos,
  ids: readonly string[],
  marcar: boolean,
): EstadoDestinos {
  const selecionados = new Set(estado.selecionados);
  for (const id of ids) {
    if (marcar) selecionados.add(id);
    else selecionados.delete(id);
  }
  return { ...estado, selecionados };
}

export const limparSelecao = (estado: EstadoDestinos): EstadoDestinos => ({
  ...estado,
  selecionados: new Set(),
});

/** Itens revisáveis marcados (na ordem da lista). */
export const marcados = (
  itens: readonly DestinoImportadoItem[],
  selecionados: ReadonlySet<string>,
): ItemRevisavel[] =>
  itens.filter((i): i is ItemRevisavel => ehRevisavel(i) && selecionados.has(i.bankInvestmentId));

/** Destinos aceitos por TODOS os marcados (interseção das opções do servidor). */
export function destinosDoLote(
  itens: readonly DestinoImportadoItem[],
  selecionados: ReadonlySet<string>,
): DestinoComum[] {
  return intersecaoDestinos(marcados(itens, selecionados).map((i) => i.opcoes));
}

/**
 * Aplica um destino comum a um conjunto de itens (lote do computador: os marcados; "Trocar
 * todos" do celular: os da faixa). Cada item valida pelas próprias opções; uma seção que não
 * existe nele cai no `subgrupoSugerido` dele. Limpa a seleção.
 */
export function aplicarLote(
  itens: readonly ItemRevisavel[],
  estado: EstadoDestinos,
  destino: EscolhaItem,
): EstadoDestinos {
  let proximo = estado;
  for (const item of itens) {
    proximo = escolher(proximo, item, destino.categoria, destino.subgrupo);
  }
  return limparSelecao(proximo);
}

/** Escolha vigente do item: a do usuário ou a sugestão. */
export function escolhaAtual(item: ItemRevisavel, estado: EstadoDestinos): EscolhaItem {
  const escolha = estado.escolhas[item.bankInvestmentId];
  if (escolha) return escolha;
  return {
    categoria: item.opcoes.atual.categoria as CategoriaMovivel,
    subgrupo: item.opcoes.atual.subgrupo,
  };
}

export const itemMudou = (item: DestinoImportadoItem, estado: EstadoDestinos): boolean =>
  !estado.salvos.has(item.bankInvestmentId) && item.bankInvestmentId in estado.escolhas;

/** Investimentos que mudam de lugar no próximo salvamento. */
export function mudancas(
  itens: readonly DestinoImportadoItem[],
  estado: EstadoDestinos,
): ItemRevisavel[] {
  return itens.filter((i): i is ItemRevisavel => ehRevisavel(i) && itemMudou(i, estado));
}

export const contarMudancas = (
  itens: readonly DestinoImportadoItem[],
  estado: EstadoDestinos,
): number => mudancas(itens, estado).length;

/**
 * Corpo do POST /api/pluggy/carteira/destinos:
 * - itens = só o que difere da sugestão;
 * - confirmarIds = todos os 'para-revisar' EXIBIDOS (inclusive os mantidos), nunca "todos do
 *   escopo" — o que chegar por outra sincronização com a revisão aberta continua na fila.
 * Os já gravados numa tentativa anterior ficam de fora.
 */
export type CorpoDestinos = AplicarDestinosBody & { confirmarIds: string[] };

export function corpoDoPost(
  itens: readonly DestinoImportadoItem[],
  estado: EstadoDestinos,
): CorpoDestinos {
  const pendentes = itens.filter(
    (i) => i.situacao === 'para-revisar' && !estado.salvos.has(i.bankInvestmentId),
  );
  return {
    itens: mudancas(itens, estado).map((i) => {
      const escolha = estado.escolhas[i.bankInvestmentId];
      return {
        id: i.bankInvestmentId,
        categoria: escolha.categoria,
        ...(escolha.subgrupo ? { subgrupo: escolha.subgrupo } : {}),
      };
    }),
    confirmarIds: pendentes.map((i) => i.bankInvestmentId),
  };
}

/** Marca as falhas por item (409 ou parcial), preservando as escolhas. */
export function comFalhas(
  estado: EstadoDestinos,
  erros: readonly ErroDestinoItem[],
): EstadoDestinos {
  const falhas: Record<string, string> = {};
  for (const e of erros) falhas[e.id] = e.motivo;
  return { ...estado, falhas };
}

/**
 * Resultado parcial: os que deram certo viram "salvos" (saem do próximo POST); os que falharam
 * mantêm a escolha e o motivo, para "Tentar de novo".
 */
export function aposParcial(
  itens: readonly DestinoImportadoItem[],
  estado: EstadoDestinos,
  erros: readonly ErroDestinoItem[],
): EstadoDestinos {
  const comErro = new Set(erros.map((e) => e.id));
  const enviados = corpoDoPost(itens, estado);
  const salvos = new Set(estado.salvos);
  for (const id of [...enviados.itens.map((i) => i.id), ...enviados.confirmarIds]) {
    if (!comErro.has(id)) salvos.add(id);
  }
  return { ...comFalhas(estado, erros), salvos, selecionados: new Set() };
}

// ── Rótulos (dados do servidor) ──────────────────────────────────────────────

/** "Fundos › Fiagro", "Renda Fixa › Pós-fixada" (seção derivada) ou só "Reserva Emergência". */
export function rotuloEscolha(opcoes: MoverOpcoesResponse, escolha: EscolhaItem): string {
  const destino = opcoes.destinos.find((d) => d.categoria === escolha.categoria);
  const aba = destino?.label ?? escolha.categoria;
  if (escolha.subgrupo) {
    const secao = destino?.subgrupos.find((s) => s.id === escolha.subgrupo)?.label;
    return secao ? `${aba} › ${secao}` : aba;
  }
  const automatica = destino?.secaoAutomatica?.label;
  return automatica ? `${aba} › ${automatica}` : aba;
}

/** Rótulo de um destino comum do lote. */
export const rotuloComum = (destino: DestinoComum, subgrupo: string | null): string => {
  const secao = subgrupo ? destino.subgrupos.find((s) => s.id === subgrupo)?.label : null;
  return secao ? `${destino.label} › ${secao}` : destino.label;
};

/** Opções planas do seletor do lote ("FII's › Tijolo", "Reserva Emergência"…). */
export interface OpcaoLote {
  valor: string;
  rotulo: string;
  escolha: EscolhaItem;
}

export function opcoesDoLote(comuns: readonly DestinoComum[]): OpcaoLote[] {
  return comuns.flatMap<OpcaoLote>((d) =>
    d.subgrupos.length === 0
      ? [
          {
            valor: `${d.categoria}|`,
            rotulo: d.label,
            escolha: { categoria: d.categoria, subgrupo: null },
          },
        ]
      : d.subgrupos.map((s) => ({
          valor: `${d.categoria}|${s.id}`,
          rotulo: `${d.label} › ${s.label}`,
          escolha: { categoria: d.categoria, subgrupo: s.id },
        })),
  );
}

/** Rótulo do lugar onde o item está hoje (sugestão), vindo do servidor. */
export const rotuloSugestao = (item: DestinoImportadoItem): string =>
  item.atual?.rotulo ??
  (item.opcoes ? rotuloEscolha(item.opcoes, escolhaAtualSemEstado(item)) : '');

const escolhaAtualSemEstado = (item: DestinoImportadoItem): EscolhaItem => ({
  categoria: (item.opcoes?.atual.categoria ?? 'acoes') as CategoriaMovivel,
  subgrupo: item.opcoes?.atual.subgrupo ?? null,
});

/** Rótulo do lugar vigente (escolha ou sugestão). */
export function rotuloVigente(item: DestinoImportadoItem, estado: EstadoDestinos): string {
  if (!ehRevisavel(item)) return rotuloSugestao(item);
  const escolha = estado.escolhas[item.bankInvestmentId];
  return escolha ? rotuloEscolha(item.opcoes, escolha) : rotuloSugestao(item);
}

/**
 * Dica "pode servir de reserva" (decisão 5): o item segue sugerido em Renda Fixa e o servidor
 * aceita a Reserva de Emergência para ele SEM o aviso de liquidez. Só lê `opcoes`.
 */
export function podeServirDeReserva(item: DestinoImportadoItem): boolean {
  const opcoes = item.opcoes;
  if (!opcoes?.movivel || opcoes.atual.categoria !== 'rendaFixaFundos') return false;
  const reserva = opcoes.destinos.find((d) => d.categoria === 'reservaEmergencia');
  return !!reserva?.permitido && !reserva.avisos.includes(AVISO_LIQUIDEZ_RESERVA);
}

/** "KNCA11" (bolsa/fundos) ou o nome (CDB, saldo). */
export const rotuloItem = (item: DestinoImportadoItem): string => item.ticker || item.nome;

// ── Faixas ───────────────────────────────────────────────────────────────────

export interface FaixaDestinos {
  grupo: GrupoDestino;
  rotulo: string;
  itens: DestinoImportadoItem[];
  /** Ids com escolha (para "marcar todos" / "Trocar todos"). */
  revisaveis: string[];
}

/** Itens agrupados pela faixa do servidor, na ordem de GRUPOS_DESTINO. */
export function agruparFaixas(itens: readonly DestinoImportadoItem[]): FaixaDestinos[] {
  return GRUPOS_DESTINO.map((grupo) => {
    const daFaixa = itens.filter((i) => i.grupo === grupo);
    return {
      grupo,
      rotulo: ROTULO_GRUPO_DESTINO[grupo],
      itens: daFaixa,
      revisaveis: daFaixa.filter(ehRevisavel).map((i) => i.bankInvestmentId),
    };
  }).filter((f) => f.itens.length > 0);
}

export const plural = (n: number, um: string, varios: string): string =>
  `${n} ${n === 1 ? um : varios}`;
