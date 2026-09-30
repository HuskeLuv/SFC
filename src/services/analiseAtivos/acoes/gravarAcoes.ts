/**
 * Escrita das 5 tabelas da fatia A (CvmCompany, CvmCompanyTicker, AssetFundamentalsPeriod,
 * AssetStatementLine, AssetShareCount). Nenhuma outra tabela é escrita aqui.
 *
 * - Fundamentos e linhas: createMany(skipDuplicates) em lotes de 1.000 — point-in-time, toda versão CVM
 *   vira linha nova; (cnpj, versão) já gravado nunca é reescrito.
 * - Companhias, tickers e contagens: lê o existente numa consulta e só cria/atualiza o que mudou
 *   (poucas escritas por execução no Neon/Lightsail).
 * - TTM (linha derivada, regra 14): mesma estratégia; a linha do documento base é atualizada quando o
 *   recálculo muda (chegou o YTD do ano anterior, por exemplo).
 * - Prazo: lotes param quando ctx.estourouPrazo(); quem chama devolve { parcial: true }.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { CiaFca, TituloFca } from '@/services/analiseAtivos/acoes/parserFca';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

export const TAMANHO_LOTE = 1_000;

export const dec2 = (x: number | null | undefined): string | null =>
  x === null || x === undefined || !Number.isFinite(x) ? null : x.toFixed(2);
export const dec0 = (x: number | null | undefined): string | null =>
  x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x).toString();

export interface ResultadoLotes {
  gravadas: number;
  interrompido: boolean;
}

/** createMany em lotes; para (sem erro) quando o prazo do job estoura. */
async function emLotes<T>(
  ctx: Pick<JobContexto, 'estourouPrazo'>,
  linhas: T[],
  gravar: (lote: T[]) => Promise<{ count: number }>,
): Promise<ResultadoLotes> {
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    if (ctx.estourouPrazo()) return { gravadas, interrompido: true };
    gravadas += (await gravar(linhas.slice(i, i + TAMANHO_LOTE))).count;
  }
  return { gravadas, interrompido: false };
}

// ---------------------------------------------------------------- cadastro (FCA)

export interface ResultadoCadastro {
  ciasNovas: number;
  ciasAtualizadas: number;
  tickersNovos: number;
  tickersFechados: number;
  tickersAtualizados: number;
  alertas: AlertaJob[];
}

export async function gravarCadastroFca(
  prisma: PrismaClient,
  fca: { cias: Map<string, CiaFca>; titulos: TituloFca[] },
  meta: { sourceUrl: string; hoje: string; aplicar: boolean },
): Promise<ResultadoCadastro> {
  const agora = new Date();
  const alertas: AlertaJob[] = [];
  const out: ResultadoCadastro = {
    ciasNovas: 0,
    ciasAtualizadas: 0,
    tickersNovos: 0,
    tickersFechados: 0,
    tickersAtualizados: 0,
    alertas,
  };

  // companhias
  const cnpjs = [...fca.cias.keys()];
  const existentes = new Map(
    (await prisma.cvmCompany.findMany({ where: { cnpj: { in: cnpjs } } })).map((c) => [c.cnpj, c]),
  );
  const novas: Prisma.CvmCompanyCreateManyInput[] = [];
  const atualizar: Array<{ cnpj: string; data: Prisma.CvmCompanyUpdateInput }> = [];
  for (const c of fca.cias.values()) {
    const dados = {
      cdCvm: c.cdCvm,
      nome: c.nome,
      setorAtividadeFca: c.setorAtividade,
      situacao: c.situacao,
      mesFimExercicio: c.mesFimExercicio,
      dataRefFca: deData(c.dataRef),
      versaoFca: c.versao,
      sourceUrl: meta.sourceUrl,
    };
    const e = existentes.get(c.cnpj);
    if (!e) {
      novas.push({ cnpj: c.cnpj, ...dados, fetchedAt: agora });
      continue;
    }
    const mudou =
      e.cdCvm !== dados.cdCvm ||
      e.nome !== dados.nome ||
      e.setorAtividadeFca !== dados.setorAtividadeFca ||
      e.situacao !== dados.situacao ||
      e.mesFimExercicio !== dados.mesFimExercicio ||
      paraData(e.dataRefFca) !== c.dataRef ||
      e.versaoFca !== dados.versaoFca;
    // layoutFinanceiro é da ingestão do DRE: o FCA nunca o sobrescreve
    if (mudou) atualizar.push({ cnpj: c.cnpj, data: { ...dados, fetchedAt: agora } });
  }
  out.ciasNovas = novas.length;
  out.ciasAtualizadas = atualizar.length;

  // tickers (vigência)
  const abertos = await prisma.cvmCompanyTicker.findMany({ where: { validTo: null } });
  const abertoPorSymbol = new Map(abertos.map((t) => [t.symbol, t]));
  const novosTickers: Prisma.CvmCompanyTickerCreateManyInput[] = [];
  const fechar: Array<{ id: string; validTo: string }> = [];
  const atualizarTicker: Array<{ id: string; data: Prisma.CvmCompanyTickerUpdateInput }> = [];
  const vistos = new Set<string>();
  for (const t of fca.titulos) {
    vistos.add(t.symbol);
    const aberto = abertoPorSymbol.get(t.symbol);
    const dados = {
      classeFca: t.classeFca,
      unitQtdOn: t.unitQtdOn,
      unitQtdPn: t.unitQtdPn,
      composicaoTexto: t.composicaoTexto,
    };
    if (t.dataFim) {
      if (aberto && aberto.cnpj === t.cnpj) {
        fechar.push({ id: aberto.id, validTo: t.dataFim });
        alertas.push({
          codigo: 'ticker_encerrado',
          nivel: 'info',
          mensagem: `${t.symbol} encerrado em ${t.dataFim}`,
          ref: t.symbol,
        });
      }
      continue;
    }
    if (!aberto) {
      novosTickers.push({
        symbol: t.symbol,
        cnpj: t.cnpj,
        classeTitulo: t.classeTitulo,
        ...dados,
        validFrom: deData(t.dataInicio ?? meta.hoje),
        origem: 'fca',
        fetchedAt: agora,
      });
      continue;
    }
    if (aberto.origem === 'manual') continue; // override manual vence o FCA
    if (aberto.cnpj !== t.cnpj || aberto.classeTitulo !== t.classeTitulo) {
      // troca de emissor/classe: fecha a vigência anterior e abre outra
      const inicioAnterior = paraData(aberto.validFrom);
      const inicio = t.dataInicio && t.dataInicio > inicioAnterior ? t.dataInicio : meta.hoje;
      if (inicio <= inicioAnterior) continue;
      fechar.push({ id: aberto.id, validTo: inicio });
      novosTickers.push({
        symbol: t.symbol,
        cnpj: t.cnpj,
        classeTitulo: t.classeTitulo,
        ...dados,
        validFrom: deData(inicio),
        origem: 'fca',
        fetchedAt: agora,
      });
      alertas.push({
        codigo: 'ticker_trocou_emissor',
        nivel: 'aviso',
        mensagem: `${t.symbol}: ${aberto.cnpj}/${aberto.classeTitulo} → ${t.cnpj}/${t.classeTitulo}`,
        ref: t.symbol,
      });
      continue;
    }
    const mudou =
      aberto.classeFca !== dados.classeFca ||
      aberto.unitQtdOn !== dados.unitQtdOn ||
      aberto.unitQtdPn !== dados.unitQtdPn ||
      aberto.composicaoTexto !== dados.composicaoTexto;
    if (mudou) atualizarTicker.push({ id: aberto.id, data: { ...dados, fetchedAt: agora } });
  }
  // ticker novo: individual quando poucos; no 1º carregamento (centenas) um alerta só
  if (novosTickers.length > 20) {
    alertas.push({
      codigo: 'tickers_novos',
      nivel: 'info',
      mensagem: `${novosTickers.length} tickers novos no FCA`,
    });
  } else {
    for (const t of novosTickers) {
      alertas.push({
        codigo: 'ticker_novo',
        nivel: 'info',
        mensagem: `${t.symbol} → ${t.cnpj}`,
        ref: t.symbol,
      });
    }
  }
  // sumiu do FCA: fecha — mas nunca em massa (arquivo truncado/errado não derruba o universo)
  const sumidos = abertos.filter((t) => t.origem === 'fca' && !vistos.has(t.symbol));
  if (abertos.length > 0 && sumidos.length > Math.max(20, abertos.length * 0.2)) {
    alertas.push({
      codigo: 'fca_sumico_em_massa',
      nivel: 'erro',
      mensagem: `${sumidos.length} de ${abertos.length} tickers sumiram do FCA; nada foi fechado`,
    });
  } else {
    for (const t of sumidos) {
      fechar.push({ id: t.id, validTo: meta.hoje });
      alertas.push({
        codigo: 'ticker_encerrado',
        nivel: 'info',
        mensagem: `${t.symbol} saiu do FCA`,
        ref: t.symbol,
      });
    }
  }
  out.tickersNovos = novosTickers.length;
  out.tickersFechados = fechar.length;
  out.tickersAtualizados = atualizarTicker.length;
  if (!meta.aplicar) return out;
  if (novas.length) await prisma.cvmCompany.createMany({ data: novas, skipDuplicates: true });
  for (const a of atualizar)
    await prisma.cvmCompany.update({ where: { cnpj: a.cnpj }, data: a.data });
  for (const f of fechar) {
    await prisma.cvmCompanyTicker.update({
      where: { id: f.id },
      data: { validTo: deData(f.validTo), fetchedAt: agora },
    });
  }
  if (novosTickers.length) {
    await prisma.cvmCompanyTicker.createMany({ data: novosTickers, skipDuplicates: true });
  }
  for (const a of atualizarTicker) {
    await prisma.cvmCompanyTicker.update({ where: { id: a.id }, data: a.data });
  }
  return out;
}

// ---------------------------------------------------------------- fundamentos

/** Documentos já gravados: `${cnpj}|${dtFim}|${versao}` (qualquer tipoPeriodo). */
export async function documentosGravados(
  prisma: PrismaClient,
  docTipo: 'DFP' | 'ITR',
  cnpjs: string[],
  dtFims: string[],
): Promise<Set<string>> {
  if (cnpjs.length === 0 || dtFims.length === 0) return new Set();
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: {
      source: 'CVM',
      docTipo,
      emissorId: { in: cnpjs },
      dtFim: { in: dtFims.map(deData) },
      tipoPeriodo: { in: ['FY', 'YTD', '3M'] },
    },
    select: { emissorId: true, dtFim: true, versao: true },
    distinct: ['emissorId', 'dtFim', 'versao'],
  });
  return new Set(linhas.map((l) => `${l.emissorId}|${paraData(l.dtFim)}|${l.versao}`));
}

/**
 * Lotes de ~TAMANHO_LOTE linhas que nunca quebram um documento (cnpj, dtFim, versão): o fundamento é
 * o marcador de "documento gravado" (documentosGravados), então um documento pela metade (só o 'con',
 * prazo estourado antes do lote do 'ind') ficaria pulado para sempre. Cada lote é um INSERT só.
 */
export function lotesPorDocumento(
  linhas: Prisma.AssetFundamentalsPeriodCreateManyInput[],
): Prisma.AssetFundamentalsPeriodCreateManyInput[][] {
  const chave = (l: Prisma.AssetFundamentalsPeriodCreateManyInput) =>
    `${l.emissorId}|${paraData(new Date(l.dtFim))}|${l.versao}`;
  const porDoc = new Map<string, Prisma.AssetFundamentalsPeriodCreateManyInput[]>();
  for (const l of linhas) {
    const k = chave(l);
    const g = porDoc.get(k);
    if (g) g.push(l);
    else porDoc.set(k, [l]);
  }
  const lotes: Prisma.AssetFundamentalsPeriodCreateManyInput[][] = [];
  let atual: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
  for (const doc of porDoc.values()) {
    if (atual.length > 0 && atual.length + doc.length > TAMANHO_LOTE) {
      lotes.push(atual);
      atual = [];
    }
    atual.push(...doc);
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

export async function gravarFundamentos(
  prisma: PrismaClient,
  ctx: Pick<JobContexto, 'estourouPrazo'>,
  linhas: Prisma.AssetFundamentalsPeriodCreateManyInput[],
): Promise<ResultadoLotes> {
  let gravadas = 0;
  for (const lote of lotesPorDocumento(linhas)) {
    if (ctx.estourouPrazo()) return { gravadas, interrompido: true };
    gravadas += (
      await prisma.assetFundamentalsPeriod.createMany({ data: lote, skipDuplicates: true })
    ).count;
  }
  return { gravadas, interrompido: false };
}

export function gravarLinhasDemonstrativo(
  prisma: PrismaClient,
  ctx: Pick<JobContexto, 'estourouPrazo'>,
  linhas: Prisma.AssetStatementLineCreateManyInput[],
): Promise<ResultadoLotes> {
  return emLotes(ctx, linhas, (lote) =>
    prisma.assetStatementLine.createMany({ data: lote, skipDuplicates: true }),
  );
}

// ---------------------------------------------------------------- contagens de ações

export interface ContagemGravavel {
  cnpj: string;
  data: string;
  on: number | null;
  pn: number | null;
  tesouraria: number | null;
  total: number | null;
  fonte: string;
  razaoLpa: number | null;
  status: string;
  versaoDoc: number | null;
  flags: string[];
}

export interface ContagemExistente extends ContagemGravavel {
  id: string;
}

export async function contagensExistentes(
  prisma: PrismaClient,
  cnpjs: string[],
): Promise<ContagemExistente[]> {
  if (cnpjs.length === 0) return [];
  const linhas = await prisma.assetShareCount.findMany({
    where: { cnpj: { in: cnpjs } },
    orderBy: [{ cnpj: 'asc' }, { data: 'asc' }],
  });
  return linhas.map((l) => ({
    id: l.id,
    cnpj: l.cnpj,
    data: paraData(l.data),
    on: paraNumero(l.on),
    pn: paraNumero(l.pn),
    tesouraria: paraNumero(l.tesouraria),
    total: paraNumero(l.total),
    fonte: l.fonte,
    razaoLpa: l.razaoLpa,
    status: l.status,
    versaoDoc: l.versaoDoc,
    flags: l.flags,
  }));
}

/** Upsert por (cnpj, data) com 1 leitura: cria as novas em lote e atualiza só as que mudaram. */
export async function gravarContagens(
  prisma: PrismaClient,
  ctx: Pick<JobContexto, 'estourouPrazo'>,
  contagens: ContagemGravavel[],
  existentes: ContagemExistente[],
): Promise<ResultadoLotes> {
  const agora = new Date();
  const porChave = new Map(existentes.map((e) => [`${e.cnpj}|${e.data}`, e]));
  const novas: Prisma.AssetShareCountCreateManyInput[] = [];
  const mudadas: Array<{ id: string; c: ContagemGravavel }> = [];
  const dados = (c: ContagemGravavel) => ({
    on: dec0(c.on),
    pn: dec0(c.pn),
    tesouraria: dec0(c.tesouraria),
    total: dec0(c.total),
    fonte: c.fonte,
    razaoLpa: c.razaoLpa,
    status: c.status,
    versaoDoc: c.versaoDoc,
    flags: c.flags,
    fetchedAt: agora,
  });
  for (const c of contagens) {
    const e = porChave.get(`${c.cnpj}|${c.data}`);
    if (!e) {
      novas.push({ cnpj: c.cnpj, data: deData(c.data), ...dados(c) });
      continue;
    }
    const igual =
      e.total === (c.total === null ? null : Math.round(c.total)) &&
      e.fonte === c.fonte &&
      e.status === c.status &&
      e.versaoDoc === c.versaoDoc &&
      (e.razaoLpa ?? null) === (c.razaoLpa ?? null) &&
      e.flags.join(',') === c.flags.join(',');
    if (!igual) mudadas.push({ id: e.id, c });
  }
  const r = await emLotes(ctx, novas, (lote) =>
    prisma.assetShareCount.createMany({ data: lote, skipDuplicates: true }),
  );
  if (r.interrompido) return r;
  for (const m of mudadas) {
    if (ctx.estourouPrazo()) return { gravadas: r.gravadas, interrompido: true };
    await prisma.assetShareCount.update({ where: { id: m.id }, data: dados(m.c) });
    r.gravadas++;
  }
  return r;
}

// ---------------------------------------------------------------- layout financeiro

export async function gravarLayoutFinanceiro(
  prisma: PrismaClient,
  porCnpj: Map<string, boolean>,
): Promise<void> {
  const sim = [...porCnpj].filter(([, v]) => v).map(([k]) => k);
  const nao = [...porCnpj].filter(([, v]) => !v).map(([k]) => k);
  if (sim.length) {
    await prisma.cvmCompany.updateMany({
      where: { cnpj: { in: sim }, layoutFinanceiro: false },
      data: { layoutFinanceiro: true },
    });
  }
  if (nao.length) {
    await prisma.cvmCompany.updateMany({
      where: { cnpj: { in: nao }, layoutFinanceiro: true },
      data: { layoutFinanceiro: false },
    });
  }
}

// ---------------------------------------------------------------- TTM

export type LinhaFundamentosDb = Prisma.AssetFundamentalsPeriodGetPayload<object>;

/** Períodos FY/YTD/3M/TTM (todas as versões) dos emissores desde `desde`. */
export function periodosDosEmissores(
  prisma: PrismaClient,
  cnpjs: string[],
  desde: string,
): Promise<LinhaFundamentosDb[]> {
  if (cnpjs.length === 0) return Promise.resolve([]);
  return prisma.assetFundamentalsPeriod.findMany({
    where: {
      source: 'CVM',
      emissorId: { in: cnpjs },
      dtFim: { gte: deData(desde) },
      tipoPeriodo: { in: ['FY', 'YTD', '3M', 'TTM'] },
    },
  });
}

const CAMPOS_COMPARACAO_TTM = [
  'receita',
  'lucroBruto',
  'ebit',
  'depreciacaoAmortizacao',
  'lucroLiquido',
  'lucroAtribuivel',
  'fco',
  'fci',
  'fcf',
  'capex',
  'dividendosJcpPagos',
  'ativoTotal',
  'pl',
  'plControladora',
] as const;

/** Cria as linhas TTM novas em lote e atualiza as que o recálculo mudou. */
export async function gravarTtm(
  prisma: PrismaClient,
  ctx: Pick<JobContexto, 'estourouPrazo'>,
  linhas: Prisma.AssetFundamentalsPeriodCreateManyInput[],
  existentes: LinhaFundamentosDb[],
): Promise<ResultadoLotes & { escritas: Prisma.AssetFundamentalsPeriodCreateManyInput[] }> {
  const chave = (x: { emissorId: string; dtFim: Date | string; escopo: string; versao: number }) =>
    `${x.emissorId}|${typeof x.dtFim === 'string' ? x.dtFim : paraData(x.dtFim)}|${x.escopo}|${x.versao}`;
  const porChave = new Map(
    existentes.filter((e) => e.tipoPeriodo === 'TTM').map((e) => [chave(e), e]),
  );
  const novas: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
  const mudadas: Array<{ id: string; l: Prisma.AssetFundamentalsPeriodCreateManyInput }> = [];
  for (const l of linhas) {
    const e = porChave.get(
      chave(l as { emissorId: string; dtFim: Date; escopo: string; versao: number }),
    );
    if (!e) {
      novas.push(l);
      continue;
    }
    const igual =
      CAMPOS_COMPARACAO_TTM.every((c) => {
        const a = paraNumero(e[c]);
        const b = l[c] === null || l[c] === undefined ? null : Number(l[c]);
        return a === b || (a !== null && b !== null && Math.abs(a - b) < 0.01);
      }) && e.flags.join(',') === ((l.flags as string[]) ?? []).join(',');
    if (!igual) mudadas.push({ id: e.id, l });
  }
  const escritas = [...novas, ...mudadas.map((m) => m.l)];
  const r = await gravarFundamentos(prisma, ctx, novas);
  if (r.interrompido) return { ...r, escritas };
  for (const m of mudadas) {
    if (ctx.estourouPrazo()) return { gravadas: r.gravadas, interrompido: true, escritas };
    const { id: _id, ...dados } = m.l;
    await prisma.assetFundamentalsPeriod.update({ where: { id: m.id }, data: dados });
    r.gravadas++;
  }
  return { ...r, escritas };
}
