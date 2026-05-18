/**
 * Backfill histórico de IPCA (e outros índices de inflação mensais) desde 2010.
 *
 * Motivação: economic_index só tem IPCA a partir de 2021-05 (cron com lookback
 * de 5 anos rolling). Ativos antigos (LCA/CDB IPCA+ comprados em 2020 ou antes)
 * ficam sem IPCA aplicado, sub-estimando saldo bruto em ~30%+ dependendo do período.
 *
 * Reusa `ingestIndex` (BACEN SGS series 433/7478/189/188) com janela 2010-01 → hoje.
 *
 * Idempotente — upsert por (indexType, date). Pode rodar várias vezes sem
 * efeitos colaterais. Vai inserir/atualizar ~180 linhas por série.
 *
 * Run: npx tsx scripts/backfill-ipca-historico.ts
 */
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeriesConfig {
  seriesId: number;
  indexType: string;
}

const SERIES: SeriesConfig[] = [
  { seriesId: 433, indexType: 'IPCA' },
  { seriesId: 7478, indexType: 'IPCA15' },
  { seriesId: 189, indexType: 'IGPM' },
  { seriesId: 188, indexType: 'INPC' },
];

const START_DATE = '01/01/2010';

const formatDateBR = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseDateBR = (date: string): Date => {
  const [day, month, year] = date.split('/');
  return new Date(`${year}-${month}-${day}`);
};

interface BacenRow {
  data: string;
  valor: string;
}

const fetchBacenSeries = async (seriesId: number, startDate: string): Promise<BacenRow[]> => {
  const endDate = formatDateBR(new Date());
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${startDate}&dataFinal=${endDate}`;
  const { data } = await axios.get<BacenRow[]>(url, { timeout: 30000 });
  return data;
};

async function ingestSeries(series: SeriesConfig): Promise<void> {
  console.log(`\n📊 ${series.indexType} (série ${series.seriesId}) desde ${START_DATE}...`);
  const rows = await fetchBacenSeries(series.seriesId, START_DATE);
  console.log(`   📥 ${rows.length} registros recebidos do BACEN`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const date = parseDateBR(row.data);
      const rawValue = Number(row.valor);
      if (!Number.isFinite(rawValue)) {
        errors++;
        continue;
      }
      const value = rawValue / 100; // BACEN devolve em %, store as fraction

      const existing = await prisma.economicIndex.findUnique({
        where: { indexType_date: { indexType: series.indexType, date } },
      });

      await prisma.economicIndex.upsert({
        where: { indexType_date: { indexType: series.indexType, date } },
        update: { value, updatedAt: new Date() },
        create: { indexType: series.indexType, date, value },
      });

      if (existing) updated++;
      else inserted++;
    } catch (e) {
      console.error(`   ⚠️  Erro em ${row.data}:`, e instanceof Error ? e.message : e);
      errors++;
    }
  }

  console.log(`   ✅ ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
}

async function main() {
  const startTime = Date.now();
  console.log('🕐 Backfill IPCA histórico iniciando...\n');

  // Pre-stats
  const before = await prisma.economicIndex.groupBy({
    by: ['indexType'],
    where: { indexType: { in: SERIES.map((s) => s.indexType) } },
    _count: true,
    _min: { date: true },
  });
  console.log('Estado ANTES:');
  before.forEach((b) =>
    console.log(
      `   ${b.indexType}: ${b._count} entradas, mais antiga: ${b._min.date?.toISOString().slice(0, 10)}`,
    ),
  );

  for (const series of SERIES) {
    try {
      await ingestSeries(series);
      // Cortesia BACEN: 500ms entre séries
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`💥 Falha em ${series.indexType}:`, e instanceof Error ? e.message : e);
    }
  }

  // Post-stats
  const after = await prisma.economicIndex.groupBy({
    by: ['indexType'],
    where: { indexType: { in: SERIES.map((s) => s.indexType) } },
    _count: true,
    _min: { date: true },
  });
  console.log('\nEstado DEPOIS:');
  after.forEach((b) =>
    console.log(
      `   ${b.indexType}: ${b._count} entradas, mais antiga: ${b._min.date?.toISOString().slice(0, 10)}`,
    ),
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✨ Concluído em ${duration}s`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
