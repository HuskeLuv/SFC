/**
 * Job 'curadoria' do bloco C (fatia C) — 10:55 UTC, depois do 'quadro'. Idempotente, só banco;
 * `ctx.aplicar=false` = dry-run (conta sem gravar).
 *
 * 1) Detecções: flags 'conf:'/'rev:' das linhas do Quadro (analise_quadro_linhas.flags, cópia das
 *    flags correntes) e do histórico anual (asset_multiples_yearly.flags, onde mora
 *    'conf:historico:escala_ano@<ano>'). Cada detecção chaveia um caso por
 *    chaveCaso({symbol, campo: DEF_GRUPO[grupo].campoPrincipal | REGRAS_REVISAO[regra].campo,
 *    periodo: chave}).
 * 2) Upsert: caso aberto com a mesma chave → regraAtiva=true, emConferencia (só 'conf:'), regra e
 *    chave; um caso de usuário vira 'misto'. Sem caso aberto → abre caso de origem 'regra' (sem prazo),
 *    a não ser que o curador já tenha decidido aquela (symbol, regra, chave) como 'rejeitado' (dado
 *    confirmado/sem procedência/duplicado): aí não reabre. Caso anterior 'corrigido' com a mesma
 *    detecção → o novo leva casoAnteriorId.
 * 3) Regra que parou (caso aberto com regraAtiva=true e sem detecção hoje):
 *    - regra PURA (origem 'regra', nReportes=0) cujo campo principal está 'ok' (valor finito) numa
 *      linha gerada HOJE → fecha como corrigido/fonte_corrigiu (sem efeito na tela);
 *    - senão (dado sumiu, campo sem fonte conferível, ou caso com relato — 'misto'/'usuario', que
 *      NUNCA fecha sozinho) → regraAtiva=false + emConferencia=false + evento 'regra_cessou'; o caso
 *      fica aberto e a fila mostra "a regra deixou de marcar".
 *    Guarda: sem nenhuma linha do Quadro gerada hoje, o passo 3 não roda (Quadro atrasado não pode
 *    parecer "regra parou").
 * 4) Resumo diário de prazos aos admins (vencidos e vencendo em até 2 dias úteis; sem casos só de
 *    regra nem de revisão) — gate: ANALISE_ATIVOS_REPORTE_HABILITADO + produção (decisão 14:
 *    independe de ANALISE_ATIVOS_ALERTA_ADMIN).
 *
 * Segunda rodada no mesmo dia, sem mudança nas flags: 0 gravações (só escreve quando o estado muda).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { analiseAtivosReporteHabilitado } from '@/lib/analiseAtivosConfig';
import {
  DEF_GRUPO,
  REGRAS_REVISAO,
  ehGrupoConferencia,
  flagsConf,
  flagsRev,
  formatarFlagConf,
  formatarFlagRev,
  type CampoTela,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { chaveCaso, dataCivilSaoPaulo } from '@/services/analiseAtivos/curadoria/contrato';
import { contarPrazos } from '@/services/analiseAtivos/curadoria/filaCuradoria';
import {
  enviarDigestSla,
  inicioDoDiaSaoPaulo,
} from '@/services/analiseAtivos/curadoria/notificacoesCaso';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import type { RelatorioCuradoria } from '@/types/analiseAtivosCuradoria';

export type { RelatorioCuradoria };

export const RELATORIO_CURADORIA_VAZIO: RelatorioCuradoria = {
  abertos: 0,
  atualizados: 0,
  autorresolvidos: 0,
  regraCessou: 0,
  digestEnviados: 0,
};

// ===========================================================================
// Núcleo puro
// ===========================================================================

export interface LinhaComFlags {
  symbol: string;
  classe: string;
  cnpj: string | null;
  flags: readonly string[];
}

export interface Deteccao {
  symbol: string;
  classe: string;
  cnpj: string | null;
  tipo: 'conf' | 'rev';
  /** GrupoConferencia ('conf:') ou 'outro' (revisão) */
  grupo: string;
  regra: string;
  chave: string;
  campo: CampoTela;
  flag: string;
  /** chaveCaso */
  chaveCaso: string;
}

/** Detecções de um conjunto de linhas (sem repetir chaveCaso; a primeira flag vence). */
export function extrairDeteccoes(linhas: readonly LinhaComFlags[]): Deteccao[] {
  const out = new Map<string, Deteccao>();
  for (const l of linhas) {
    const symbol = l.symbol.trim().toUpperCase();
    for (const f of flagsConf(l.flags)) {
      const campo = DEF_GRUPO[f.grupo].campoPrincipal;
      const k = chaveCaso({ symbol, campo, periodo: f.chave });
      if (!out.has(k)) {
        out.set(k, {
          symbol,
          classe: l.classe,
          cnpj: l.cnpj,
          tipo: 'conf',
          grupo: f.grupo,
          regra: f.regra,
          chave: f.chave,
          campo,
          flag: formatarFlagConf(f),
          chaveCaso: k,
        });
      }
    }
    for (const f of flagsRev(l.flags)) {
      const campo = REGRAS_REVISAO[f.regra].campo;
      const k = chaveCaso({ symbol, campo, periodo: f.chave });
      if (!out.has(k)) {
        out.set(k, {
          symbol,
          classe: l.classe,
          cnpj: l.cnpj,
          tipo: 'rev',
          grupo: 'outro',
          regra: f.regra,
          chave: f.chave,
          campo,
          flag: formatarFlagRev(f),
          chaveCaso: k,
        });
      }
    }
  }
  return [...out.values()];
}

export interface CasoAbertoJob {
  id: string;
  symbol: string;
  grupo: string;
  campo: string;
  periodo: string | null;
  origem: string;
  regraCodigo: string | null;
  chaveDeteccao: string | null;
  chaveAberta: string | null;
  regraAtiva: boolean;
  emConferencia: boolean;
  nReportes: number;
}

export interface CasoFechadoJob {
  id: string;
  symbol: string;
  regraCodigo: string | null;
  chaveDeteccao: string | null;
  status: string;
}

/** Valor atual do campo principal + se a linha que o traz é de hoje. */
export interface ValorCampo {
  valor: number | null;
  deHoje: boolean;
}

export type LerValorCampo = (caso: CasoAbertoJob) => ValorCampo | null;

export interface PlanoCuradoria {
  criar: Array<{ deteccao: Deteccao; casoAnteriorId: string | null }>;
  atualizar: Array<{ caso: CasoAbertoJob; deteccao: Deteccao; reativou: boolean }>;
  autorresolver: CasoAbertoJob[];
  cessar: CasoAbertoJob[];
}

const chaveRegra = (symbol: string, regra: string | null, chave: string | null) =>
  `${symbol.toUpperCase()}|${regra ?? ''}|${chave ?? ''}`;

/** Valor 'ok' = número finito (null, NaN e ±∞ contam como dado ausente). */
export function campoOk(v: ValorCampo | null): boolean {
  return !!v && v.deHoje && typeof v.valor === 'number' && Number.isFinite(v.valor);
}

/**
 * Plano do job (puro). `processarCessacao=false` (Quadro sem linha de hoje) não mexe em caso
 * nenhum por "regra parou".
 */
export function planejarCuradoria(entrada: {
  deteccoes: readonly Deteccao[];
  abertos: readonly CasoAbertoJob[];
  fechados: readonly CasoFechadoJob[];
  lerValor: LerValorCampo;
  processarCessacao: boolean;
}): PlanoCuradoria {
  const plano: PlanoCuradoria = { criar: [], atualizar: [], autorresolver: [], cessar: [] };
  const abertosPorChave = new Map<string, CasoAbertoJob>();
  for (const c of entrada.abertos) if (c.chaveAberta) abertosPorChave.set(c.chaveAberta, c);

  const rejeitados = new Set<string>();
  const corrigidos = new Map<string, string>();
  for (const f of entrada.fechados) {
    if (!f.regraCodigo) continue;
    const k = chaveRegra(f.symbol, f.regraCodigo, f.chaveDeteccao);
    if (f.status === 'rejeitado') rejeitados.add(k);
    else if (f.status === 'corrigido') corrigidos.set(k, f.id);
  }

  const detectadas = new Set<string>();
  for (const d of entrada.deteccoes) {
    detectadas.add(d.chaveCaso);
    const caso = abertosPorChave.get(d.chaveCaso);
    if (caso) {
      const mudou =
        !caso.regraAtiva ||
        caso.emConferencia !== (d.tipo === 'conf') ||
        caso.regraCodigo !== d.regra ||
        caso.chaveDeteccao !== d.chave ||
        caso.origem === 'usuario' ||
        (d.tipo === 'conf' && caso.grupo !== d.grupo);
      if (mudou) plano.atualizar.push({ caso, deteccao: d, reativou: !caso.regraAtiva });
      continue;
    }
    const kr = chaveRegra(d.symbol, d.regra, d.chave);
    if (rejeitados.has(kr)) continue;
    plano.criar.push({ deteccao: d, casoAnteriorId: corrigidos.get(kr) ?? null });
  }

  if (!entrada.processarCessacao) return plano;
  for (const c of entrada.abertos) {
    if (!c.regraCodigo || !c.regraAtiva) continue;
    if (c.chaveAberta && detectadas.has(c.chaveAberta)) continue;
    const regraPura = c.origem === 'regra' && c.nReportes === 0;
    if (regraPura && campoOk(entrada.lerValor(c))) plano.autorresolver.push(c);
    else plano.cessar.push(c);
  }
  return plano;
}

// ===========================================================================
// Valores atuais do campo principal
// ===========================================================================

export interface FontesValor {
  linha?: {
    geradoEm: Date;
    preco: number | null;
    valorMercado: number | null;
    pl: number | null;
    pvp: number | null;
    dy12mPct: number | null;
    payoutPct: number | null;
    obrigacoesPlPct: number | null;
    cotistas: number | null;
    patrimonio: number | null;
  };
  atual?: {
    vpCota: number | null;
    dpa12m: number | null;
    rend12m: number | null;
    lpaTtm: number | null;
    vpa: number | null;
    evEbitda: number | null;
    pReceita: number | null;
  };
  /** asset_multiples_yearly do ano da chave (grupo 'historico') */
  anual?: { pl: number | null; pvp: number | null; pReceita: number | null };
}

/**
 * Valor do campo principal a partir das linhas gravadas. Campo sem fonte conferível aqui
 * (receita, lucro, …) → null: o caso nunca fecha sozinho (o curador decide).
 */
export function valorDoCampo(campo: string, f: FontesValor, hoje: string): ValorCampo | null {
  const l = f.linha;
  if (!l) return null;
  const deHoje = dataCivilSaoPaulo(l.geradoEm) === hoje;
  const v = (valor: number | null | undefined): ValorCampo => ({ valor: valor ?? null, deHoje });
  switch (campo) {
    case 'preco':
      return v(l.preco);
    case 'valorMercado':
      return v(l.valorMercado);
    case 'nAcoes':
      return v(l.valorMercado && l.preco && l.preco > 0 ? l.valorMercado / l.preco : null);
    case 'pl':
      return v(l.pl);
    case 'pvp':
      return v(l.pvp);
    case 'dy12m':
      return v(l.dy12mPct);
    case 'payout':
      return v(l.payoutPct);
    case 'obrigacoesPl':
      return v(l.obrigacoesPlPct);
    case 'cotistas':
      return v(l.cotistas);
    case 'patrimonio':
      return v(l.patrimonio);
    case 'vpCota':
      return v(f.atual?.vpCota);
    case 'dpa12m':
      return v(f.atual?.dpa12m);
    case 'rendCota12m':
      return v(f.atual?.rend12m);
    case 'lpa':
      return v(f.atual?.lpaTtm);
    case 'vpa':
      return v(f.atual?.vpa);
    case 'evEbitda':
      return v(f.atual?.evEbitda);
    case 'pReceita':
      return v(f.atual?.pReceita);
    case 'historicoPl':
      return v(f.anual?.pl);
    case 'historicoPvp':
      return v(f.anual?.pvp);
    case 'historicoPReceita':
      return v(f.anual?.pReceita);
    default:
      return null;
  }
}

// ===========================================================================
// I/O
// ===========================================================================

const num = (x: unknown): number | null => {
  if (x == null) return null;
  if (typeof x === 'number') return x;
  if (typeof x === 'bigint') return Number(x);
  if (typeof (x as { toNumber?: unknown }).toNumber === 'function') {
    return (x as { toNumber: () => number }).toNumber();
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

async function carregarDeteccoes(prisma: PrismaClient): Promise<Deteccao[]> {
  const [linhas, anuais] = await Promise.all([
    prisma.$queryRaw<LinhaComFlags[]>(Prisma.sql`
      SELECT symbol, classe, cnpj, flags FROM analise_quadro_linhas
      WHERE EXISTS (SELECT 1 FROM unnest(flags) f WHERE f LIKE 'conf:%' OR f LIKE 'rev:%')`),
    prisma.$queryRaw<LinhaComFlags[]>(Prisma.sql`
      SELECT symbol, classe, cnpj, flags FROM asset_multiples_yearly
      WHERE EXISTS (SELECT 1 FROM unnest(flags) f WHERE f LIKE 'conf:%' OR f LIKE 'rev:%')`),
  ]);
  return extrairDeteccoes([...linhas, ...anuais]);
}

const SELECT_ABERTO = {
  id: true,
  symbol: true,
  grupo: true,
  campo: true,
  periodo: true,
  origem: true,
  regraCodigo: true,
  chaveDeteccao: true,
  chaveAberta: true,
  regraAtiva: true,
  emConferencia: true,
  nReportes: true,
} satisfies Prisma.AnaliseCasoDadoSelect;

async function carregarValores(
  prisma: PrismaClient,
  casos: readonly CasoAbertoJob[],
  hoje: string,
): Promise<LerValorCampo> {
  const symbols = [...new Set(casos.map((c) => c.symbol))];
  if (symbols.length === 0) return () => null;
  const anos = casos
    .filter((c) => c.grupo === 'historico' && c.chaveDeteccao && /^\d{4}$/.test(c.chaveDeteccao))
    .map((c) => ({ symbol: c.symbol, anoFiscal: Number(c.chaveDeteccao) }));
  const [linhas, atuais, anuais] = await Promise.all([
    prisma.analiseQuadroLinha.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        geradoEm: true,
        preco: true,
        valorMercado: true,
        pl: true,
        pvp: true,
        dy12mPct: true,
        payoutPct: true,
        obrigacoesPlPct: true,
        cotistas: true,
        patrimonio: true,
      },
    }),
    prisma.assetMultiplesCurrent.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        vpCota: true,
        dpa12m: true,
        rend12m: true,
        lpaTtm: true,
        vpa: true,
        evEbitda: true,
        pReceita: true,
      },
    }),
    anos.length
      ? prisma.assetMultiplesYearly.findMany({
          where: { OR: anos },
          select: { symbol: true, anoFiscal: true, pl: true, pvp: true, pReceita: true },
        })
      : Promise.resolve([]),
  ]);
  const linhaPor = new Map(linhas.map((l) => [l.symbol, l]));
  const atualPor = new Map(atuais.map((a) => [a.symbol, a]));
  const anualPor = new Map(anuais.map((a) => [`${a.symbol}|${a.anoFiscal}`, a]));
  return (caso) => {
    const l = linhaPor.get(caso.symbol);
    const a = atualPor.get(caso.symbol);
    const y = anualPor.get(`${caso.symbol}|${caso.chaveDeteccao}`);
    return valorDoCampo(
      caso.campo,
      {
        linha: l
          ? {
              geradoEm: l.geradoEm,
              preco: num(l.preco),
              valorMercado: num(l.valorMercado),
              pl: l.pl,
              pvp: l.pvp,
              dy12mPct: l.dy12mPct,
              payoutPct: l.payoutPct,
              obrigacoesPlPct: l.obrigacoesPlPct,
              cotistas: l.cotistas,
              patrimonio: num(l.patrimonio),
            }
          : undefined,
        atual: a ?? undefined,
        anual: y ?? undefined,
      },
      hoje,
    );
  };
}

function ehUnicoDuplicado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function executarCuradoria(ctx: JobContexto): Promise<ResultadoJob> {
  const { prisma } = ctx;
  const agora = new Date();
  const hoje = dataCivilSaoPaulo(agora);
  const relatorio: RelatorioCuradoria = { ...RELATORIO_CURADORIA_VAZIO };

  const [deteccoes, abertos, fechados, linhasDeHoje] = await Promise.all([
    carregarDeteccoes(prisma),
    prisma.analiseCasoDado.findMany({
      where: { status: { in: ['aberto', 'em_analise'] } },
      select: SELECT_ABERTO,
    }),
    prisma.analiseCasoDado.findMany({
      where: { status: { in: ['corrigido', 'rejeitado'] }, regraCodigo: { not: null } },
      select: { id: true, symbol: true, regraCodigo: true, chaveDeteccao: true, status: true },
      orderBy: { resolvidoEm: 'desc' },
    }),
    prisma.analiseQuadroLinha.count({ where: { geradoEm: { gte: inicioDoDiaSaoPaulo(agora) } } }),
  ]);
  ctx.contar('linhasLidas', deteccoes.length + abertos.length);

  const processarCessacao = linhasDeHoje > 0;
  if (!processarCessacao) {
    ctx.alertar({
      codigo: 'curadoria_quadro_desatualizado',
      nivel: 'aviso',
      mensagem: 'nenhuma linha do Quadro gerada hoje: "regra parou" não processado',
    });
  }
  const candidatosCessar = abertos.filter((c) => c.regraCodigo && c.regraAtiva);
  const lerValor = processarCessacao
    ? await carregarValores(prisma, candidatosCessar, hoje)
    : () => null;

  const plano = planejarCuradoria({ deteccoes, abertos, fechados, lerValor, processarCessacao });
  relatorio.abertos = plano.criar.length;
  relatorio.atualizados = plano.atualizar.length;
  relatorio.autorresolvidos = plano.autorresolver.length;
  relatorio.regraCessou = plano.cessar.length;

  if (ctx.aplicar) {
    let gravadas = 0;
    for (const { deteccao: d, casoAnteriorId } of plano.criar) {
      if (ctx.estourouPrazo()) break;
      try {
        await prisma.$transaction(async (tx) => {
          const caso = await tx.analiseCasoDado.create({
            data: {
              symbol: d.symbol,
              cnpj: d.cnpj,
              classe: d.classe,
              grupo: d.grupo,
              campo: d.campo,
              periodo: d.chave,
              origem: 'regra',
              regraCodigo: d.regra,
              chaveDeteccao: d.chave,
              chaveAberta: d.chaveCaso,
              status: 'aberto',
              emConferencia: d.tipo === 'conf',
              regraAtiva: true,
              contexto: { tipo: d.tipo, flag: d.flag, regraDesde: hoje },
              casoAnteriorId,
              ultimaDeteccaoEm: agora,
            },
            select: { id: true },
          });
          await tx.analiseCasoEvento.create({
            data: { casoId: caso.id, autorId: null, tipo: 'aberto', para: 'aberto', texto: d.flag },
          });
        });
        gravadas += 1;
      } catch (e: unknown) {
        if (!ehUnicoDuplicado(e)) throw e;
        // corrida com um relato (fatia D) que abriu o mesmo caso: a próxima rodada atualiza
        relatorio.abertos -= 1;
      }
    }

    for (const { caso, deteccao: d, reativou } of plano.atualizar) {
      if (ctx.estourouPrazo()) break;
      const origem = caso.origem === 'usuario' ? 'misto' : caso.origem;
      await prisma.$transaction([
        prisma.analiseCasoDado.update({
          where: { id: caso.id },
          data: {
            origem,
            regraCodigo: d.regra,
            chaveDeteccao: d.chave,
            regraAtiva: true,
            emConferencia: d.tipo === 'conf',
            ...(d.tipo === 'conf' && ehGrupoConferencia(d.grupo) ? { grupo: d.grupo } : {}),
            ultimaDeteccaoEm: agora,
          },
        }),
        prisma.analiseCasoEvento.create({
          data: {
            casoId: caso.id,
            autorId: null,
            tipo: 'regra_disparou',
            de: reativou ? 'regra_parada' : caso.origem,
            para: origem,
            texto: d.flag,
          },
        }),
      ]);
      gravadas += 1;
    }

    for (const caso of plano.autorresolver) {
      if (ctx.estourouPrazo()) break;
      await prisma.$transaction(async (tx) => {
        // condição repetida no UPDATE: um relato chegado agora (nReportes>0) impede o fechamento
        const r = await tx.analiseCasoDado.updateMany({
          where: {
            id: caso.id,
            status: { in: ['aberto', 'em_analise'] },
            nReportes: 0,
            origem: 'regra',
          },
          data: {
            status: 'corrigido',
            resolucao: 'fonte_corrigiu',
            efeitoTela: 'sem_efeito',
            resolvidoEm: agora,
            resolvidoPorId: null,
            chaveAberta: null,
            regraAtiva: false,
            emConferencia: false,
            conferenciaManual: false,
          },
        });
        if (r.count === 0) return;
        await tx.analiseCasoEvento.createMany({
          data: [
            { casoId: caso.id, autorId: null, tipo: 'regra_cessou', texto: caso.regraCodigo },
            {
              casoId: caso.id,
              autorId: null,
              tipo: 'decisao',
              de: 'aberto',
              para: 'corrigido',
              texto: 'fonte_corrigiu',
            },
          ],
        });
      });
      gravadas += 1;
    }

    for (const caso of plano.cessar) {
      if (ctx.estourouPrazo()) break;
      await prisma.$transaction([
        prisma.analiseCasoDado.update({
          where: { id: caso.id },
          data: { regraAtiva: false, emConferencia: false },
        }),
        prisma.analiseCasoEvento.create({
          data: { casoId: caso.id, autorId: null, tipo: 'regra_cessou', texto: caso.regraCodigo },
        }),
      ]);
      gravadas += 1;
    }
    ctx.contar('linhasGravadas', gravadas);
  }

  if (analiseAtivosReporteHabilitado() && process.env.NODE_ENV === 'production') {
    const prazos = await contarPrazos(prisma, hoje);
    relatorio.digestEnviados = await enviarDigestSla(prisma, prazos, agora, ctx.aplicar);
  }

  return { parcial: ctx.estourouPrazo() || undefined, detalhes: { ...relatorio } };
}
