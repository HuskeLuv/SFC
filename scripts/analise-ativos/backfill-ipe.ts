/**
 * Backfill do IPE (assembleias) + datas de resultado em asset_eventos — fatia E, passo 8 do RUNBOOK
 * (depois do backfill de DFP/ITR da fatia A, que alimenta as entregas).
 *
 * Dry-run por padrão (lê tudo, calcula o plano e imprime; não grava asset_eventos nem
 * analise_fonte_arquivos). --apply grava. Idempotente (diff por (cnpj, tipo, chave)) e retomável:
 * rodar de novo só grava o que mudou; um ano por vez com --anos=AAAA.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-ipe.ts --anos=2024-2026 [--cache-dir=DIR]
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-ipe.ts --anos=2024-2026 --apply
 *   npx tsx --env-file=.env scripts/analise-ativos/backfill-ipe.ts --como-cron [--apply]
 *
 * Opções: --anos=AAAA[-AAAA] (padrão: ano corrente) · --cache-dir=DIR (reusa ipe_cia_aberta_AAAA.zip
 * baixados; ano sem arquivo no cache é baixado da CVM) · --forcar (ignora ETag) · --sem-resultados
 * (só assembleias) · --perfil=dev|completo (aceito por simetria; o IPE é pequeno e igual nos dois) ·
 * --como-cron (roda exatamente a função do cron: job 'cvm-ipe', ano corrente, com download).
 * Em produção: NODE_OPTIONS=--max-old-space-size=512 nice -n 10 (ver RUNBOOK).
 */
import { sincronizarIpe } from '../../src/services/analiseAtivos/eventos/sincronizarIpe';
import { executarJobAnalise } from '../../src/services/analiseAtivos/jobs/executarJob';
import { nomeBackfill } from '../../src/services/analiseAtivos/jobs/nomesJobs';

const PRAZO_BACKFILL_MS = 3 * 60 * 60 * 1000;

function arg(nome: string): string | undefined {
  const pref = `--${nome}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length);
}

function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

function parseAnos(s: string | undefined): number[] {
  const atual = new Date().getUTCFullYear();
  if (!s) return [atual];
  const m = /^(\d{4})(?:-(\d{4}))?$/.exec(s);
  if (!m) throw new Error(`--anos inválido: ${s} (use AAAA ou AAAA-AAAA)`);
  const de = Number(m[1]);
  const ate = Number(m[2] ?? m[1]);
  if (de > ate || de < 2010 || ate > atual) throw new Error(`--anos fora do intervalo: ${s}`);
  const out: number[] = [];
  for (let a = de; a <= ate; a++) out.push(a);
  return out;
}

async function main() {
  const aplicar = flag('apply');
  const comoCron = flag('como-cron');
  const perfil = arg('perfil') ?? 'dev';
  if (perfil !== 'dev' && perfil !== 'completo') throw new Error(`--perfil inválido: ${perfil}`);
  const anos = comoCron ? undefined : parseAnos(arg('anos'));
  const cacheDir = comoCron ? undefined : arg('cache-dir');

  console.log(
    `=== backfill-ipe (${aplicar ? 'APPLY' : 'dry-run'}${comoCron ? ', como cron' : ''}) ` +
      `anos=${anos?.join(',') ?? 'corrente'} cache=${cacheDir ?? '—'} perfil=${perfil} ===`,
  );
  const t0 = Date.now();
  const rssAntesMb = Math.round(process.memoryUsage().rss / 1048576);
  let detalhes: unknown = null;
  const r = await executarJobAnalise(
    comoCron ? 'cvm-ipe' : nomeBackfill('ipe'),
    async (ctx) => {
      const res = await sincronizarIpe(ctx, {
        anos,
        cacheDir,
        forcar: flag('forcar'),
        resultados: !flag('sem-resultados'),
      });
      detalhes = res.detalhes ?? null;
      return res;
    },
    {
      origem: comoCron ? 'cron' : 'script',
      aplicar,
      prazoMs: comoCron ? 120_000 : PRAZO_BACKFILL_MS,
      parametros: { anos: anos ?? 'corrente', cacheDir: cacheDir ?? null, perfil, aplicar },
    },
  );
  const mem = process.memoryUsage();
  console.log(JSON.stringify({ ...r, detalhes }, null, 2));
  console.log(
    `status=${r.status} tempo=${((Date.now() - t0) / 1000).toFixed(1)}s ` +
      `rssAntes=${rssAntesMb}MB rssPico=${r.rssPicoMb}MB heapAgora=${Math.round(mem.heapUsed / 1048576)}MB ` +
      `lidas=${r.linhasLidas} gravadas=${r.linhasGravadas} rejeitadas=${r.rejeitadas}`,
  );
  if (!aplicar) console.log('dry-run: nada gravado em asset_eventos. Use --apply para gravar.');
  if (r.status === 'falha') process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('../../src/lib/prisma');
    await prisma.$disconnect();
  });
