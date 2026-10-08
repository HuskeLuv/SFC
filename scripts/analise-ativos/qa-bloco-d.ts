/**
 * QA read-only do bloco D da Análise de Ativos (Raio-X e Comparador) — o dry-run do passo 3 de
 * docs/analise-ativos/blocoD/ATIVACAO.md. Chama os MESMOS serviços das rotas (obterRaioX,
 * gerarCsvRaioX, montarComparador), sem passar pelas flags: só lê o banco, nunca grava, nunca chama
 * provedor externo.
 *
 * Para cada ticker da amostra: tempo frio e quente do Raio-X, o CSV completo em --saida e, no
 * console, as linhas que o QA confere à mão (FII: rendimento distribuído 2T+4T, payout do
 * resultado, taxa de adm. no ano, nº de cotas; ação: lucro, payout, LPA). Depois, as 4 comparações
 * do plano de QA com tempo frio e quente e os ignorados.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/qa-bloco-d.ts [--saida=/tmp/qa-bloco-d] [TICKER…]
 * Em prod: ver `rodar` em docs/analise-ativos/blocoD/ATIVACAO.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { obterRaioX } from '../../src/services/analiseAtivos/leitura/ativo/raioX';
import { hojeSaoPaulo } from '../../src/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { gerarCsvRaioX } from '../../src/services/analiseAtivos/regras/raioX/csvRaioX';
import { montarComparador } from '../../src/services/analiseAtivos/leitura/comparador/montarComparador';
import { nomeArquivoCsvRaioX } from '../../src/services/analiseAtivos/cenarios/contrato';
import prisma from '../../src/lib/prisma';

/** Amostra do plano de QA (spec-desenho.json → plano_producao, passo 3). */
export const AMOSTRA_PADRAO = [
  'WEGE3',
  'ITUB4',
  'PETR4',
  'AURE3',
  'TGMA3',
  'HGLG11',
  'XPLG11',
  'KNCR11',
  'MXRF11',
  'HFOF11',
  'CBAV3',
  'SBSP3',
  'GSRF11',
  'PMRL11',
];

export const COMPARACOES = [
  ['WEGE3', 'ITUB4', 'PETR4', 'AURE3'],
  ['HGLG11', 'XPLG11'],
  ['HGLG11', 'KNCR11', 'MXRF11'],
  ['WEGE3', 'HGLG11'],
];

/** Linhas do CSV que o QA confere à mão (rótulos de textosRaioX.ts). */
export const LINHAS_CONFERIR =
  /^(Rendimento distribuído|Payout do resultado|Payout|Taxa de adm\.|Nº de cotas|Resultado por cota|Lucro líquido|LPA)/;

function ms(t0: number): string {
  return `${(performance.now() - t0).toFixed(0)} ms`;
}

async function main() {
  const args = process.argv.slice(2);
  const saida =
    args.find((a) => a.startsWith('--saida='))?.slice('--saida='.length) ?? '/tmp/qa-bloco-d';
  const tickers = args.filter((a) => !a.startsWith('--')).map((t) => t.toUpperCase());
  const amostra = tickers.length ? tickers : AMOSTRA_PADRAO;
  const hoje = hojeSaoPaulo();
  mkdirSync(saida, { recursive: true });

  console.log(`=== Raio-X (read-only) · ${hoje} · CSVs em ${saida} ===`);
  for (const t of amostra) {
    let t0 = performance.now();
    const r = await obterRaioX(t, hoje);
    const frio = ms(t0);
    if (!r) {
      console.log(`\n${t}: fora da área (a rota responde 404)`);
      continue;
    }
    t0 = performance.now();
    await obterRaioX(t, hoje);
    const quente = ms(t0);
    const csv = gerarCsvRaioX(r.dados, { hoje, versaoParams: r.paramsVersion });
    const arquivo = path.join(saida, nomeArquivoCsvRaioX(r.dados.ticker, hoje));
    writeFileSync(arquivo, csv);
    console.log(`\n${t}: frio ${frio} · quente ${quente} · params v${r.paramsVersion}`);
    const linhas = csv.replace(/^﻿/, '').split('\r\n');
    console.log(`  ${linhas[0]}`);
    for (const l of linhas) if (LINHAS_CONFERIR.test(l)) console.log(`  ${l}`);
  }

  console.log('\n=== Comparador (read-only) ===');
  for (const c of COMPARACOES) {
    let t0 = performance.now();
    const r = await montarComparador(c, hoje);
    const frio = ms(t0);
    t0 = performance.now();
    await montarComparador(c, hoje);
    const quente = ms(t0);
    const ign = r?.dados.ignorados.map((i) => `${i.ticker}:${i.motivo}`).join(', ') || '—';
    console.log(
      `${c.join(',')}: classe ${r?.dados.classe ?? '—'} · frio ${frio} · quente ${quente} · ignorados ${ign}`,
    );
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
