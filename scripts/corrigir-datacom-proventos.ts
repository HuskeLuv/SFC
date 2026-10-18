/**
 * Corrige `asset_dividend_history.dataCom` das linhas da BRAPI, que guardavam a data EX
 * (o pregão seguinte à data-com) até a correção de extractDataCom (30/09/2026).
 *
 * Para cada símbolo, busca os proventos brutos na BRAPI, agrega com a MESMA regra do
 * persist (agregarProventosBrapi) e atualiza SÓ o campo dataCom das linhas existentes
 * com a mesma chave (símbolo, pagamento, tipo). Valores NÃO são tocados — um refresh
 * completo poderia somar entries que a BRAPI repete (ex.: PETR4 set/2024).
 *
 * As cópias por usuário (`PortfolioProvento`, source='brapi') se ajustam sozinhas na
 * próxima materialização (ensurePortfolioProventosFromMarket compara dataCom).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/corrigir-datacom-proventos.ts                  # dry-run
 *   npx tsx --env-file=.env scripts/corrigir-datacom-proventos.ts --symbols=PETR4
 *   npx tsx --env-file=.env scripts/corrigir-datacom-proventos.ts --apply
 *
 * Idempotente: rodar de novo não muda nada.
 *
 * Desde o backtest de 18/10/2026 a chave da tabela inclui a data-com e um (pagamento, tipo) pode ter
 * várias datas-com: aqui só se corrige o par que tem UMA data-com na BRAPI (o caso legado). Somas
 * antigas e versões substituídas: scripts/analise-ativos/limpar-proventos-somados.ts.
 */
import prisma from '@/lib/prisma';
import {
  agregarProventosBrapi,
  flattenBrapiResultDividends,
} from '@/services/pricing/dividendService';

const PAUSA_MS = 250;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chave = (data: Date, tipo: string) => `${data.toISOString().slice(0, 10)}|${tipo}`;

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
  const symbolsArg = argv.find((a) => a.startsWith('--symbols='));
  const filtro = symbolsArg
    ? symbolsArg
        .split('=', 2)[1]
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : null;

  console.log(`\n📅 Correção de data-com dos proventos BRAPI (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const simbolos = (
    await prisma.assetDividendHistory.findMany({
      where: { source: 'BRAPI', ...(filtro ? { symbol: { in: filtro } } : {}) },
      distinct: ['symbol'],
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    })
  ).map((r) => r.symbol);

  let corrigir = 0;
  let iguais = 0;
  let semCorrespondencia = 0;
  let falhasBrapi = 0;
  const amostra: string[] = [];

  for (const [i, symbol] of simbolos.entries()) {
    const brutos = await buscarBrapi(symbol).catch(() => null);
    if (!brutos) {
      falhasBrapi++;
      continue;
    }
    const porChave = new Map<string, Array<Date | null>>();
    for (const a of agregarProventosBrapi(brutos)) {
      const k = chave(a.date, a.tipo);
      porChave.set(k, [...(porChave.get(k) ?? []), a.dataCom]);
    }
    // (pagamento, tipo) com mais de uma data-com: ambíguo para esta correção (fica com o sync)
    const dataComPorChave = new Map(
      [...porChave].filter(([, ds]) => ds.length === 1).map(([k, ds]) => [k, ds[0]]),
    );

    const linhas = await prisma.assetDividendHistory.findMany({
      where: { symbol, source: 'BRAPI' },
      select: { id: true, date: true, tipo: true, dataCom: true },
    });
    const updates: Array<{ id: string; dataCom: Date }> = [];
    for (const l of linhas) {
      const nova = dataComPorChave.get(chave(l.date, l.tipo));
      if (!nova) {
        semCorrespondencia++;
        continue;
      }
      const novaUtc = new Date(
        Date.UTC(nova.getUTCFullYear(), nova.getUTCMonth(), nova.getUTCDate()),
      );
      if (l.dataCom?.getTime() === novaUtc.getTime()) {
        iguais++;
        continue;
      }
      updates.push({ id: l.id, dataCom: novaUtc });
      if (amostra.length < 10) {
        amostra.push(
          `${symbol.padEnd(8)} pag ${l.date.toISOString().slice(0, 10)} ${l.tipo.padEnd(10)} ` +
            `${l.dataCom?.toISOString().slice(0, 10) ?? '—'} → ${novaUtc.toISOString().slice(0, 10)}`,
        );
      }
    }
    corrigir += updates.length;

    if (apply && updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.assetDividendHistory.update({ where: { id: u.id }, data: { dataCom: u.dataCom } }),
        ),
      );
    }
    if ((i + 1) % 50 === 0) console.log(`   ${i + 1}/${simbolos.length} símbolos…`);
    await dormir(PAUSA_MS);
  }

  console.log(`\n   símbolos:              ${simbolos.length}`);
  console.log(`   falha na BRAPI:        ${falhasBrapi}`);
  console.log(`   data-com a corrigir:   ${corrigir.toLocaleString('pt-BR')}`);
  console.log(`   já corretas:           ${iguais.toLocaleString('pt-BR')}`);
  console.log(`   sem correspondência:   ${semCorrespondencia.toLocaleString('pt-BR')} (mantidas)`);
  console.log('   amostra (antes → depois):');
  for (const a of amostra) console.log(`      ${a}`);
  console.log(apply ? '\n   ✅ aplicado\n' : '\n   (dry-run; nada gravado — use --apply)\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
