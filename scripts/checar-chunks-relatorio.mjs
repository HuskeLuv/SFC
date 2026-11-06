#!/usr/bin/env node
/**
 * Guarda do Relatório financeiro (ticket 86e3yg90z, decisão 6): os chunks ESTÁTICOS da rota
 * /relatorios/financeiro — o que o navegador baixa para qualquer plano, inclusive o Basic — não
 * podem conter "PGBL", "dedução" nem "aporte". Os corpos com esses textos (secoes/real/* e adv/*)
 * só entram por next/dynamic, em chunks separados, quando o plano libera.
 *
 * Roda depois do `next build` (CI, job quality): lê o app-build-manifest.json, pega os chunks
 * de entrada da PÁGINA (sem os dos layouts que a envolvem, que são de outras telas) e procura as
 * palavras. Sai com código 1 e lista os achados. (O client-reference-manifest do build de
 * produção do Next 15 não traz entryJSFiles.)
 *
 * Uso: node scripts/checar-chunks-relatorio.mjs [pasta .next]
 */
import fs from 'node:fs';
import path from 'node:path';

const NEXT = path.resolve(process.argv[2] ?? '.next');
const ROTA = '/(admin)/(home)/relatorios/financeiro/page';
const MANIFESTO = path.join(NEXT, 'app-build-manifest.json');
// PGBL só em maiúsculas: é como o texto ao usuário escreve. 'pgbl'/'Pgbl' em minúsculas são
// identificadores do código compartilhado (queryKeys.ir.pgbl, irSimulacaoPgbl), não texto.
// Dedução e aporte seguem sem diferenciar maiúsculas (pegam também nomes de campo como
// aportesPeriodo, que a F3 tirou do chunk estático de propósito).
const PROIBIDAS = /PGBL|[Dd][Ee][Dd][Uu][CcÇç]|[Aa][Pp][Oo][Rr][Tt][Ee]/g;

function falhar(msg) {
  console.error(`checar-chunks-relatorio: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFESTO)) falhar(`manifesto não encontrado (${MANIFESTO}); rode o next build`);

const paginas = JSON.parse(fs.readFileSync(MANIFESTO, 'utf8')).pages ?? {};
const daRota = paginas[ROTA];
if (!Array.isArray(daRota)) falhar(`manifesto sem a entrada ${ROTA}`);

// Layouts que envolvem a rota ('/layout', '/(admin)/layout', '/(admin)/(home)/layout'...): os
// chunks deles são compartilhados com as outras telas e ficam de fora.
const segmentos = ROTA.split('/').slice(1, -1);
const layouts = [
  '/layout',
  ...segmentos.map((_, i) => `/${segmentos.slice(0, i + 1).join('/')}/layout`),
];
const doLayout = new Set(layouts.flatMap((k) => paginas[k] ?? []));
const daPagina = daRota.filter((f) => f.endsWith('.js') && !doLayout.has(f));
if (daPagina.length === 0) falhar('nenhum chunk próprio da página');

const achados = [];
for (const rel of daPagina) {
  const arquivo = path.join(NEXT, rel.replace(/^static\//, 'static/'));
  if (!fs.existsSync(arquivo)) falhar(`chunk ausente: ${arquivo}`);
  // O build minificado escreve o que não é ASCII como \xNN/\uNNNN ('dedu\xe7\xe3o'):
  // desfaz os escapes antes de procurar.
  const texto = fs
    .readFileSync(arquivo, 'utf8')
    .replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4}))/g, (_, x, u) =>
      String.fromCharCode(parseInt(x ?? u, 16)),
    );
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
