/**
 * Job "scores" da Análise de Ativos (fatia D) — diário 10:10 UTC, só banco.
 *
 * Etapas (cada uma checa ctx.estourouPrazo()):
 *  1. eventos corporativos: verificação de todo o universo (a auditoria de proventos usa os eventos
 *     confirmados para o ajuste a hoje, por isso roda antes da gravação dos proventos);
 *  2. auditoria COMPLETA de proventos com reescrita por impressão digital (sem incremental);
 *  3. per-share e múltiplos anuais dos emissores/FIIs alterados desde o último run OK (ou de todos);
 *  4. múltiplos atuais do universo inteiro (preço de AssetQuoteResumo; TTM da fatia A);
 *  5. Índice MF + semáforo (ScoringParams ativo), dataRef = último pregão;
 *  6. retenção de asset_scores.
 * Eventos e proventos são sempre recalculados em memória (baratos); a etapa só decide se GRAVA.
 */
import { recalcularDerivados } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import { recalcularEventos } from '@/services/analiseAtivos/calculo/recalcularEventos';
import { recalcularProventos } from '@/services/analiseAtivos/calculo/recalcularProventos';
import { recalcularScores } from '@/services/analiseAtivos/calculo/recalcularScores';
import { carregarDadosBase } from '@/services/analiseAtivos/calculo/universo';
import { emissoresAlteradosDesde } from '@/services/analiseAtivos/repositorio/acoes';
import { fiisAlteradosDesde } from '@/services/analiseAtivos/repositorio/fii';
import { ultimaExecucaoOkPorJob } from '@/services/analiseAtivos/repositorio/jobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const ETAPAS = ['proventos', 'eventos', 'derivados', 'scores'] as const;
export type Etapa = (typeof ETAPAS)[number];

export interface OpcoesScores {
  etapas?: readonly Etapa[];
  /** recalcula per-share/múltiplos anuais de TODOS (padrão: só os alterados desde o último run OK) */
  tudo?: boolean;
  /** símbolos extras só para proventos/eventos (script de dev sem cadastro) */
  extras?: { acao?: string[]; fii?: string[] };
  /** aplica a retenção de asset_scores (padrão: true) */
  retencao?: boolean;
}

function mb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

export async function executarScores(
  ctx: JobContexto,
  opts: OpcoesScores = {},
): Promise<ResultadoJob> {
  const etapas = new Set<Etapa>(opts.etapas ?? ETAPAS);
  const inicio = Date.now();
  const tempos: Record<string, number> = {};
  const marca = (nome: string, desde: number) => {
    tempos[nome] = Date.now() - desde;
  };
  const detalhes: Record<string, unknown> = {
    etapas: [...etapas],
    tempos,
    rssMb: {} as Record<string, number>,
  };
  const rss = detalhes.rssMb as Record<string, number>;

  let t = Date.now();
  const dados = await carregarDadosBase(ctx.prisma, ctx.params, opts.extras);
  marca('carregar', t);
  rss.carregar = mb();
  detalhes.universo = {
    acoes: dados.universo.acoes.length,
    emissores: dados.universo.emissores.size,
    fiis: dados.universo.fiis.length,
    fiisNaoConferidos: dados.universo.fiis.filter((f) => !f.conferido).length,
    extras: dados.universo.extras.length,
  };

  // 1. eventos
  t = Date.now();
  const ev = await recalcularEventos(ctx, dados, { gravar: etapas.has('eventos') });
  marca('eventos', t);
  rss.eventos = mb();
  detalhes.eventos = {
    simbolos: ev.porSimbolo.size,
    status: ev.contagem,
    alterados: ev.alterados.length,
    gravadas: ev.gravadas,
    descartadosNovos: ev.descartadosNovos.slice(0, 20),
  };
  if (ctx.estourouPrazo()) return { parcial: true, detalhes };

  // 2. proventos
  t = Date.now();
  const pv = await recalcularProventos(ctx, dados, ev.porSimbolo, {
    gravar: etapas.has('proventos'),
  });
  marca('proventos', t);
  rss.proventos = mb();
  detalhes.proventos = {
    simbolos: pv.porSimbolo.size,
    status: pv.contagem,
    flags: pv.flags,
    reescritos: pv.reescritos.length,
    orfaos: pv.orfaos.length,
    gravadas: pv.gravadas,
    amostra: [...pv.porSimbolo.values()]
      .flat()
      .filter((a) => a.status !== 'valido' || a.flags.some((f) => f !== 'sem_data_pagamento'))
      .slice(0, 5)
      .map((a) => ({
        symbol: a.symbol,
        tipo: a.tipoNormalizado,
        valor: a.valor,
        dataExGravada: a.dataExGravada,
        dataComReal: a.dataComReal,
        status: a.status,
        flags: a.flags,
      })),
  };
  if (ctx.estourouPrazo()) return { parcial: true, detalhes };

  const memoria = { eventos: ev.porSimbolo, proventos: pv.porSimbolo, cobertura: pv.cobertura };

  // 3. derivados anuais
  let plAnual = new Map<
    string,
    Array<{ anoFiscal: number; pl: number | null; plNaoSeAplica: boolean }>
  >();
  if (etapas.has('derivados')) {
    t = Date.now();
    const u = dados.universo;
    const todosAcoes = [...new Set(u.acoes.map((a) => a.cnpj))];
    const todosFii = [...new Set(u.fiis.map((f) => f.cnpj))];
    let cnpjsAcoes = todosAcoes;
    let cnpjsFii = todosFii;
    const ultimoOk = opts.tudo
      ? undefined
      : (await ultimaExecucaoOkPorJob(ctx.prisma)).get('scores');
    if (ultimoOk) {
      const [emAlt, fiiAlt] = await Promise.all([
        emissoresAlteradosDesde(ctx.prisma, ultimoOk),
        fiisAlteradosDesde(ctx.prisma, ultimoOk),
      ]);
      // proventos/eventos regravados mudam DPA e ajustes: recalcula também esses emissores
      const simbolosMudaram = new Set([...pv.reescritos, ...ev.alterados]);
      const cnpjsMudaram = new Set(
        [...simbolosMudaram].map((s) => u.cnpjDoSimbolo.get(s)).filter((c): c is string => !!c),
      );
      const setA = new Set([...emAlt, ...cnpjsMudaram]);
      const setF = new Set([...fiiAlt, ...cnpjsMudaram]);
      cnpjsAcoes = todosAcoes.filter((c) => setA.has(c));
      cnpjsFii = todosFii.filter((c) => setF.has(c));
    }
    const dv = await recalcularDerivados(
      ctx,
      dados,
      memoria,
      { cnpjsAcoes, cnpjsFii },
      { gravar: true },
    );
    plAnual = dv.plAnual;
    marca('derivados', t);
    rss.derivados = mb();
    detalhes.derivados = {
      desde: ultimoOk?.toISOString() ?? null,
      empresas: dv.empresas,
      fiis: dv.fiis,
      linhasPerShare: dv.linhasPerShare,
      linhasMultiplos: dv.linhasMultiplos,
      gravadas: dv.gravadas,
      flags: dv.flags,
    };
    if (ctx.estourouPrazo()) return { parcial: true, detalhes };
  }

  // 4–6. múltiplos atuais, scores e retenção
  if (etapas.has('scores')) {
    t = Date.now();
    const sc = await recalcularScores(ctx, dados, memoria, plAnual, {
      gravar: true,
      retencao: opts.retencao ?? true,
    });
    marca('scores', t);
    rss.scores = mb();
    detalhes.scores = sc;
  }
  tempos.total = Date.now() - inicio;
  return { detalhes };
}
