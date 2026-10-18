/**
 * Limpeza dos espelhos ÓRFÃOS de proventos da Carteira (backtest de 18/10/2026; passo 2d de
 * docs/analise-ativos/backtest-out2026/ATIVACAO.md). Rodar DEPOIS da limpeza das linhas somadas
 * (limpar-proventos-somados.ts --apply).
 *
 * Órfão = portfolio_proventos com source 'brapi', não dispensado, pagamento até hoje, cujo
 * (pagamento, tipo) não está mais no histórico global do símbolo (asset_dividend_history, lido como
 * a Carteira lê: getDividendsFromDb). A aba Proventos e o IR contavam essas linhas; o Resumo e a
 * rentabilidade não (regras em src/services/portfolio/proventosEspelhoOrfaos.ts).
 *
 * Nunca apaga linha 'manual', dispensada, de símbolo sem histórico, nem já creditada no Caixa para
 * Investir (listada à parte). Dry-run por padrão (só leitura). Idempotente: a 2ª passada dá 0.
 *
 * Uso (no servidor, dentro da release):
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts            # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts --symbols=VIVT3,PRIO3
 *   npx tsx --env-file=.env scripts/analise-ativos/limpar-proventos-orfaos-carteira.ts --apply
 */
import { prisma } from '@/lib/prisma';
import { getDividendsFromDb } from '@/services/pricing/dividendService';
import {
  planejarRemocaoEspelhosOrfaos,
  type EntradaHistorico,
  type LinhaEspelho,
} from '@/services/portfolio/proventosEspelhoOrfaos';

export interface LinhaCarteira extends LinhaEspelho {
  userId: string;
  symbol: string;
}

export interface DepsOrfaos {
  linhas(filtro: string[] | null): Promise<LinhaCarteira[]>;
  historico(symbol: string): Promise<EntradaHistorico[]>;
  apagar(ids: string[]): Promise<number>;
}

export interface ResumoOrfaos {
  simbolos: number;
  apagar: number;
  usuarios: number;
  valor: number;
  creditadasNoCaixa: number;
  apagadas: number;
  porSimbolo: string[];
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function executarLimpezaOrfaos(
  opts: { aplicar: boolean; filtro: string[] | null; hoje: Date; amostra: number },
  deps: DepsOrfaos,
): Promise<ResumoOrfaos> {
  const linhas = await deps.linhas(opts.filtro);
  const porSimbolo = new Map<string, LinhaCarteira[]>();
  for (const l of linhas) porSimbolo.set(l.symbol, [...(porSimbolo.get(l.symbol) ?? []), l]);
  const r: ResumoOrfaos = {
    simbolos: porSimbolo.size,
    apagar: 0,
    usuarios: 0,
    valor: 0,
    creditadasNoCaixa: 0,
    apagadas: 0,
    porSimbolo: [],
  };
  const usuarios = new Set<string>();
  const ids: string[] = [];
  for (const [symbol, ls] of [...porSimbolo].sort(([a], [b]) => a.localeCompare(b))) {
    const plano = planejarRemocaoEspelhosOrfaos(ls, await deps.historico(symbol), opts.hoje);
    r.creditadasNoCaixa += plano.creditadasNoCaixa.length;
    if (plano.apagar.length === 0) continue;
    const soma = plano.apagar.reduce((s, l) => s + l.valorTotal, 0);
    r.apagar += plano.apagar.length;
    r.valor += soma;
    for (const l of plano.apagar) {
      usuarios.add(l.userId);
      ids.push(l.id);
    }
    const ex = plano.apagar
      .slice(0, opts.amostra)
      .map((l) => `${dia(l.dataPagamento)} ${l.tipo} R$ ${l.valorTotal.toFixed(2)}`)
      .join(' · ');
    r.porSimbolo.push(
      `${symbol.padEnd(8)} ${String(plano.apagar.length).padStart(3)} linhas  R$ ${soma.toFixed(2).padStart(10)}  ${ex}`,
    );
  }
  r.usuarios = usuarios.size;
  r.valor = Math.round(r.valor * 100) / 100;
  if (opts.aplicar && ids.length > 0) r.apagadas = await deps.apagar(ids);
  return r;
}

async function main() {
  const argv = process.argv.slice(2);
  const aplicar = argv.includes('--apply');
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=', 2)[1];
  const filtro =
    valor('symbols')
      ?.split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) ?? null;

  console.log(`\nEspelhos órfãos de proventos da Carteira (${aplicar ? 'APPLY' : 'DRY RUN'})\n`);
  const r = await executarLimpezaOrfaos(
    { aplicar, filtro, hoje: new Date(), amostra: Number(valor('amostra') ?? 3) },
    {
      linhas: async (f) => {
        const rows = await prisma.portfolioProvento.findMany({
          where: {
            source: 'brapi',
            dismissed: false,
            ...(f ? { portfolio: { asset: { symbol: { in: f } } } } : {}),
          },
          select: {
            id: true,
            userId: true,
            source: true,
            dismissed: true,
            tipo: true,
            dataPagamento: true,
            valorTotal: true,
            caixaCreditadoEm: true,
            portfolio: { select: { asset: { select: { symbol: true } } } },
          },
        });
        return rows.flatMap(({ portfolio, ...l }) => {
          const symbol = portfolio.asset?.symbol?.trim().toUpperCase();
          return symbol ? [{ ...l, symbol }] : [];
        });
      },
      historico: (symbol) => getDividendsFromDb(symbol),
      apagar: async (ids) => {
        let n = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const { count } = await prisma.portfolioProvento.deleteMany({
            // guarda dupla: só espelho automático não dispensado
            where: { id: { in: ids.slice(i, i + 500) }, source: 'brapi', dismissed: false },
          });
          n += count;
        }
        return n;
      },
    },
  );
  console.log(`   símbolos com espelho 'brapi':      ${r.simbolos}`);
  console.log(`   linhas órfãs a apagar:             ${r.apagar} (${r.usuarios} usuários)`);
  console.log(`   valor bruto dessas linhas:         R$ ${r.valor.toFixed(2)}`);
  console.log(`   órfãs já creditadas no Caixa (ficam): ${r.creditadasNoCaixa}`);
  for (const s of r.porSimbolo) console.log(`      ${s}`);
  console.log(
    aplicar ? `\n   apagadas: ${r.apagadas}\n` : '\n   (dry-run; nada gravado — use --apply)\n',
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
