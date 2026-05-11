/**
 * Reproduz o cálculo de TWR dia-a-dia para um usuário e identifica o ponto
 * onde `cumulative` cai pra 0 (ou negativo).
 */
import prisma from '../src/lib/prisma';
import { loadCarteiraHistoricoData } from '../src/services/portfolio/carteiraHistoricoDataLoader';
import { buildPatrimonioHistorico } from '../src/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '../src/services/portfolio/fixedIncomePricing';

async function main() {
  const email = process.argv[2] || 'testekinvo@hotmail.com';
  const user = await prisma.user.findFirst({
    where: {
      email: { in: [email, email.replace('kivo', 'kinvo'), email.replace('kinvo', 'kivo')] },
    },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
    await loadCarteiraHistoricoData(user.id);
  const fiPricer = await createFixedIncomePricer(user.id, {});

  const built = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas,
    saldoBrutoAtual: 0,
    valorAplicadoAtual: 0,
    maxHistoricoMonths: null,
    patchLastDayWithLiveTotals: false,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
    implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
  });

  const series = built.historicoPatrimonio;
  const cashFlows = built.cashFlowsByDay;

  console.log(`Série tem ${series.length} pontos.`);
  console.log(`Cashflows registrados em ${cashFlows.size} dias.\n`);

  // Reproduzir manualmente
  let cumulative = 1;
  let firstZeroAt: number | null = null;
  const ptosCriticos: Array<{
    i: number;
    date: string;
    vInicial: number;
    vFinal: number;
    fluxo: number;
    retornoDia: number;
    cumulative: number;
  }> = [];

  for (let i = 0; i < series.length; i++) {
    const vFinal = series[i].saldoBruto;
    const dayKey = (() => {
      const d = new Date(series[i].data);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    })();
    const fluxo = cashFlows.get(dayKey) ?? cashFlows.get(series[i].data) ?? 0;
    let retornoDia = 0;
    if (i === 0) {
      if (fluxo > 0) {
        retornoDia = (vFinal - fluxo) / fluxo;
        if (!Number.isFinite(retornoDia) || retornoDia > 1 || retornoDia < -1) {
          retornoDia = 0;
        }
      }
    } else {
      const vInicial = series[i - 1].saldoBruto;
      if (vInicial > 0) {
        retornoDia = (vFinal - vInicial - fluxo) / vInicial;
        if (!Number.isFinite(retornoDia) || retornoDia > 0.5 || retornoDia < -0.5) {
          retornoDia = 0;
        }
      } else if (vFinal > 0 && fluxo > 0) {
        retornoDia = 0;
      }
    }
    const novoCumulative = cumulative * (1 + retornoDia);
    // Detecta primeiro zero
    if (firstZeroAt === null && novoCumulative <= 0) {
      firstZeroAt = i;
      ptosCriticos.push({
        i,
        date: new Date(series[i].data).toISOString().slice(0, 10),
        vInicial: i > 0 ? series[i - 1].saldoBruto : 0,
        vFinal,
        fluxo,
        retornoDia,
        cumulative: novoCumulative,
      });
      // pega 2 vizinhos pra contexto
      for (let j = Math.max(0, i - 2); j < i; j++) {
        ptosCriticos.unshift({
          i: j,
          date: new Date(series[j].data).toISOString().slice(0, 10),
          vInicial: j > 0 ? series[j - 1].saldoBruto : 0,
          vFinal: series[j].saldoBruto,
          fluxo: cashFlows.get(series[j].data) ?? 0,
          retornoDia: 0, // não recalculando agora
          cumulative: NaN,
        });
      }
    }
    cumulative = novoCumulative;
  }

  console.log(`Primeiro ponto em que cumulative <= 0: i=${firstZeroAt}`);
  if (firstZeroAt !== null) {
    console.log(`\n=== Contexto ao redor (incluindo o ponto problemático) ===`);
    for (const p of ptosCriticos) {
      console.log(
        `  i=${String(p.i).padStart(4)} ${p.date} vInicial=${p.vInicial.toFixed(2).padStart(12)} vFinal=${p.vFinal.toFixed(2).padStart(12)} fluxo=${p.fluxo.toFixed(2).padStart(12)} retornoDia=${p.retornoDia.toFixed(4)} cumulative=${p.cumulative.toFixed(6)}`,
      );
    }
  }

  // Olha primeiros 5 pontos da série pra entender o início
  console.log(`\n=== Primeiros 5 pontos da série ===`);
  for (let i = 0; i < Math.min(5, series.length); i++) {
    const dayKey = (() => {
      const d = new Date(series[i].data);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    })();
    const fluxo = cashFlows.get(dayKey) ?? 0;
    console.log(
      `  i=${i} ${new Date(series[i].data).toISOString().slice(0, 10)} saldoBruto=${series[i].saldoBruto.toFixed(2)} valorAplicado=${series[i].valorAplicado.toFixed(2)} fluxo=${fluxo.toFixed(2)}`,
    );
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
