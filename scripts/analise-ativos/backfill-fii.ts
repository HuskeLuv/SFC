/**
 * Backfill de FIIs (Análise de Ativos, fatia B): lista B3 + FiiTickerMap, Informe Mensal
 * (FiiMonthly, todos os meses desde --desde) e Informe Trimestral (FiiQuarterly).
 *
 * Script, nunca cron. Dry-run por padrão (imprime o plano e as contagens; não grava); --apply
 * explícito. Idempotente (linha igual não é regravada; versão menor nunca sobrescreve) e retomável
 * (rodar de novo continua de onde parou; --anos restringe). Mesmo streaming dos crons; registra
 * AnaliseJobRun com job 'backfill:fii-*' e origem 'script'.
 *
 * Ordem (spec: passo 4 e passo 7):
 *   --so-cadastro   só lista B3 + FiiTickerMap (consulta o detalhe da B3 de TODOS os fundos)
 *   --reconferir    refaz só a conferência valor de mercado/PL (depois do COTAHIST; sem detalhes)
 *   (padrão)        cadastro ⇒ mensal ⇒ trimestral
 *   --sem-cadastro  pula o cadastro (usa o mapa gravado)
 *   --como-cron=fii-cadastro|fii-mensal|fii-trimestral  roda exatamente a função do cron
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-fii.ts --desde=2016 --cache-dir=$CACHE
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-fii.ts --desde=2016 --cache-dir=$CACHE --apply
 * Opções: --anos=2025,2026 · --lista-b3=<json {itens:[...]}> · --max-detalhes=N
 */
import { readFileSync } from 'fs';
import { lerCsv } from '../../src/services/analiseAtivos/fontes/csvStream';
import { linhasDaEntrada } from '../../src/services/analiseAtivos/fontes/zipStream';
import {
  entradasObrigatorias,
  inicioDoMes,
  obterArquivo,
  urlInformeFii,
} from '../../src/services/analiseAtivos/fii/fiiArquivos';
import type { ItemListaB3Bruto } from '../../src/services/analiseAtivos/fii/listaB3Fii';
import { COLUNAS_MENSAL } from '../../src/services/analiseAtivos/fii/parserInformeMensal';
import { sincronizarFiiCadastro } from '../../src/services/analiseAtivos/fii/sincronizarFiiCadastro';
import { sincronizarFiiMensal } from '../../src/services/analiseAtivos/fii/sincronizarFiiMensal';
import { sincronizarFiiTrimestral } from '../../src/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import { nomeBackfill } from '../../src/services/analiseAtivos/jobs/nomesJobs';
import { prisma } from '../../src/lib/prisma';
import type { NomeJob, RelatorioJob } from '../../src/services/analiseAtivos/tipos';

const PRAZO_SCRIPT_MS = 4 * 60 * 60 * 1000;

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

const aplicar = arg('apply') === 'true';
const cacheDir = arg('cache-dir');
const hoje = new Date().toISOString().slice(0, 10);
const anoAtual = Number(hoje.slice(0, 4));
const anos = arg('anos')
  ? arg('anos')!.split(',').map(Number)
  : Array.from(
      { length: anoAtual - Number(arg('desde') ?? 2016) + 1 },
      (_, i) => Number(arg('desde') ?? 2016) + i,
    );

const rssMb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);
let picoRss = rssMb();
const amostrador = setInterval(() => {
  picoRss = Math.max(picoRss, rssMb());
}, 250);
amostrador.unref();

function imprimir(r: RelatorioJob, detalhes?: unknown) {
  console.log(
    `  → ${r.job}: ${r.status} em ${(r.duracaoMs / 1000).toFixed(1)} s · lidas ${r.linhasLidas} · ` +
      `gravadas ${r.linhasGravadas} · rejeitadas ${r.rejeitadas} · RSS pico ${r.rssPicoMb} MB` +
      (r.erro ? ` · ERRO ${r.erro}` : ''),
  );
  const porCodigo = new Map<string, number>();
  for (const a of r.alertas)
    porCodigo.set(`${a.nivel}:${a.codigo}`, (porCodigo.get(`${a.nivel}:${a.codigo}`) ?? 0) + 1);
  if (porCodigo.size)
    console.log(`    alertas: ${[...porCodigo].map(([k, n]) => `${k}×${n}`).join(' · ')}`);
  for (const a of r.alertas.filter((x) => x.nivel !== 'info').slice(0, 15)) {
    console.log(`    [${a.nivel}] ${a.codigo}: ${a.mensagem}`);
  }
  if (detalhes) console.log(`    detalhes: ${JSON.stringify(detalhes).slice(0, 4000)}`);
}

/** 1º mês de informe de cada CNPJ (validFrom do backfill do mapa). Lê só o `geral` de cada ano. */
async function primeiroMesPorCnpj(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ano of anos) {
    const url = urlInformeFii('mensal', ano);
    const arq = await obterArquivo(prisma, url, { cacheDir, condicional: false, registrar: false });
    try {
      if (!arq.caminho) continue;
      const e = await entradasObrigatorias(arq.caminho, url, {
        geral: /^inf_mensal_fii_geral_\d{4}\.csv$/,
      });
      for await (const l of lerCsv(linhasDaEntrada(arq.caminho, e.geral), {
        separador: ';',
        obrigatorias: COLUNAS_MENSAL.geral.slice(0, 2),
        aliases: { CNPJ_Fundo: 'CNPJ_Fundo_Classe' },
        arquivo: url,
      })) {
        const cnpj = l.get('CNPJ_Fundo_Classe');
        const ref = inicioDoMes(l.get('Data_Referencia'));
        const atual = out.get(cnpj);
        if (!atual || ref < atual) out.set(cnpj, ref);
      }
    } finally {
      await arq.descartar();
    }
  }
  return out;
}

async function rodar(
  job: NomeJob,
  fn: Parameters<typeof executarJobAnalise>[1],
  parametros: Record<string, unknown>,
) {
  const r = await executarJobAnalise(job, fn, {
    origem: 'script',
    aplicar,
    prazoMs: PRAZO_SCRIPT_MS,
    parametros,
  });
  const run = r.id
    ? await prisma.analiseJobRun.findUnique({ where: { id: r.id }, select: { detalhes: true } })
    : null;
  imprimir(r, run?.detalhes);
  return r;
}

async function main() {
  console.log(
    `=== backfill FII (${aplicar ? 'APPLY' : 'dry-run'}) anos ${anos[0]}–${anos[anos.length - 1]}` +
      `${cacheDir ? ` · cache ${cacheDir}` : ''} ===`,
  );
  const inicio = Date.now();
  const listaB3 = arg('lista-b3')
    ? (JSON.parse(readFileSync(arg('lista-b3')!, 'utf8')) as { itens: ItemListaB3Bruto[] }).itens
    : undefined;

  const comoCron = arg('como-cron');
  if (comoCron) {
    const fns = {
      'fii-cadastro': sincronizarFiiCadastro,
      'fii-mensal': sincronizarFiiMensal,
      'fii-trimestral': sincronizarFiiTrimestral,
    } as const;
    if (!(comoCron in fns)) throw new Error(`--como-cron inválido: ${comoCron}`);
    const f = fns[comoCron as keyof typeof fns];
    const r = await executarJobAnalise(comoCron as NomeJob, (ctx) => f(ctx), {
      origem: 'script',
      aplicar,
      prazoMs: 120_000,
    });
    const run = r.id
      ? await prisma.analiseJobRun.findUnique({ where: { id: r.id }, select: { detalhes: true } })
      : null;
    imprimir(r, run?.detalhes);
  } else {
    const reconferir = arg('reconferir') === 'true';
    const soCadastro = arg('so-cadastro') === 'true' || reconferir;
    if (arg('sem-cadastro') !== 'true') {
      console.log(reconferir ? '# cadastro (reconferir PL×cotação)' : '# cadastro (lista B3)');
      const primeiros = reconferir ? undefined : await primeiroMesPorCnpj();
      const maxDetalhes = reconferir ? 0 : Number(arg('max-detalhes') ?? Infinity);
      await rodar(
        nomeBackfill('fii-cadastro'),
        (ctx) =>
          sincronizarFiiCadastro(ctx, {
            listaB3,
            cacheDir,
            primeiroMesPorCnpj: primeiros,
            maxDetalhes,
            pausaDetalheMs: 100,
          }),
        { reconferir, maxDetalhes: String(maxDetalhes) },
      );
    }
    if (!soCadastro) {
      console.log('# informe mensal');
      await rodar(
        nomeBackfill('fii-mensal'),
        (ctx) =>
          sincronizarFiiMensal(ctx, { anos, cacheDir, condicional: false, todosOsMeses: true }),
        { anos },
      );
      console.log('# informe trimestral');
      await rodar(
        nomeBackfill('fii-trimestral'),
        (ctx) => sincronizarFiiTrimestral(ctx, { anos, cacheDir, condicional: false }),
        { anos },
      );
    }
  }
  console.log(
    `=== fim em ${((Date.now() - inicio) / 1000).toFixed(1)} s · RSS pico do processo ${picoRss} MB ===`,
  );
  if (!aplicar) console.log('dry-run: nada foi gravado nas tabelas FII. Use --apply.');
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearInterval(amostrador);
    await prisma.$disconnect();
  });
