/**
 * Job "derivados" da Análise de Ativos (ex-"scores", fatia D) — diário 10:10 UTC, só banco.
 *
 * Alias: o cron de produção ainda chama /api/cron/analise-ativos/scores e `myfinance-job.sh scores`;
 * CATALOGO_JOBS.scores é o MESMO job (nome 'derivados' em AnaliseJobRun, mesmo lock).
 *
 * Etapas (cada uma checa ctx.estourouPrazo()):
 *  1. eventos corporativos: verificação de todo o universo (a auditoria de proventos usa os eventos
 *     confirmados para o ajuste a hoje, por isso roda antes da gravação dos proventos);
 *  2. auditoria COMPLETA de proventos com reescrita por impressão digital (sem incremental);
 *  3. per-share e múltiplos anuais dos emissores/FIIs alterados desde o último run OK (ou de todos),
 *     mais os emissores com liberação nova da curadoria (v2: refaz conf:historico do ano liberado);
 *  4. 'atuais': múltiplos atuais do universo inteiro (preço de AssetQuoteResumo; TTM da fatia A).
 * D6-a (23/10/2026): o Índice MF, o semáforo e a retenção de asset_scores saíram; a etapa 'scores'
 * continua aceita como alias de 'atuais' (comandos do RUNBOOK e de produção), com aviso.
 * Bloco C (só com ScoringParams.sanidade.conferencia.ligada — v2+): o motor de sanidade
 * (regras/calculo/sanidade) roda dentro de 3 (ponto histórico fora de escala) e de 4 (demais grupos),
 * com as liberações da curadoria lidas UMA vez aqui; o relatório por regra sai em
 * detalhes.atuais.sanidade e regra bloqueante acima de alertaPctQuadro% do Quadro gera alerta 'aviso'.
 * Eventos e proventos são sempre recalculados em memória (baratos); a etapa só decide se GRAVA.
 */
import type { PlAnualPonto } from '@/services/analiseAtivos/calculo/gravarDerivados';
import { recalcularAtuais } from '@/services/analiseAtivos/calculo/recalcularAtuais';
import { recalcularDerivados } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import { recalcularEventos } from '@/services/analiseAtivos/calculo/recalcularEventos';
import { recalcularProventos } from '@/services/analiseAtivos/calculo/recalcularProventos';
import { carregarDadosBase } from '@/services/analiseAtivos/calculo/universo';
import { emissoresAlteradosDesde } from '@/services/analiseAtivos/repositorio/acoes';
import { fiisAlteradosDesde } from '@/services/analiseAtivos/repositorio/fii';
import {
  conjuntoLiberacoes,
  simbolosLiberadosDesde,
} from '@/services/analiseAtivos/repositorio/curadoria';
import { ultimaExecucaoOkPorJob } from '@/services/analiseAtivos/repositorio/jobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const ETAPAS = ['proventos', 'eventos', 'derivados', 'atuais'] as const;
export type Etapa = (typeof ETAPAS)[number];
/** Nomes antigos aceitos nas opções (D6-a): 'scores' = 'atuais'. */
export const ALIASES_ETAPA: Readonly<Record<string, Etapa>> = { scores: 'atuais' };

/**
 * Normaliza a lista de etapas: alias 'scores' vira 'atuais' com aviso no console; etapa
 * desconhecida lança. Sem duplicatas, na ordem pedida.
 */
export function normalizarEtapas(etapas: readonly string[]): Etapa[] {
  const out: Etapa[] = [];
  for (const bruto of etapas) {
    const e = bruto.trim();
    let etapa: Etapa;
    if ((ETAPAS as readonly string[]).includes(e)) etapa = e as Etapa;
    else if (ALIASES_ETAPA[e]) {
      etapa = ALIASES_ETAPA[e];
      console.warn(
        `[analise-ativos] etapa '${e}' é alias de '${etapa}' (D6-a: o Índice MF saiu do job)`,
      );
    } else throw new Error(`etapa inválida: ${e} (válidas: ${ETAPAS.join(', ')})`);
    if (!out.includes(etapa)) out.push(etapa);
  }
  return out;
}

export interface OpcoesDerivados {
  /** etapas a rodar; 'scores' é aceito como alias de 'atuais' */
  etapas?: readonly (Etapa | 'scores')[];
  /** recalcula per-share/múltiplos anuais de TODOS (padrão: só os alterados desde o último run OK) */
  tudo?: boolean;
  /** símbolos extras só para proventos/eventos (script de dev sem cadastro) */
  extras?: { acao?: string[]; fii?: string[] };
  /** D6-a: sem efeito (a retenção de asset_scores saiu com o Índice); aceito por compatibilidade */
  retencao?: boolean;
}

function mb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

export async function executarDerivados(
  ctx: JobContexto,
  opts: OpcoesDerivados = {},
): Promise<ResultadoJob> {
  const etapas = new Set<Etapa>(normalizarEtapas(opts.etapas ?? ETAPAS));
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

  // bloco C (só com sanidade.conferencia.ligada, v2): liberações da curadoria — 1 query por run;
  // as de escopo 'empresa' valem para todos os tickers do mesmo CNPJ
  const liberacoes = ctx.params.sanidade.conferencia.ligada
    ? await conjuntoLiberacoes(ctx.prisma, dados.universo.cnpjDoSimbolo)
    : undefined;
  const memoria = {
    eventos: ev.porSimbolo,
    proventos: pv.porSimbolo,
    cobertura: pv.cobertura,
    verificadoEm: pv.verificadoEm,
    ...(liberacoes ? { liberacoes } : {}),
  };

  // 3. derivados anuais
  let plAnual = new Map<string, PlAnualPonto[]>();
  if (etapas.has('derivados')) {
    t = Date.now();
    const u = dados.universo;
    const todosAcoes = [...new Set(u.acoes.map((a) => a.cnpj))];
    const todosFii = [...new Set(u.fiis.map((f) => f.cnpj))];
    let cnpjsAcoes = todosAcoes;
    let cnpjsFii = todosFii;
    const ultimoOk = opts.tudo
      ? undefined
      : (await ultimaExecucaoOkPorJob(ctx.prisma)).get('derivados');
    if (ultimoOk) {
      const [emAlt, fiiAlt, liberadosNovos] = await Promise.all([
        emissoresAlteradosDesde(ctx.prisma, ultimoOk),
        fiisAlteradosDesde(ctx.prisma, ultimoOk),
        // bloco C: liberação nova do curador (ano histórico) refaz as flags anuais do emissor
        liberacoes ? simbolosLiberadosDesde(ctx.prisma, ultimoOk) : Promise.resolve([]),
      ]);
      // proventos/eventos regravados mudam DPA e ajustes: recalcula também esses emissores
      const simbolosMudaram = new Set([...pv.reescritos, ...ev.alterados, ...liberadosNovos]);
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

  // 4. múltiplos atuais (+ sanidade do bloco C)
  if (etapas.has('atuais')) {
    t = Date.now();
    const at = await recalcularAtuais(ctx, dados, memoria, plAnual, { gravar: true });
    marca('atuais', t);
    rss.atuais = mb();
    detalhes.atuais = at;
  }
  tempos.total = Date.now() - inicio;
  return { detalhes };
}
