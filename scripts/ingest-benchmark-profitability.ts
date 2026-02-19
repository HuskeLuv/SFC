/**
 * Script para ingerir dados de rentabilidade de benchmarks (CDI, IBOV, IPCA, Poupança)
 * a partir de um arquivo JSON no formato dailyProfitabilityToChart.
 *
 * Uso: npx tsx scripts/ingest-benchmark-profitability.ts <caminho-do-json>
 * Ou:  echo '<json>' | npx tsx scripts/ingest-benchmark-profitability.ts
 */

import { ingestBenchmarkProfitability } from '../src/services/benchmarkProfitabilityIngestion';
import prisma from '../src/lib/prisma';
import * as fs from 'fs';

async function main() {
  try {
    let input: string;

    const filePath = process.argv[2];
    if (filePath) {
      input = fs.readFileSync(filePath, 'utf-8');
    } else {
      input = await new Promise<string>((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
      });
    }

    const json = JSON.parse(input);
    const result = await ingestBenchmarkProfitability(json);

    console.log('\n✅ Ingestão concluída:');
    console.log(`   • Inseridos: ${result.inserted}`);
    console.log(`   • Atualizados: ${result.updated}`);
    console.log(`   • Erros: ${result.errors}`);
    console.log('   Por benchmark:', result.byBenchmark);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
