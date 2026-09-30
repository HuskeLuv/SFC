/**
 * Backfill das companhias abertas da CVM (fatia A): FCA (universo + tickers), FRE item f (nº de ações
 * até FY2021), DFP e ITR → cvm_companies, cvm_company_tickers, asset_fundamentals_period,
 * asset_statement_lines e asset_share_counts. Usa EXATAMENTE a função do cron (sincronizarCvmCias).
 *
 * Script, nunca cron. Dry-run por padrão (lê tudo e imprime contagens e bytes estimados, sem gravar);
 * --apply grava. Idempotente e retomável: (cnpj, versão) já gravado é pulado; interrompido, é só rodar
 * de novo. Registra AnaliseJobRun 'backfill:cvm-cias' (origem 'script') com tempo e pico de RSS.
 *
 * Uso (DEV):
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-cvm-cias.ts \
 *     --anos=2014-2026 --docs=fca,dfp,itr,fre --perfil=dev --cache-dir=$CACHE          # dry-run
 *   NODE_OPTIONS=--max-old-space-size=512 npx tsx --env-file=.env \
 *     scripts/analise-ativos/backfill-cvm-cias.ts --anos=2014-2026 --docs=fca,dfp,itr,fre \
 *     --perfil=dev --cache-dir=$CACHE --apply
 *   # a mesma função e janela do cron (job cvm-cias:<doc>), sem cache:
 *   NODE_OPTIONS=--max-old-space-size=384 npx tsx --env-file=.env \
 *     scripts/analise-ativos/backfill-cvm-cias.ts --como-cron --docs=itr --apply
 *
 * Opções: --perfil=dev|completo (completo = AssetStatementLine de todo o universo; exige
 * NODE_ENV=production ou --forcar-completo) · --reprocessar (ignora o registro de arquivo já
 * processado) · --cache-dir (reusa/guarda os zips). Perfil dev: ITR só 2024+ e Raio-X só das 40
 * companhias do subconjunto. Em produção: só pelo RUNBOOK, com OK humano, em janela noturna.
 */
import {
  executarJobAnalise,
  type OpcoesJob,
} from '../../src/services/analiseAtivos/jobs/executarJob';
import { jobCvmCias, nomeBackfill } from '../../src/services/analiseAtivos/jobs/nomesJobs';
import {
  carregarFreAcoes,
  sincronizarCvmCias,
  type DetalheArquivo,
  type PerfilLinhas,
} from '../../src/services/analiseAtivos/acoes/sincronizarCvmCias';
import { prisma } from '../../src/lib/prisma';
import type { RelatorioJob } from '../../src/services/analiseAtivos/tipos';

type Doc = 'fca' | 'dfp' | 'itr' | 'fre';
const PRAZO_BACKFILL_MS = 4 * 60 * 60 * 1000;
const ITR_DESDE_DEV = 2024;
/** bytes/linha aproximados no Postgres (heap + índices), para o dry-run estimar o tamanho */
const BYTES_LINHA = { fundamentos: 700, linhasRaioX: 190, contagens: 260 };

function args() {
  const a = new Map<string, string>();
  for (const x of process.argv.slice(2)) {
    const [k, v] = x.replace(/^--/, '').split('=');
    a.set(k, v ?? 'true');
  }
  return a;
}

function anosDe(s: string | undefined, padrao: number[]): number[] {
  if (!s) return padrao;
  const out = new Set<number>();
  for (const parte of s.split(',')) {
    const [a, b] = parte.split('-').map(Number);
    if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) {
      throw new Error(`--anos inválido: ${s}`);
    }
    for (let y = a; y <= (b ?? a); y++) out.add(y);
  }
  return [...out].sort();
}

function imprimir(r: RelatorioJob) {
  const { alertas, ...resto } = r;
  console.log(JSON.stringify(resto, null, 2));
  const porCodigo = new Map<string, number>();
  for (const a of alertas) porCodigo.set(a.codigo, (porCodigo.get(a.codigo) ?? 0) + 1);
  console.log('alertas por código:', Object.fromEntries(porCodigo));
  for (const a of alertas.filter((x) => x.nivel !== 'info').slice(0, 15)) {
    console.log(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`);
  }
}

async function main() {
  const a = args();
  const aplicar = a.has('apply');
  const docs = (a.get('docs') ?? 'fca,dfp,itr,fre').split(',') as Doc[];
  const cacheDir = a.get('cache-dir');
  const reprocessar = a.has('reprocessar');
  const perfil = (a.get('perfil') ?? 'dev') as PerfilLinhas;
  if (perfil !== 'dev' && perfil !== 'completo') throw new Error('--perfil=dev|completo');
  if (perfil === 'completo' && process.env.NODE_ENV !== 'production' && !a.has('forcar-completo')) {
    throw new Error('--perfil=completo exige NODE_ENV=production ou --forcar-completo');
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const anoAtual = Number(hoje.slice(0, 4));

  if (a.has('como-cron')) {
    for (const doc of docs) {
      if (doc === 'fre') continue;
      const r = await executarJobAnalise(
        jobCvmCias(doc),
        (ctx) => sincronizarCvmCias(ctx, { doc }),
        {
          origem: 'script',
          aplicar,
          parametros: { doc, comoCron: true },
        },
      );
      console.log(`=== cvm-cias:${doc} (como cron, ${aplicar ? 'APPLY' : 'dry-run'}) ===`);
      imprimir(r);
    }
    return;
  }

  const anos = anosDe(a.get('anos'), [anoAtual - 1, anoAtual]);
  const opcoes: OpcoesJob = {
    origem: 'script',
    aplicar,
    prazoMs: PRAZO_BACKFILL_MS,
    lockTtlMs: PRAZO_BACKFILL_MS,
    parametros: { anos, docs, perfil, cacheDir: cacheDir ?? null, reprocessar },
  };
  console.log(
    `=== backfill cvm-cias (${aplicar ? 'APPLY' : 'dry-run'}) anos=${anos.join(',')} docs=${docs} perfil=${perfil} ===`,
  );

  const r = await executarJobAnalise(
    nomeBackfill('cvm-cias'),
    async (ctx) => {
      const arquivos: DetalheArquivo[] = [];
      let universo: Map<string, string[]> | undefined;
      if (docs.includes('fca')) {
        const f = await sincronizarCvmCias(ctx, {
          doc: 'fca',
          anos: [anos[anos.length - 1]],
          cacheDir,
          perfil,
          reprocessar,
        });
        arquivos.push(...((f.detalhes?.arquivos ?? []) as DetalheArquivo[]));
        // dry-run: o FCA não foi gravado, então o universo vem do próprio arquivo lido
        if (!aplicar) universo = f.universoFca;
      }
      const fre = docs.includes('fre')
        ? await carregarFreAcoes(ctx, anos, { cacheDir }, universo && new Set(universo.keys()))
        : undefined;
      if (fre) {
        console.log(
          `FRE item f: ${[...fre].map(([fy, m]) => `FY${fy}=${m.size}`).join(' ') || 'nenhum'}`,
        );
      }
      for (const doc of ['dfp', 'itr'] as const) {
        if (!docs.includes(doc)) continue;
        const anosDoc =
          doc === 'itr' && perfil === 'dev' ? anos.filter((y) => y >= ITR_DESDE_DEV) : anos;
        for (const ano of anosDoc) {
          const t0 = Date.now();
          const d = await sincronizarCvmCias(ctx, {
            doc,
            anos: [ano],
            cacheDir,
            perfil,
            reprocessar,
            freAcoes: fre,
            universo,
          });
          const det = (d.detalhes?.arquivos ?? []) as DetalheArquivo[];
          arquivos.push(...det);
          for (const x of det) {
            const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
            console.log(
              `  ${doc} ${ano}: ${x.status} docs=${x.docsUniverso ?? '-'} pendentes=${x.pendentes ?? '-'} fund=${x.fundamentos ?? 0} raioX=${x.linhasRaioX ?? 0} acoes=${x.contagens ?? 0} ttm=${x.ttm ?? 0} (${((Date.now() - t0) / 1000).toFixed(1)} s, rss ${rss} MB)`,
            );
          }
          if (d.parcial) return { parcial: true, detalhes: { arquivos } };
        }
      }
      const soma = (k: keyof typeof BYTES_LINHA) =>
        arquivos.reduce((s, x) => s + ((x[k] as number | undefined) ?? 0), 0);
      const estimativa = Object.fromEntries(
        (Object.keys(BYTES_LINHA) as Array<keyof typeof BYTES_LINHA>).map((k) => [
          k,
          { linhas: soma(k), mbEstimados: +((soma(k) * BYTES_LINHA[k]) / 1024 / 1024).toFixed(1) },
        ]),
      );
      console.log('estimativa de gravação:', JSON.stringify(estimativa));
      return { detalhes: { arquivos, estimativa } };
    },
    opcoes,
  );
  imprimir(r);
  if (r.status === 'falha') process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
