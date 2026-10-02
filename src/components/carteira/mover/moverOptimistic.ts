/**
 * Atualização otimista do cache de uma aba da Carteira ao mover um item
 * (out/2026). Puro: recebe o JSON da rota da aba (`queryKeys.assets.type(...)`)
 * e devolve um novo objeto — nunca muta o original (o rollback usa o anterior).
 *
 * - Mesma aba: `moverLinhaEntreSecoes` troca o campo de seção da linha
 *   (`CAMPO_SECAO_NA_LINHA`), tira a linha da seção de origem, põe na de destino
 *   (criando a seção se não existir; a origem vazia é removida), recalcula as
 *   somas das duas seções e marca a linha com `_pendente: true` ("Movendo…").
 * - Outra aba: `removerLinha` tira a linha da aba de origem e desconta os totais.
 *
 * - Reservas (fase 2): lista única `{ ativos }` — `removerLinhaReserva`.
 *
 * O refetch depois da mutação traz os números exatos do servidor; aqui só
 * importa a linha aparecer no lugar certo com totais coerentes.
 */
import {
  CAMPO_SECAO_NA_LINHA,
  CATEGORIA_API_PATH,
  rotuloSubgrupo,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';
import { queryKeys } from '@/lib/queryKeys';

type Linha = Record<string, unknown> & { id: string };
type Secao = Record<string, unknown> & { ativos: Linha[] };
export type DadosAba = Record<string, unknown> & {
  secoes: Secao[];
  totalGeral?: Record<string, unknown>;
};

/** Marca da linha durante a mutação (60% de opacidade + "Movendo…"). */
export const CAMPO_PENDENTE = '_pendente';

/** Soma da seção ← campo da linha. Só as chaves presentes na seção são recalculadas. */
const TOTAIS_SECAO: Record<string, string> = {
  totalQuantidade: 'quantidade',
  totalProventos: 'proventos',
  totalValorAplicado: 'valorTotal',
  totalValorAtualizado: 'valorAtualizado',
  totalPercentualCarteira: 'percentualCarteira',
  totalRisco: 'riscoPorAtivo',
  totalObjetivo: 'objetivo',
  totalQuantoFalta: 'quantoFalta',
  totalNecessidadeAporte: 'necessidadeAporte',
  totalAporte: 'aporte',
  totalResgate: 'resgate',
};

/** Fundos: valor aplicado vem de `valorInicialAplicado` (sem `valorTotal`). */
const campoDaLinha = (linha: Linha, campo: string): number => {
  const valor =
    campo === 'valorTotal' && !('valorTotal' in linha) ? linha.valorInicialAplicado : linha[campo];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
};

/** Total geral ← campo da linha (desconto ao remover a linha da aba). */
const TOTAIS_GERAL: Record<string, string> = {
  quantidade: 'quantidade',
  valorAplicado: 'valorTotal',
  valorAtualizado: 'valorAtualizado',
  risco: 'riscoPorAtivo',
  objetivo: 'objetivo',
  quantoFalta: 'quantoFalta',
  necessidadeAporte: 'necessidadeAporte',
  proventos: 'proventos',
  aporte: 'aporte',
  resgate: 'resgate',
};

const recalcularSecao = (secao: Secao): Secao => {
  const nova: Secao = { ...secao };
  for (const [chave, campo] of Object.entries(TOTAIS_SECAO)) {
    if (chave in secao) {
      nova[chave] = secao.ativos.reduce((soma, linha) => soma + campoDaLinha(linha, campo), 0);
    }
  }
  if ('rentabilidadeMedia' in secao) {
    const peso = secao.ativos.reduce((s, l) => s + campoDaLinha(l, 'valorAtualizado'), 0);
    nova.rentabilidadeMedia =
      peso > 0
        ? secao.ativos.reduce(
            (s, l) => s + campoDaLinha(l, 'rentabilidade') * campoDaLinha(l, 'valorAtualizado'),
            0,
          ) / peso
        : 0;
  }
  return nova;
};

export interface LocalDaLinha {
  linha: Linha;
  secaoIndex: number;
}

export const encontrarLinha = (
  dados: DadosAba | null | undefined,
  id: string,
): LocalDaLinha | null => {
  if (!dados?.secoes) return null;
  for (let secaoIndex = 0; secaoIndex < dados.secoes.length; secaoIndex++) {
    const linha = dados.secoes[secaoIndex].ativos?.find((a) => a.id === id);
    if (linha) return { linha, secaoIndex };
  }
  return null;
};

/** Seção atual da linha (valor do campo de seção). */
export const secaoDaLinha = (
  dados: DadosAba | null | undefined,
  categoria: CategoriaMovivel,
  id: string,
): string | null => {
  const local = encontrarLinha(dados, id);
  if (!local) return null;
  const campo = CAMPO_SECAO_NA_LINHA[categoria];
  if (!campo) return null;
  const valor = local.linha[campo] ?? dados?.secoes[local.secaoIndex][campo];
  return typeof valor === 'string' ? valor : null;
};

/**
 * Move a linha `id` para a seção `subgrupo` da mesma aba. Sem a linha no cache,
 * devolve os dados como estão.
 */
export function moverLinhaEntreSecoes<T extends DadosAba>(
  dados: T,
  categoria: CategoriaMovivel,
  id: string,
  subgrupo: string,
): T {
  const local = encontrarLinha(dados, id);
  const campo = CAMPO_SECAO_NA_LINHA[categoria];
  if (!local || !campo) return dados;
  const linhaMovida: Linha = { ...local.linha, [campo]: subgrupo, [CAMPO_PENDENTE]: true };

  let secoes = dados.secoes.map((secao, i) =>
    i === local.secaoIndex ? { ...secao, ativos: secao.ativos.filter((a) => a.id !== id) } : secao,
  );

  const destinoIndex = secoes.findIndex((secao) => secao[campo] === subgrupo);
  if (destinoIndex >= 0) {
    secoes = secoes.map((secao, i) =>
      i === destinoIndex ? { ...secao, ativos: [...secao.ativos, linhaMovida] } : secao,
    );
  } else {
    // Seção nova: mesmas chaves de totais da origem, zeradas e recalculadas.
    const modelo = dados.secoes[local.secaoIndex];
    const nova: Secao = { ativos: [linhaMovida] };
    for (const chave of Object.keys(modelo)) {
      if (chave in TOTAIS_SECAO || chave === 'rentabilidadeMedia') nova[chave] = 0;
    }
    nova.nome = rotuloSubgrupo(categoria, subgrupo) ?? subgrupo;
    nova[campo] = subgrupo;
    secoes = [...secoes, nova];
  }

  const origem = secoes[local.secaoIndex];
  secoes = secoes
    .filter((secao) => secao !== origem || secao.ativos.length > 0)
    .map((secao) =>
      secao === origem || secao.ativos.some((a) => a.id === id) ? recalcularSecao(secao) : secao,
    );

  return { ...dados, secoes };
}

/** Tira a linha `id` da aba (troca de aba) e desconta os totais da seção e geral. */
export function removerLinha<T extends DadosAba>(dados: T, id: string): T {
  const local = encontrarLinha(dados, id);
  if (!local) return dados;
  const secoes = dados.secoes
    .map((secao, i) =>
      i === local.secaoIndex
        ? recalcularSecao({ ...secao, ativos: secao.ativos.filter((a) => a.id !== id) })
        : secao,
    )
    .filter((secao, i) => i !== local.secaoIndex || secao.ativos.length > 0);

  let totalGeral = dados.totalGeral;
  if (totalGeral) {
    totalGeral = { ...totalGeral };
    for (const [chave, campo] of Object.entries(TOTAIS_GERAL)) {
      const atual = totalGeral[chave];
      if (typeof atual === 'number') totalGeral[chave] = atual - campoDaLinha(local.linha, campo);
    }
  }
  return { ...dados, secoes, ...(totalGeral ? { totalGeral } : {}) };
}

// ── Reservas (fase 2, out/2026): lista única `{ ativos }`, sem seções ─────────────────────────

type Linhas = Record<string, unknown> & { id?: unknown };
/** JSON das rotas reserva-emergencia / reserva-oportunidade (useReserva*). */
export type DadosReserva = Record<string, unknown> & { ativos: Linhas[] };

export const isDadosReserva = (dados: unknown): dados is DadosReserva =>
  !!dados &&
  typeof dados === 'object' &&
  !('secoes' in dados) &&
  Array.isArray((dados as { ativos?: unknown }).ativos);

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Tira a linha `id` de uma aba de Reserva (troca de aba) e desconta o saldo inicial e o
 * rendimento. A rentabilidade fica como está até o refetch.
 */
export function removerLinhaReserva<T extends DadosReserva>(dados: T, id: string): T {
  const linha = dados.ativos.find((a) => a.id === id);
  if (!linha) return dados;
  const novo: DadosReserva = { ...dados, ativos: dados.ativos.filter((a) => a.id !== id) };
  const inicial = numero(linha.valorInicial);
  const base = inicial + numero(linha.aporte) - numero(linha.resgate);
  if (typeof dados.saldoInicioMes === 'number')
    novo.saldoInicioMes = dados.saldoInicioMes - inicial;
  if (typeof dados.rendimento === 'number') {
    novo.rendimento = dados.rendimento - (numero(linha.valorAtualizado) - base);
  }
  return novo as T;
}

/**
 * Cache da aba de uma categoria: as 6 da fase 1 e a Renda Fixa usam
 * queryKeys.assets.type(<rota>); as Reservas usam queryKeys.reserva.* (useReserva*).
 */
export const queryKeyDaAba = (categoria: CategoriaMovivel): readonly unknown[] => {
  if (categoria === 'reservaEmergencia') return queryKeys.reserva.emergencia();
  if (categoria === 'reservaOportunidade') return queryKeys.reserva.oportunidade();
  return queryKeys.assets.type(CATEGORIA_API_PATH[categoria]);
};
