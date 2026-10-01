/**
 * Backfill do COTAHIST (fatia C da Fase 0) — SCRIPT, nunca cron.
 *
 * Passo 2 do backfill (--so-cadastro): ClassifSetorial ⇒ asset_setores_b3.
 * Passo 5: COTAHIST anual (COTAHIST_A{ANO}.ZIP, até ~90 MB zipado / ~500 MB de texto, lido em
 * streaming — nunca inteiro na memória) ⇒ asset_quotes_daily, e no fim o resumo de liquidez.
 *
 * Modos:
 *   --modo=completo  todos os pregões de cada ano (produção)
 *   --modo=dev       (padrão) diário completo desde 2025-01-01; para anos < 2025 só os 5 últimos
 *                    pregões de cada fim de trimestre (preço de fim de período p/ múltiplos anuais e
 *                    exercício fora de dezembro) — mantém o banco dev < 450 MB
 * Retomável por ano: pula o ano cujo arquivo já foi processado até o fim neste modo
 * (AnaliseFonteArquivo.processadoEm + jobUltimo 'backfill:cotahist:<modo>'); --forcar reprocessa
 * (skipDuplicates torna a regravação inofensiva). O ano corrente nunca é pulado.
 * Dry-run por padrão: não escreve nada (nem AnaliseJobRun); com o zip no --cache-dir, lê e conta as
 * linhas que gravaria; sem cache, só mostra o que baixaria.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-cotahist.ts --anos=2015-2026 --modo=dev --cache-dir=$CACHE
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-cotahist.ts --anos=2016 --modo=dev --cache-dir=$CACHE --apply
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-cotahist.ts --so-cadastro --apply
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-cotahist.ts --como-cron --apply   # = cron cotahist
 * Opções: --cache-dir=dirA,dirB (procura nas duas, grava na 1ª) · --forcar · --sem-resumo ·
 *         --perfil=dev|completo (sinônimo de --modo)
 * Em produção: só pelo RUNBOOK, com OK humano, em janela noturna; NODE_OPTIONS=--max-old-space-size=512.
 */
import { stat } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  LIMITES_B3,
  nomeCotahistAnual,
  urlCotahistAnual,
} from '../../src/services/analiseAtivos/b3/b3Arquivos';
import { sincronizarB3Cadastro } from '../../src/services/analiseAtivos/b3/sincronizarB3Cadastro';
import {
  processarArquivoCotahist,
  recalcularResumoCotacoes,
  sincronizarCotahist,
} from '../../src/services/analiseAtivos/b3/sincronizarCotahist';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import { nomeBackfill } from '../../src/services/analiseAtivos/jobs/nomesJobs';
import { obterScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import { pregoesEntre } from '../../src/services/analiseAtivos/regras/comum/pregoes';
import { obterFonteArquivo } from '../../src/services/analiseAtivos/repositorio/fontesArquivo';
import type {
  AlertaJob,
  JobContexto,
  RelatorioJob,
  ResultadoJob,
} from '../../src/services/analiseAtivos/tipos';

const ANO_DEV_DIARIO = 2025;
const PREGOES_FIM_PERIODO = 5;
const PRAZO_BACKFILL_MS = 6 * 60 * 60 * 1000;

type Modo = 'dev' | 'completo';

interface Args {
  anos: number[];
  modo: Modo;
  cacheDir: string[];
  aplicar: boolean;
  soCadastro: boolean;
  comoCron: boolean;
  forcar: boolean;
  semResumo: boolean;
}

function valor(nome: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : undefined;
}

function lerAnos(s: string | undefined): number[] {
  const anoAtual = new Date().getUTCFullYear();
  if (!s) return [];
  const out = new Set<number>();
  for (const parte of s.split(',')) {
    const m = /^(\d{4})(?:-(\d{4}))?$/.exec(parte.trim());
    if (!m) throw new Error(`--anos inválido: ${parte}`);
    const de = Number(m[1]);
    const ate = Number(m[2] ?? m[1]);
    if (de > ate || de < 1986 || ate > anoAtual)
      throw new Error(`--anos fora do intervalo: ${parte}`);
    for (let a = de; a <= ate; a++) out.add(a);
  }
  return [...out].sort((a, b) => a - b);
}

function lerArgs(): Args {
  const modo = (valor('modo') ?? valor('perfil') ?? 'dev') as Modo;
  if (modo !== 'dev' && modo !== 'completo') throw new Error(`--modo inválido: ${modo}`);
  const args: Args = {
    anos: lerAnos(valor('anos')),
    modo,
    cacheDir: (valor('cache-dir') ?? '').split(',').filter((d) => d.length > 0),
    aplicar: process.argv.includes('--apply'),
    soCadastro: process.argv.includes('--so-cadastro'),
    comoCron: process.argv.includes('--como-cron'),
    forcar: process.argv.includes('--forcar'),
    semResumo: process.argv.includes('--sem-resumo'),
  };
  if (!args.soCadastro && !args.comoCron && args.anos.length === 0) {
    throw new Error('informe --anos=AAAA[-AAAA] (ou --so-cadastro / --como-cron)');
  }
  return args;
}

async function estaNoCache(nome: string, dirs: string[]): Promise<boolean> {
  for (const d of dirs) {
    try {
      if ((await stat(path.join(d, nome))).size > 0) return true;
    } catch {
      // não está nesta pasta
    }
  }
  return false;
}

/** Datas 'AAAAMMDD' dos 5 últimos pregões de cada trimestre do ano (perfil dev, anos < 2025). */
function datasFimDePeriodo(ano: number): Set<string> {
  const out = new Set<string>();
  for (const mes of ['03', '06', '09', '12']) {
    const ultimoDia = new Date(Date.UTC(ano, Number(mes), 0)).getUTCDate();
    for (const d of pregoesEntre(`${ano}-${mes}-01`, `${ano}-${mes}-${ultimoDia}`).slice(
      -PREGOES_FIM_PERIODO,
    )) {
      out.add(d.replace(/-/g, ''));
    }
  }
  return out;
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);

function imprimirRelatorio(r: RelatorioJob): void {
  console.log(
    `  run ${r.id || '(sem id)'} · ${r.job} · status=${r.status} · ${(r.duracaoMs / 1000).toFixed(1)} s · ` +
      `lidas=${r.linhasLidas} gravadas=${r.linhasGravadas} rejeitadas=${r.rejeitadas} · rssPico=${r.rssPicoMb} MB`,
  );
  for (const a of r.alertas) console.log(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`);
  if (r.erro) console.log(`  ERRO: ${r.erro}`);
}

/** Contexto de dry-run: nada é gravado (nem o AnaliseJobRun). */
async function contextoDryRun(prisma: PrismaClient): Promise<JobContexto> {
  let params = SCORING_PARAMS_V1;
  let paramsVersion = 1;
  try {
    const p = await obterScoringParams(prisma);
    params = p.params;
    paramsVersion = p.versao;
  } catch {
    console.log('  (ScoringParams do banco indisponível: usando v1 do código)');
  }
  const contadores = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const prazo = Date.now() + PRAZO_BACKFILL_MS;
  return {
    prisma,
    prazo,
    restanteMs: () => Math.max(0, prazo - Date.now()),
    estourouPrazo: () => Date.now() >= prazo,
    alertar: (a: AlertaJob) => console.log(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`),
    contar: (campo, n = 1) => {
      contadores[campo] += n;
    },
    params,
    paramsVersion,
    hoje: new Date().toISOString().slice(0, 10),
    origem: 'script',
    aplicar: false,
  };
}

async function backfillAnos(ctx: JobContexto, args: Args): Promise<ResultadoJob> {
  const anoAtual = Number(ctx.hoje.slice(0, 4));
  const porAno: Array<Record<string, unknown>> = [];
  let rssPico = rssMb();
  const amostrador = setInterval(() => {
    rssPico = Math.max(rssPico, rssMb());
  }, 500);
  amostrador.unref();

  try {
    for (const ano of args.anos) {
      const nome = nomeCotahistAnual(ano);
      const url = urlCotahistAnual(ano);
      const filtroDev = args.modo === 'dev' && ano < ANO_DEV_DIARIO ? datasFimDePeriodo(ano) : null;
      // Retomada: ano fechado cujo arquivo já foi processado ATÉ O FIM (trailer conferido e último
      // lote gravado) neste modo ou no completo. "Último pregão gravado" não basta: uma falha no
      // trailer deixa o último lote (até 999 linhas do último pregão) sem gravar.
      const jobAno = `backfill:cotahist:${args.modo}`;
      if (!args.forcar && ano < anoAtual) {
        const fonte = await obterFonteArquivo(ctx.prisma, url);
        if (
          fonte?.processadoEm &&
          (fonte.jobUltimo === jobAno || fonte.jobUltimo === 'backfill:cotahist:completo')
        ) {
          console.log(
            `- ${ano}: ${nome} já processado em ${fonte.processadoEm.toISOString()} — pulado`,
          );
          porAno.push({ ano, status: 'pulado' });
          continue;
        }
      }
      if (ctx.estourouPrazo()) {
        console.log(`- ${ano}: prazo esgotado — rode de novo para continuar`);
        return { parcial: true, detalhes: { porAno } };
      }

      const t0 = Date.now();
      const filtroTxt = filtroDev
        ? `${filtroDev.size} pregões de fim de trimestre`
        : 'todos os pregões';
      if (!ctx.aplicar && !(await estaNoCache(nome, args.cacheDir))) {
        console.log(`- ${ano}: ${nome} fora do cache — baixaria ${url} (${filtroTxt})`);
        porAno.push({ ano, status: 'baixaria' });
        continue;
      }
      console.log(`- ${ano}: ${nome} (${filtroTxt})`);
      {
        const r = await processarArquivoCotahist(ctx, {
          url,
          nome,
          maxBytes: LIMITES_B3.maxBytesCotahistAnual,
          timeoutMs: LIMITES_B3.timeoutMsBackfillAnual,
          cacheDir: args.cacheDir,
          aceitarDataBruta: filtroDev ? (d) => filtroDev.has(d) : undefined,
          job: jobAno,
        });
        const seg = (Date.now() - t0) / 1000;
        const linha = {
          ano,
          status: r.status,
          doCache: r.doCache,
          bytes: r.bytes,
          linhasArquivo: r.estat.linhas,
          emitidos: r.estat.emitidos,
          rejeitados: r.estat.rejeitados,
          gravadas: r.gravadas,
          primeiraData: r.estat.primeiraData,
          ultimaData: r.estat.ultimaData,
          segundos: Math.round(seg * 10) / 10,
          rssPicoMb: rssPico,
        };
        porAno.push(linha);
        console.log(
          `    ${r.status} · ${(r.bytes / 1e6).toFixed(1)} MB${r.doCache ? ' (cache)' : ''} · ` +
            `${r.estat.linhas} linhas no arquivo · ${r.estat.emitidos} registros 010/BDI 02-12 ` +
            `(${r.estat.primeiraData}…${r.estat.ultimaData}) · rejeitados ${r.estat.rejeitados} · ` +
            `${ctx.aplicar ? `gravadas ${r.gravadas}` : 'dry-run: nada gravado'} · ${seg.toFixed(1)} s · ` +
            `rss pico ${rssPico} MB`,
        );
      }
    }
  } finally {
    clearInterval(amostrador);
  }

  let resumo: unknown = null;
  if (!args.semResumo) {
    const t0 = Date.now();
    const r = await recalcularResumoCotacoes(ctx.prisma, ctx.params, ctx.alertar, {
      aplicar: ctx.aplicar,
    });
    resumo = { ...r, saltos: r.saltos.slice(0, 20), segundos: (Date.now() - t0) / 1000 };
    console.log(
      `- resumo: último pregão ${r.ultimoPregao} · ${r.simbolos} símbolos · ${r.negociados30} negociados em 30 pregões ` +
        `(${r.fiisNegociados30} BDI 12) · ${r.baixaLiquidez} baixa liquidez · ${r.saltos.length} saltos sem evento` +
        `${ctx.aplicar ? '' : ' (dry-run: não gravado)'}`,
    );
  }
  return { detalhes: { modo: args.modo, porAno, resumo, rssPicoMb: rssPico } };
}

async function main() {
  const args = lerArgs();
  const prisma = new PrismaClient();
  console.log(
    `=== backfill-cotahist (${args.aplicar ? 'APPLY' : 'dry-run'}) modo=${args.modo} ` +
      `anos=${args.anos.join(',') || '-'} cache=${args.cacheDir.join(',') || '-'} ===`,
  );
  try {
    if (!args.aplicar && !args.comoCron && !args.soCadastro && args.cacheDir.length === 0) {
      console.log('  sem --cache-dir: o dry-run só lista os arquivos que seriam baixados');
    }

    if (args.soCadastro) {
      const fn = (ctx: JobContexto) => sincronizarB3Cadastro(ctx, { cacheDir: args.cacheDir });
      if (args.aplicar) {
        imprimirRelatorio(
          await executarJobAnalise(nomeBackfill('b3-cadastro'), fn, {
            origem: 'script',
            aplicar: true,
            prisma,
            prazoMs: 10 * 60 * 1000,
            parametros: { soCadastro: true },
          }),
        );
      } else {
        const r = await fn(await contextoDryRun(prisma));
        console.log('  dry-run:', JSON.stringify(r.detalhes));
      }
      return;
    }

    if (args.comoCron) {
      const fn = (ctx: JobContexto) => sincronizarCotahist(ctx, { cacheDir: args.cacheDir });
      if (args.aplicar) {
        imprimirRelatorio(
          await executarJobAnalise('cotahist', fn, { origem: 'script', aplicar: true, prisma }),
        );
      } else {
        const r = await fn(await contextoDryRun(prisma));
        console.log('  dry-run:', JSON.stringify(r.detalhes));
      }
      return;
    }

    if (!args.aplicar) {
      const ctx = await contextoDryRun(prisma);
      if (args.cacheDir.length === 0) {
        for (const ano of args.anos) console.log(`- ${ano}: baixaria ${urlCotahistAnual(ano)}`);
        return;
      }
      await backfillAnos(ctx, args);
      console.log('  dry-run concluído: nada foi gravado. Use --apply para gravar.');
      return;
    }

    imprimirRelatorio(
      await executarJobAnalise(nomeBackfill('cotahist'), (ctx) => backfillAnos(ctx, args), {
        origem: 'script',
        aplicar: true,
        prisma,
        prazoMs: PRAZO_BACKFILL_MS,
        lockTtlMs: PRAZO_BACKFILL_MS,
        parametros: { anos: args.anos, modo: args.modo, forcar: args.forcar },
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
