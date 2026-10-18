/**
 * Limpeza das linhas de proventos SOMADAS já gravadas (backtest de 18/10/2026, achado A1;
 * docs/analise-ativos/backtest-out2026/ATIVACAO.md). Até a migration 20261018000000 a chave de
 * asset_dividend_history era (symbol, pagamento, tipo) e o sync da BRAPI somava numa linha os
 * proventos pagos no mesmo dia com datas-com diferentes (VIVT3 1,0041 em 14/04/2026 = 7 JCPs mensais
 * de 2025; SAPR11 1,9606; CMIG4, ISAE4, RADL3, ITUB4...).
 *
 * Para cada símbolo com linhas BRAPI (ou os de --symbols): 1 GET na BRAPI, agrega com a regra do sync
 * (agregarProventosBrapi, chave com data-com) e reconcilia com o banco pelo MESMO caminho do sync
 * (dividendService.gravarProventosBrapi → proventosBrapiPlano):
 *  - criar: parcelas que a soma escondia (uma linha por data-com);
 *  - atualizar: a soma antiga cuja data-com é a de uma parcela volta ao valor da parcela;
 *  - apagar 'soma_orfa': soma antiga com data-com que a fonte não tem mais para aquele pagamento;
 *  - apagar 'versao_antiga': linha com pagamento que a fonte substituiu (mesmo provento com outro
 *    pagamento/data-com a ≤ 1 pregão).
 * Nunca apaga linha "sem pagamento" do legado, linha de outra fonte (YAHOO) nem histórico que a
 * resposta da BRAPI não cobre; símbolo sem resposta da BRAPI é pulado (nada muda).
 *
 * Dry-run por padrão (só leitura no banco + GET na BRAPI). Idempotente: depois do --apply, rodar de
 * novo dá plano vazio. O cron market-data/refresh faz a mesma reconciliação aos poucos; este script
 * faz de uma vez e mostra o que muda.
 *
 * Uso (no servidor, dentro da release):
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-somados.ts               # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-somados.ts --symbols=VIVT3,SAPR11
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-somados.ts --apply
 * Opções: --apply · --symbols=A,B · --pausa-ms=N (padrão 250) · --amostra=N (padrão 15)
 * Depois do --apply: recalcular-analise.ts --etapas=proventos,eventos,derivados,scores e o job quadro.
 */
import { prisma } from '@/lib/prisma';
import {
  agregarProventosBrapi,
  flattenBrapiResultDividends,
  gravarProventosBrapi,
} from '@/services/pricing/dividendService';
import type { PlanoGravacaoProventos } from '@/services/pricing/proventosBrapiPlano';

export interface DepsLimpeza {
  /** entries brutas da BRAPI do símbolo; null = sem resposta (o símbolo é pulado) */
  buscarBrapi(symbol: string): Promise<Record<string, unknown>[] | null>;
  /** reconcilia (aplicar=false: só planeja) — dividendService.gravarProventosBrapi */
  reconciliar(
    symbol: string,
    entries: Record<string, unknown>[],
    aplicar: boolean,
  ): Promise<PlanoGravacaoProventos>;
  dormir(ms: number): Promise<void>;
}

export interface ResumoLimpeza {
  simbolos: number;
  semResposta: string[];
  comMudanca: number;
  criar: number;
  atualizar: number;
  apagar: Record<string, number>;
  amostra: string[];
}

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export async function executarLimpeza(
  simbolos: readonly string[],
  opts: { aplicar: boolean; pausaMs: number; amostra: number },
  deps: DepsLimpeza,
): Promise<ResumoLimpeza> {
  const r: ResumoLimpeza = {
    simbolos: simbolos.length,
    semResposta: [],
    comMudanca: 0,
    criar: 0,
    atualizar: 0,
    apagar: {},
    amostra: [],
  };
  for (const symbol of simbolos) {
    const entries = await deps.buscarBrapi(symbol).catch(() => null);
    if (!entries || entries.length === 0) {
      r.semResposta.push(symbol);
      continue;
    }
    const plano = await deps.reconciliar(symbol, entries, opts.aplicar);
    const n = plano.criar.length + plano.atualizar.length + plano.apagar.length;
    if (n > 0) r.comMudanca++;
    r.criar += plano.criar.length;
    r.atualizar += plano.atualizar.length;
    for (const a of plano.apagar) {
      const k = `${a.motivo}${a.substituta ? '' : ' (valor sai da base)'}`;
      r.apagar[k] = (r.apagar[k] ?? 0) + 1;
    }
    if (n > 0 && r.amostra.length < opts.amostra) {
      const partes = [
        ...plano.atualizar.map((u) => `atualiza ${u.antes} → ${u.valorUnitario}`),
        ...plano.apagar.map(
          (a) =>
            `apaga ${a.motivo}${a.substituta ? '' : '*'} ${a.linha.tipo} ${a.linha.valorUnitario} (pag ${dia(a.linha.date)}, com ${dia(a.linha.dataCom)})`,
        ),
        ...(plano.criar.length > 0 ? [`cria ${plano.criar.length}`] : []),
      ];
      r.amostra.push(`${symbol.padEnd(8)} ${partes.slice(0, 4).join(' · ')}`);
    }
    if (opts.pausaMs > 0) await deps.dormir(opts.pausaMs);
  }
  return r;
}

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
  const aplicar = argv.includes('--apply');
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=', 2)[1];
  const filtro = valor('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const simbolos = (
    await prisma.assetDividendHistory.findMany({
      where: { source: 'BRAPI', ...(filtro ? { symbol: { in: filtro } } : {}) },
      distinct: ['symbol'],
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    })
  ).map((x) => x.symbol);

  console.log(
    `\nLimpeza das linhas de proventos somadas (${aplicar ? 'APPLY' : 'DRY RUN'}) — ${simbolos.length} símbolos\n`,
  );
  const r = await executarLimpeza(
    simbolos,
    {
      aplicar,
      pausaMs: Number(valor('pausa-ms') ?? 250),
      amostra: Number(valor('amostra') ?? 15),
    },
    {
      buscarBrapi,
      reconciliar: (symbol, entries, ap) =>
        gravarProventosBrapi(symbol, agregarProventosBrapi(entries), { aplicar: ap }),
      dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    },
  );
  console.log(`   símbolos:               ${r.simbolos}`);
  console.log(`   sem resposta da BRAPI:  ${r.semResposta.length} (pulados, nada muda)`);
  console.log(`   símbolos com mudança:   ${r.comMudanca}`);
  console.log(`   linhas a criar:         ${r.criar}`);
  console.log(`   linhas a atualizar:     ${r.atualizar}`);
  for (const [m, n] of Object.entries(r.apagar)) console.log(`   linhas a apagar (${m}): ${n}`);
  console.log('   amostra (apaga …* = o valor sai da base, sem provento igual na fonte):');
  for (const a of r.amostra) console.log(`      ${a}`);
  console.log(aplicar ? '\n   aplicado\n' : '\n   (dry-run; nada gravado — use --apply)\n');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
