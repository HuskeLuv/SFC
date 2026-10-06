/**
 * Escolher o destino na importação Open Finance (out/2026) — serviço do
 * servidor (fatia A). Contratos em src/lib/pluggyDestinos.ts; desenho em
 * docs/pluggy-importar-destino/ (decisoes.md prevalece).
 *
 * "Entra e confere": a importação (importarCarteira.ts, intocada) continua
 * automática e põe o investimento no lugar sugerido. Este serviço:
 *  - classifica: marca `destinoConfirmadoEm` dos importados SEM escolha (não
 *    revisáveis), para a contagem "para conferir" ser um count barato;
 *  - conta e lista os itens com a situação de cada um;
 *  - aplica as escolhas: valida TODAS antes de gravar (nada muda se alguma não
 *    pode) e grava item a item pelo moverInvestimento.
 *
 * Regra ÚNICA: "revisável" e a validação vêm do mover (resumoDestinos,
 * planejarMover, obterOpcoesMover) — nenhuma regra de destino nem texto de
 * motivo aqui.
 */
import type { BankInvestment } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import {
  abaIdDaCategoria,
  isCategoriaMovivelTodas,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';
import {
  MAX_ITENS_DESTINO,
  GRUPOS_DESTINO,
  pluggyDestinosHabilitado,
  revisavelDoResumo,
  type AplicarDestinosInput,
  type AplicarDestinosResponse,
  type DestinoAtualResumo,
  type DestinoImportadoItem,
  type DestinosImportadosResponse,
  type ErroDestinoItem,
  type GrupoDestino,
  type ResumoDestinos,
  type SituacaoDestino,
  type ViaSugestao,
} from '@/lib/pluggyDestinos';
import {
  MSG_NAO_ENCONTRADO,
  carregarItemMover,
  exigirEstadoMovivel,
  moverInvestimento,
  opcoesMoverDoItem,
  planejarMover,
  resumoDestinos,
  secaoRendaFixaDoItem,
  type ItemMover,
  type PlanoMover,
} from '@/services/portfolio/moverInvestimento';
import type { MoverRegistro } from '@/services/changeHistory/moverHelpers';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';
import { origemTipoFiiImportado } from './secaoImportada';

/** Item que deixou de estar "para conferir" entre a tela e o salvar. */
export const MSG_SITUACAO_DESTINO =
  'Este investimento já foi conferido ou não está mais na Carteira';
export const MSG_DESTINOS_INDISPONIVEL = 'Recurso indisponível';

/** Concorrência das leituras por item (carregarItemMover / opcoesMoverDoItem). */
const CONCORRENCIA = 5;

async function mapaComLimite<T, R>(lista: readonly T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(lista.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < lista.length) {
      const i = proximo++;
      saida[i] = await fn(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, lista.length) }, trabalhador));
  return saida;
}

/** Candidatos à fila: importados, ainda no banco, sem confirmação e com posição. */
const whereCandidatos = (userId: string, connectionId?: string) => ({
  userId,
  ...(connectionId ? { connectionId } : {}),
  importStatus: 'importado',
  ativo: true,
  destinoConfirmadoEm: null,
  portfolioId: { not: null },
});

const marcarConfirmados = async (userId: string, ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;
  const r = await prisma.bankInvestment.updateMany({
    where: { id: { in: ids }, userId, importStatus: 'importado', destinoConfirmadoEm: null },
    data: { destinoConfirmadoEm: new Date() },
  });
  return r.count;
};

// ── Classificação (sync, importar, listagem) ─────────────────────────────────

/**
 * Marca como conferidos os importados SEM escolha (previdência, não movível,
 * aba com uma seção só). Roda com a chave desligada também (só grava a coluna).
 * Posição apagada fica como está (fora da fila pela contagem). Devolve quantos marcou.
 */
export async function classificarDestinos(
  userId: string,
  { limite = MAX_ITENS_DESTINO }: { limite?: number } = {},
): Promise<number> {
  const candidatos = await prisma.bankInvestment.findMany({
    where: whereCandidatos(userId),
    select: { id: true, portfolioId: true },
    orderBy: { createdAt: 'asc' },
    take: limite,
  });
  const semEscolha = await mapaComLimite(candidatos, async (c) => {
    const item = await carregarItemMover(userId, 'posicao', c.portfolioId!);
    return item && !revisavelDoResumo(resumoDestinos(item)) ? c.id : null;
  });
  return marcarConfirmados(
    userId,
    semEscolha.filter((id): id is string => id !== null),
  );
}

/**
 * Quantos investimentos estão "para conferir" (no máximo 2 queries). Conta
 * com a classificação já feita: candidatos cuja posição ainda existe. 0 com a
 * chave desligada.
 */
export async function contarParaRevisar(
  userId: string,
  { connectionId }: { connectionId?: string } = {},
): Promise<number> {
  if (!pluggyDestinosHabilitado()) return 0;
  const candidatos = await prisma.bankInvestment.findMany({
    where: whereCandidatos(userId, connectionId),
    select: { portfolioId: true },
  });
  const ids = [...new Set(candidatos.map((c) => c.portfolioId!))];
  if (ids.length === 0) return 0;
  return prisma.portfolio.count({ where: { userId, id: { in: ids } } });
}

// ── Leitura ──────────────────────────────────────────────────────────────────

const destinoAtualDe = (r: ResumoDestinos): DestinoAtualResumo => {
  const categoria: CategoriaCarteira = r.atual.categoria;
  const label = rotuloCategoria(categoria);
  const subgrupoLabel = isCategoriaMovivelTodas(categoria)
    ? rotuloSubgrupo(categoria, r.atual.subgrupo)
    : null;
  return {
    categoria,
    abaId: abaIdDaCategoria(categoria),
    label,
    subgrupoLabel,
    rotulo: subgrupoLabel ? `${label} › ${subgrupoLabel}` : label,
  };
};

const GRUPO_DA_CATEGORIA: Partial<Record<CategoriaCarteira, GrupoDestino>> = {
  acoes: 'acoes',
  fiis: 'fiis',
  etfs: 'etfs',
  stocks: 'stocks',
  reits: 'reits',
  rendaFixaFundos: 'rf',
  reservaEmergencia: 'rf',
  reservaOportunidade: 'rf',
  fimFia: 'fundos',
};

/** Faixa pela aba base (o lugar sugerido); abas fixas (previdência…) → 'previdencia'. */
const grupoDoResumo = (r: ResumoDestinos): GrupoDestino =>
  GRUPO_DA_CATEGORIA[r.atual.base ?? r.atual.categoria] ?? 'previdencia';

/** Faixa de um item sem posição na Carteira, pelo tipo do banco. */
const grupoDoBanco = (inv: Pick<BankInvestment, 'type' | 'subtype'>): GrupoDestino => {
  if (inv.subtype === 'REAL_ESTATE_FUND') return 'fiis';
  switch (inv.type) {
    case 'EQUITY':
      return 'acoes';
    case 'ETF':
      return 'etfs';
    case 'MUTUAL_FUND':
      return 'fundos';
    case 'FIXED_INCOME':
    case 'COE':
      return 'rf';
    default:
      return 'previdencia';
  }
};

/**
 * De onde veio a sugestão (só para 'para-revisar' sem override). FII: recalcula
 * o ramo de tipoFiiImportado e só mostra se ele ainda dá a seção exibida (o
 * usuário pode ter mudado o tipoFii à mão). RF: indexador ou título.
 */
async function viaDaSugestao(item: ItemMover, r: ResumoDestinos): Promise<ViaSugestao | null> {
  if (r.atual.override) return null;
  switch (r.atual.categoria) {
    case 'fiis': {
      const origem = await origemTipoFiiImportado(item.asset.symbol, item.asset.name);
      return origem.tipoFii === r.atual.subgrupo ? origem.via : null;
    }
    case 'rendaFixaFundos':
      return secaoRendaFixaDoItem(item).via;
    case 'fimFia':
      return 'tipoFundo';
    case 'acoes':
    case 'etfs':
    case 'stocks':
    case 'reits':
      return 'padrao';
    default:
      return null;
  }
}

/** Faixa da revisão: "já estava" e "cadastrar à mão" pela situação; o resto pela aba. */
const grupoDe = (
  situacao: SituacaoDestino,
  resumo: ResumoDestinos | null,
  inv: Pick<BankInvestment, 'type' | 'subtype'>,
): GrupoDestino => {
  if (situacao === 'ja-estava' || situacao === 'sem-suporte') return situacao;
  return resumo ? grupoDoResumo(resumo) : grupoDoBanco(inv);
};

const TICKER_RE = /^[A-Z0-9]{4,7}$/;

type InvestimentoLista = BankInvestment & { connection: { connectorName: string } };

interface Classificado {
  inv: InvestimentoLista;
  item: ItemMover | null;
  resumo: ResumoDestinos | null;
  situacao: SituacaoDestino;
}

/** Situação de um investimento (calculada só no servidor). */
async function classificar(userId: string, inv: InvestimentoLista): Promise<Classificado> {
  if (inv.importStatus === 'sem-suporte') {
    return { inv, item: null, resumo: null, situacao: 'sem-suporte' };
  }
  const item = inv.portfolioId ? await carregarItemMover(userId, 'posicao', inv.portfolioId) : null;
  const resumo = item ? resumoDestinos(item) : null;
  if (inv.importStatus === 'vinculado') return { inv, item, resumo, situacao: 'ja-estava' };
  if (!item || !resumo) return { inv, item, resumo, situacao: 'fora-da-carteira' };
  if (!revisavelDoResumo(resumo)) return { inv, item, resumo, situacao: 'fixo' };
  return {
    inv,
    item,
    resumo,
    situacao: inv.destinoConfirmadoEm ? 'confirmado' : 'para-revisar',
  };
}

const textoDe = (situacao: SituacaoDestino, atual: DestinoAtualResumo | null) => {
  switch (situacao) {
    case 'confirmado':
      return atual ? `Na Carteira em ${atual.rotulo}` : undefined;
    case 'fixo':
      return atual ? `Fica em ${atual.label}` : undefined;
    case 'ja-estava':
      return 'Já estava na Carteira — continua onde está';
    case 'sem-suporte':
      return 'Cadastre à mão';
    case 'fora-da-carteira':
      return 'Não está mais na Carteira';
    default:
      return undefined;
  }
};

/**
 * Investimentos importados de uma conexão (ou de todas) com a situação de cada
 * um. `opcoes` (destinos do mover, sem a Saúde) e `via`/`confira` só em
 * 'para-revisar'. De passagem, marca os importados sem escolha (como
 * classificarDestinos). Ordem: faixa da revisão, depois saldo desc.
 */
export async function listarDestinosImportados(
  userId: string,
  {
    connectionId,
    somenteParaRevisar = false,
  }: { connectionId?: string; somenteParaRevisar?: boolean } = {},
): Promise<DestinosImportadosResponse> {
  if (!pluggyDestinosHabilitado()) return { habilitado: false, itens: [], paraRevisar: 0 };

  const investimentos = await prisma.bankInvestment.findMany({
    where: {
      userId,
      ...(connectionId ? { connectionId } : {}),
      ativo: true,
      importStatus: somenteParaRevisar
        ? 'importado'
        : { in: ['importado', 'vinculado', 'sem-suporte'] },
      ...(somenteParaRevisar ? { destinoConfirmadoEm: null, portfolioId: { not: null } } : {}),
    },
    include: { connection: { select: { connectorName: true } } },
  });

  const classificados = await mapaComLimite(investimentos, (inv) => classificar(userId, inv));

  await marcarConfirmados(
    userId,
    classificados
      .filter((c) => c.situacao === 'fixo' && !c.inv.destinoConfirmadoEm)
      .map((c) => c.inv.id),
  );

  const itens = await mapaComLimite(
    classificados.filter((c) => !somenteParaRevisar || c.situacao === 'para-revisar'),
    async ({ inv, item, resumo, situacao }): Promise<DestinoImportadoItem> => {
      const atual = resumo ? destinoAtualDe(resumo) : null;
      let opcoes: DestinoImportadoItem['opcoes'] = null;
      let via: ViaSugestao | null = null;
      if (situacao === 'para-revisar' && item && resumo) {
        [opcoes, via] = await Promise.all([
          opcoesMoverDoItem(userId, item),
          viaDaSugestao(item, resumo).catch(() => null),
        ]);
      }
      const texto = textoDe(situacao, atual);
      return {
        bankInvestmentId: inv.id,
        portfolioId: item ? item.row.id : null,
        connectionId: inv.connectionId,
        banco: inv.connection.connectorName,
        nome: inv.name,
        ticker: inv.code && TICKER_RE.test(inv.code) ? inv.code : null,
        saldo: Number(inv.balance),
        grupo: grupoDe(situacao, resumo, inv),
        situacao,
        atual,
        via,
        confira: via === 'padrao' && atual?.categoria === 'fiis',
        opcoes,
        ...(texto ? { texto } : {}),
      };
    },
  );

  const ordemGrupo = (g: GrupoDestino) => GRUPOS_DESTINO.indexOf(g);
  itens.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || b.saldo - a.saldo);

  return {
    habilitado: true,
    itens,
    paraRevisar: itens.filter((i) => i.situacao === 'para-revisar').length,
  };
}

/** Lugar atual de cada posição (GET /api/pluggy/carteira com a chave ligada). */
export async function destinoAtualPorPortfolio(
  userId: string,
  portfolioIds: readonly string[],
): Promise<Map<string, DestinoAtualResumo>> {
  const unicos = [...new Set(portfolioIds)];
  const pares = await mapaComLimite(unicos, async (id) => {
    const item = await carregarItemMover(userId, 'posicao', id);
    return item ? ([id, destinoAtualDe(resumoDestinos(item))] as const) : null;
  });
  return new Map(pares.filter((p): p is NonNullable<typeof p> => p !== null));
}

// ── Gravação ─────────────────────────────────────────────────────────────────

export type RegistroDestino = MoverRegistro & { bankInvestmentId: string };

export type AplicarDestinosResultado =
  | { tipo: 'ok'; resposta: AplicarDestinosResponse; registros: RegistroDestino[] }
  | { tipo: 'invalido'; erros: ErroDestinoItem[] };

interface Validado {
  bankInvestmentId: string;
  nome: string;
  portfolioId: string;
  categoria: CategoriaMovivel;
  subgrupo?: string;
  plano: PlanoMover;
}

const mensagemDe = (error: unknown): string | null =>
  error instanceof ApiError ? error.message : null;

/**
 * Aplica as escolhas da revisão. Fase 1 valida TODOS os itens (posse, situação
 * 'para-revisar' e planejarMover) — qualquer falha → 'invalido' sem gravar
 * nada. Fase 2 grava item a item com moverInvestimento (que revalida); falha
 * aqui só por concorrência → parcial. Depois confirma `confirmarIds` (só os do
 * usuário, importados e ainda sem confirmação, fora dos itens com erro).
 *
 * `historicoIds` sai vazio: a rota grava o Histórico a partir de `registros`.
 * `confirmados` = quantos investimentos saíram da fila nesta chamada.
 */
export async function aplicarDestinos(
  userId: string,
  body: AplicarDestinosInput,
): Promise<AplicarDestinosResultado> {
  if (!pluggyDestinosHabilitado()) throw new ApiError(404, MSG_DESTINOS_INDISPONIVEL);

  // Fase 1 — valida tudo, sem gravar.
  const validacoes = await mapaComLimite(
    body.itens,
    async (escolha): Promise<Validado | ErroDestinoItem> => {
      const inv = await prisma.bankInvestment.findFirst({
        where: { id: escolha.id, userId },
        select: {
          id: true,
          name: true,
          importStatus: true,
          ativo: true,
          portfolioId: true,
          destinoConfirmadoEm: true,
        },
      });
      if (!inv) return { id: escolha.id, nome: '', motivo: MSG_NAO_ENCONTRADO };
      const erro = (motivo: string): ErroDestinoItem => ({ id: inv.id, nome: inv.name, motivo });
      if (
        inv.importStatus !== 'importado' ||
        !inv.ativo ||
        inv.destinoConfirmadoEm ||
        !inv.portfolioId
      ) {
        return erro(MSG_SITUACAO_DESTINO);
      }
      const item = await carregarItemMover(userId, 'posicao', inv.portfolioId);
      if (!item || !revisavelDoResumo(resumoDestinos(item))) return erro(MSG_SITUACAO_DESTINO);
      try {
        const plano = planejarMover(item, exigirEstadoMovivel(item), escolha);
        return {
          bankInvestmentId: inv.id,
          nome: inv.name,
          portfolioId: inv.portfolioId,
          categoria: escolha.categoria,
          subgrupo: escolha.subgrupo,
          plano,
        };
      } catch (error: unknown) {
        const motivo = mensagemDe(error);
        if (motivo === null) throw error;
        return erro(motivo);
      }
    },
  );
  const invalidos = validacoes.filter((v): v is ErroDestinoItem => 'motivo' in v);
  if (invalidos.length > 0) return { tipo: 'invalido', erros: invalidos };
  const validados = validacoes as Validado[];

  // Fase 2 — grava item a item (sequencial, na ordem recebida).
  const erros: ErroDestinoItem[] = [];
  const registros: RegistroDestino[] = [];
  const conferidos: string[] = [];
  let aplicados = 0;
  let semMudanca = 0;
  for (const v of validados) {
    if (v.plano.noop) {
      semMudanca++;
      conferidos.push(v.bankInvestmentId);
      continue;
    }
    try {
      const r = await moverInvestimento(userId, {
        tipo: 'posicao',
        id: v.portfolioId,
        categoria: v.categoria,
        subgrupo: v.subgrupo,
      });
      conferidos.push(v.bankInvestmentId);
      if (r.noop) {
        semMudanca++;
        continue;
      }
      aplicados++;
      registros.push({
        tipo: 'posicao',
        id: r.item.row.id,
        asset: r.item.asset,
        origem: r.origem,
        destino: r.destino,
        objetivoZerado: r.objetivoZerado,
        antes: r.antes,
        depois: r.depois,
        bankInvestmentId: v.bankInvestmentId,
      });
    } catch (error: unknown) {
      const motivo = mensagemDe(error);
      if (motivo === null) throw error;
      erros.push({ id: v.bankInvestmentId, nome: v.nome, motivo });
    }
  }

  const comErro = new Set(erros.map((e) => e.id));
  const confirmar = [
    ...new Set([...conferidos, ...body.confirmarIds.filter((id) => !comErro.has(id))]),
  ];
  const confirmados = await marcarConfirmados(userId, confirmar);

  return {
    tipo: 'ok',
    resposta: {
      aplicados,
      semMudanca,
      confirmados,
      parcial: erros.length > 0,
      erros,
      historicoIds: [],
    },
    registros,
  };
}
