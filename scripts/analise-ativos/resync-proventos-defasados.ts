/**
 * Proventos "defasados" do Quadro (flag proventos_defasados_*) — a base está atrás da BRAPI ou a
 * fonte não tem mesmo nada novo? Diagnóstico da rodada 3 (02/10/2026,
 * docs/analise-ativos/fase1/diagnostico-proventos-parados.md).
 *
 * Dry-run (padrão, só leitura + 1 GET na BRAPI por símbolo): para cada símbolo com a flag no Quadro
 * (ou os de --symbols), compara a data-com e o pagamento mais recentes do asset_dividend_history com
 * os da BRAPI (mesma agregação do sync: agregarProventosBrapi) e conta as chaves (pagamento, tipo)
 * que a BRAPI tem e o banco não.
 *  - "atrás da fonte": a BRAPI tem data-com mais nova ⇒ o cron market-data/refresh não passou pelo
 *    símbolo depois da declaração (resync resolve);
 *  - "fonte sem novidade": a BRAPI também não tem data-com nova (a flag depende só da regra).
 *
 * --apply: re-sincroniza (backfillSymbolMarketData, o mesmo do cron) os símbolos "atrás da fonte".
 * Depois rode recalcular-analise.ts --etapas=proventos,eventos,derivados,scores e o job quadro.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/resync-proventos-defasados.ts
 *   npx tsx --env-file=.env scripts/analise-ativos/resync-proventos-defasados.ts --symbols=TGMA3
 *   npx tsx --env-file=.env scripts/analise-ativos/resync-proventos-defasados.ts --apply
 *
 * Opções: --apply · --symbols=A,B · --pausa-ms=N (padrão 250) · --todos (todos os motivos de
 * defasagem; padrão: só pagador_recorrente_parado)
 */
import { prisma } from '@/lib/prisma';
import {
  agregarProventosBrapi,
  flattenBrapiResultDividends,
} from '@/services/pricing/dividendService';
import { backfillSymbolMarketData } from '@/services/pricing/marketDataBackfill';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const maxData = (ds: Array<Date | null>) =>
  iso(
    ds
      .filter((d): d is Date => d !== null)
      .reduce<Date | null>((m, d) => (m === null || d > m ? d : m), null),
  );

async function buscarBrapi(symbol: string): Promise<Record<string, unknown>[] | null> {
  const token = process.env.BRAPI_API_KEY ? `&token=${process.env.BRAPI_API_KEY}` : '';
  const res = await fetch(
    `https://brapi.dev/api/quote/${encodeURIComponent(symbol)}?dividends=true${token}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  const result = json.results?.[0];
  return result ? flattenBrapiResultDividends(result) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=', 2)[1];
  const pausa = Number(valor('pausa-ms') ?? 250);
  const padrao = argv.includes('--todos')
    ? 'proventos_defasados_%'
    : 'proventos_defasados_pagador_recorrente_parado';
  const filtro = valor('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const simbolos =
    filtro ??
    (
      await prisma.$queryRaw<Array<{ symbol: string }>>`
        SELECT symbol FROM analise_quadro_linhas
        WHERE "noQuadro" AND EXISTS (SELECT 1 FROM unnest(flags) f WHERE f LIKE ${padrao})
        ORDER BY symbol`
    ).map((r) => r.symbol);

  console.log(
    `\n=== resync-proventos-defasados (${apply ? 'APPLY' : 'dry-run'}) — ${simbolos.length} símbolo(s) ===\n`,
  );
  const atras: string[] = [];
  const semNovidade: string[] = [];
  const falhas: string[] = [];
  for (const symbol of simbolos) {
    const brutos = await buscarBrapi(symbol).catch(() => null);
    if (!brutos) {
      falhas.push(symbol);
      continue;
    }
    const fonte = agregarProventosBrapi(brutos);
    const banco = await prisma.assetDividendHistory.findMany({
      where: { symbol },
      select: { date: true, dataCom: true, tipo: true },
    });
    const chaves = new Set(banco.map((b) => `${b.date.getTime()}|${b.tipo}`));
    const faltando = fonte.filter((f) => !chaves.has(`${f.date.getTime()}|${f.tipo}`));
    const comBanco = maxData(banco.map((b) => b.dataCom));
    const comFonte = maxData(fonte.map((f) => f.dataCom));
    const pagFonte = maxData(fonte.map((f) => f.date));
    const atrasado = comFonte !== null && (comBanco === null || comFonte > comBanco);
    (atrasado ? atras : semNovidade).push(symbol);
    console.log(
      `  ${symbol.padEnd(8)} data-com banco ${comBanco ?? '—'} · BRAPI ${comFonte ?? '—'} ` +
        `(pagamento até ${pagFonte ?? '—'}) · ${faltando.length} chave(s) só na BRAPI ` +
        `⇒ ${atrasado ? 'ATRÁS DA FONTE' : 'fonte sem novidade'}`,
    );
    await dormir(pausa);
  }
  console.log(`\n  atrás da fonte:     ${atras.length} ${atras.join(' ')}`);
  console.log(`  fonte sem novidade: ${semNovidade.length}`);
  if (falhas.length) console.log(`  falha na BRAPI:     ${falhas.length} ${falhas.join(' ')}`);

  if (!apply) {
    console.log(
      '\n  (dry-run; nada gravado — use --apply para re-sincronizar os "atrás da fonte")\n',
    );
    return;
  }
  for (const symbol of atras) {
    const r = await backfillSymbolMarketData(symbol);
    console.log(`  resync ${symbol.padEnd(8)} ${r.status} (${r.dividendCount} proventos)`);
    await dormir(pausa);
  }
  console.log('\n  ✅ aplicado — rode recalcular-analise.ts e o job quadro\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
