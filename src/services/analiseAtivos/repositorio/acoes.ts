/**
 * Leituras de fundamentos de ações (tabelas da fatia A) para as fatias D e E.
 * Point-in-time: a A grava todas as versões CVM; aqui vale a MAIOR versão por
 * (emissor, dtFim, tipoPeriodo, escopo). O escopo 'preferido' é resolvido NA LEITURA (a A grava con
 * e ind): 'ind' para bancos (decisão 3), 'con' para os demais, e o que existir quando faltar.
 */
import type { AssetFundamentalsPeriod, PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { listarEmissores } from '@/services/analiseAtivos/repositorio/universo';
import type {
  ContagemAcoes,
  EmissorInfo,
  EntregaDocumento,
  Escopo,
  FundamentosPeriodo,
  PadraoContabil,
  TipoPeriodo,
} from '@/services/analiseAtivos/tipos';

function paraFundamentos(l: AssetFundamentalsPeriod): FundamentosPeriodo {
  return {
    emissorId: l.emissorId,
    docTipo: l.docTipo as FundamentosPeriodo['docTipo'],
    tipoPeriodo: l.tipoPeriodo as TipoPeriodo,
    escopo: l.escopo as Escopo,
    padraoContabil: l.padraoContabil as PadraoContabil,
    dtIni: paraData(l.dtIni),
    dtFim: paraData(l.dtFim),
    anoFiscal: l.anoFiscal,
    trimestreFiscal: l.trimestreFiscal,
    versao: l.versao,
    dtEntregaOriginal: paraData(l.dtEntregaOriginal),
    receita: paraNumero(l.receita),
    lucroBruto: paraNumero(l.lucroBruto),
    ebit: paraNumero(l.ebit),
    depreciacaoAmortizacao: paraNumero(l.depreciacaoAmortizacao),
    lucroLiquido: paraNumero(l.lucroLiquido),
    lucroAtribuivel: paraNumero(l.lucroAtribuivel),
    ativoTotal: paraNumero(l.ativoTotal),
    ativoCirculante: paraNumero(l.ativoCirculante),
    passivoCirculante: paraNumero(l.passivoCirculante),
    caixa: paraNumero(l.caixa),
    aplicacoesFinanceiras: paraNumero(l.aplicacoesFinanceiras),
    dividaBrutaCp: paraNumero(l.dividaBrutaCp),
    dividaBrutaLp: paraNumero(l.dividaBrutaLp),
    pl: paraNumero(l.pl),
    plControladora: paraNumero(l.plControladora),
    fco: paraNumero(l.fco),
    fci: paraNumero(l.fci),
    fcf: paraNumero(l.fcf),
    capex: paraNumero(l.capex),
    dividendosJcpPagos: paraNumero(l.dividendosJcpPagos),
    dmplDeclarado: paraNumero(l.dmplDeclarado),
    lpaOn: l.lpaOn,
    lpaPn: l.lpaPn,
    naoSeAplica: l.naoSeAplica,
    flags: l.flags,
  };
}

export async function fundamentosVigentes(
  prisma: PrismaClient,
  cnpjs: string[],
  opts: {
    tipos: TipoPeriodo[];
    desde?: string;
    escopo?: 'preferido' | Escopo;
    emissores?: EmissorInfo[];
  },
): Promise<FundamentosPeriodo[]> {
  if (cnpjs.length === 0 || opts.tipos.length === 0) return [];
  const escopo = opts.escopo ?? 'preferido';
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: {
      emissorId: { in: cnpjs },
      tipoPeriodo: { in: opts.tipos },
      ...(opts.desde ? { dtFim: { gte: deData(opts.desde) } } : {}),
      ...(escopo !== 'preferido' ? { escopo } : {}),
    },
    orderBy: [{ emissorId: 'asc' }, { dtFim: 'asc' }, { versao: 'desc' }],
  });

  // maior versão por (emissor, dtFim, tipoPeriodo, escopo)
  const vigentes = new Map<string, AssetFundamentalsPeriod>();
  for (const l of linhas) {
    const k = `${l.emissorId}|${paraData(l.dtFim)}|${l.tipoPeriodo}|${l.escopo}`;
    const atual = vigentes.get(k);
    if (!atual || l.versao > atual.versao) vigentes.set(k, l);
  }
  if (escopo !== 'preferido') return [...vigentes.values()].map(paraFundamentos);

  const emissores = opts.emissores ?? (await listarEmissores(prisma, cnpjs));
  const preferido = new Map(emissores.map((e) => [e.cnpj, e.escopoPreferido]));
  const porPeriodo = new Map<string, AssetFundamentalsPeriod[]>();
  for (const l of vigentes.values()) {
    const k = `${l.emissorId}|${paraData(l.dtFim)}|${l.tipoPeriodo}`;
    porPeriodo.set(k, [...(porPeriodo.get(k) ?? []), l]);
  }
  const out: FundamentosPeriodo[] = [];
  for (const grupo of porPeriodo.values()) {
    const quer = preferido.get(grupo[0].emissorId) ?? 'con';
    const escolhida = grupo.find((g) => g.escopo === quer) ?? grupo[0];
    out.push(paraFundamentos(escolhida));
  }
  return out;
}

export async function contagensAcoes(
  prisma: PrismaClient,
  cnpjs: string[],
): Promise<ContagemAcoes[]> {
  if (cnpjs.length === 0) return [];
  const linhas = await prisma.assetShareCount.findMany({
    where: { cnpj: { in: cnpjs } },
    orderBy: [{ cnpj: 'asc' }, { data: 'asc' }],
  });
  return linhas.map((l) => ({
    cnpj: l.cnpj,
    data: paraData(l.data),
    on: paraNumero(l.on),
    pn: paraNumero(l.pn),
    total: paraNumero(l.total),
    fonte: l.fonte,
    razaoLpa: l.razaoLpa,
    status: l.status as ContagemAcoes['status'],
  }));
}

/** Entregas de DFP/ITR (menor DT_RECEB por documento) com dtFim ≥ desde — insumo da agenda (E). */
export async function entregasDocumentos(
  prisma: PrismaClient,
  opts: { desde: string; cnpjs?: string[] },
): Promise<EntregaDocumento[]> {
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: {
      source: 'CVM',
      docTipo: { in: ['DFP', 'ITR'] },
      tipoPeriodo: { not: 'TTM' },
      dtFim: { gte: deData(opts.desde) },
      ...(opts.cnpjs ? { emissorId: { in: opts.cnpjs } } : {}),
    },
    select: {
      emissorId: true,
      docTipo: true,
      dtFim: true,
      anoFiscal: true,
      trimestreFiscal: true,
      dtEntregaOriginal: true,
    },
  });
  const porDoc = new Map<string, EntregaDocumento>();
  for (const l of linhas) {
    const dtFim = paraData(l.dtFim);
    const k = `${l.emissorId}|${l.docTipo}|${dtFim}`;
    const entrega = paraData(l.dtEntregaOriginal);
    const atual = porDoc.get(k);
    if (!atual || entrega < atual.dtEntregaOriginal) {
      porDoc.set(k, {
        cnpj: l.emissorId,
        docTipo: l.docTipo as EntregaDocumento['docTipo'],
        dtFim,
        anoFiscal: l.anoFiscal,
        trimestreFiscal: l.trimestreFiscal,
        dtEntregaOriginal: entrega,
      });
    }
  }
  return [...porDoc.values()].sort(
    (a, b) => a.cnpj.localeCompare(b.cnpj) || a.dtFim.localeCompare(b.dtFim),
  );
}

/** Emissores com fundamentos ou contagem de ações gravados depois de `desde`. */
export async function emissoresAlteradosDesde(
  prisma: PrismaClient,
  desde: Date,
): Promise<string[]> {
  const [fund, cont] = await Promise.all([
    prisma.assetFundamentalsPeriod.findMany({
      where: { fetchedAt: { gt: desde } },
      select: { emissorId: true },
      distinct: ['emissorId'],
    }),
    prisma.assetShareCount.findMany({
      where: { fetchedAt: { gt: desde } },
      select: { cnpj: true },
      distinct: ['cnpj'],
    }),
  ]);
  return [...new Set([...fund.map((f) => f.emissorId), ...cont.map((c) => c.cnpj)])].sort();
}
