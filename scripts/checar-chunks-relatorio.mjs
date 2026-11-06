#!/usr/bin/env node
/**
 * Guarda do Relatório financeiro (ticket 86e3yg90z, decisão 6): os chunks ESTÁTICOS da rota
 * /relatorios/financeiro — o que o navegador baixa para qualquer plano, inclusive o Basic — não
 * podem conter "PGBL", "dedução" nem "aporte". Os corpos com esses textos (secoes/real/* e adv/*)
 * só entram por next/dynamic, em chunks separados, quando o plano libera.
 *
 * Roda depois do `next build` (CI, job quality): lê o client-reference-manifest da rota, pega os
 * chunks de entrada da PÁGINA (sem os do layout do app, que são de outras telas) e procura as
 * palavras. Sai com código 1 e lista os achados.
 *
 * Uso: node scripts/checar-chunks-relatorio.mjs [pasta .next]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const NEXT = path.resolve(process.argv[2] ?? '.next');
const ROTA = '/(admin)/(home)/relatorios/financeiro/page';
const MANIFESTO = path.join(NEXT, 'server/app', `${ROTA}_client-reference-manifest.js`);
const PROIBIDAS = /PGBL|dedu[cç]|aporte/gi;

function falhar(msg) {
  console.error(`checar-chunks-relatorio: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFESTO)) falhar(`manifesto não encontrado (${MANIFESTO}); rode o next build`);

const ctx = { globalThis: {} };
ctx.globalThis.__RSC_MANIFEST = {};
vm.runInNewContext(fs.readFileSync(MANIFESTO, 'utf8'), ctx);
const manifesto = ctx.globalThis.__RSC_MANIFEST[ROTA];
if (!manifesto?.entryJSFiles) falhar(`manifesto sem entryJSFiles para ${ROTA}`);

const entradas = Object.entries(manifesto.entryJSFiles);
const chaveDaPagina = entradas.find(([k]) => k.endsWith('relatorios/financeiro/page'))?.[0];
if (!chaveDaPagina) falhar('entrada da página não encontrada no manifesto');

// Chunks que o layout do app também carrega são compartilhados com as outras telas: ficam de fora.
const doLayout = new Set(
  entradas.filter(([k]) => k !== chaveDaPagina).flatMap(([, arquivos]) => arquivos),
);
const daPagina = manifesto.entryJSFiles[chaveDaPagina].filter((f) => !doLayout.has(f));
if (daPagina.length === 0) falhar('nenhum chunk próprio da página');

const achados = [];
for (const rel of daPagina) {
  const arquivo = path.join(NEXT, rel.replace(/^static\//, 'static/'));
  if (!fs.existsSync(arquivo)) falhar(`chunk ausente: ${arquivo}`);
  const texto = fs.readFileSync(arquivo, 'utf8');
  for (const m of texto.matchAll(PROIBIDAS)) {
    const i = m.index ?? 0;
    achados.push(`${rel}: "${m[0]}" em …${texto.slice(Math.max(0, i - 60), i + 40)}…`);
  }
}

if (achados.length > 0) {
  console.error('Palavras proibidas nos chunks estáticos do relatório financeiro:');
  for (const a of achados) console.error(`  ${a}`);
  process.exit(1);
}
console.log(`checar-chunks-relatorio: ${daPagina.length} chunks da página sem PGBL/dedução/aporte`);
