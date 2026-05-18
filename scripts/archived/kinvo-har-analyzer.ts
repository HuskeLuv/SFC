/**
 * Lê arquivos .har capturados do Kinvo e gera um relatório markdown listando:
 *  - cada endpoint chamado (host + path + método);
 *  - número de chamadas;
 *  - parâmetros de query;
 *  - estrutura (paths) dos campos da resposta JSON, com tipo.
 *
 * NÃO grava bodies nem headers no relatório — eles podem conter Bearer tokens
 * e dados pessoais do usuário do Kinvo. Para inspecionar bodies, abra o HAR
 * direto no DevTools.
 *
 * Uso:
 *   npx tsx scripts/kinvo-har-analyzer.ts <arquivo.har OR diretório>
 *
 * Saída: scripts/kinvo-captures/kinvo-endpoints-report.md
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const target = process.argv[2];
if (!target) {
  console.error('Uso: npx tsx scripts/kinvo-har-analyzer.ts <arquivo.har OR diretório>');
  process.exit(1);
}

const files = statSync(target).isDirectory()
  ? readdirSync(target)
      .filter((f) => f.toLowerCase().endsWith('.har'))
      .map((f) => join(target, f))
  : [target];

if (!files.length) {
  console.error(`Nenhum .har encontrado em ${target}`);
  process.exit(1);
}

// ─── HAR types (parcial) ──────────────────────────────────────────────────────
interface HarEntry {
  request: {
    method: string;
    url: string;
    queryString?: Array<{ name: string; value: string }>;
    postData?: { mimeType?: string; text?: string };
  };
  response: {
    status: number;
    content: { mimeType?: string; text?: string; size?: number };
  };
}

interface ParsedEntry {
  method: string;
  host: string;
  pathname: string;
  searchParams: string[];
  status: number;
  resBodyParsed?: unknown;
}

const entries: ParsedEntry[] = [];

for (const file of files) {
  let har: { log?: { entries?: HarEntry[] } };
  try {
    har = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (e) {
    console.error(`Falha ao parsear ${file}:`, e);
    continue;
  }
  const harEntries = har.log?.entries ?? [];
  for (const e of harEntries) {
    const url = e.request.url;
    const mime = e.response.content.mimeType ?? '';
    const looksLikeApi =
      mime.includes('json') || /\/api[\/v0-9]/.test(url) || /\/(graphql|rest|services)/.test(url);
    if (!looksLikeApi) continue;
    if ((e.response.content.size ?? 0) > 1_000_000) continue; // skip bundles

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }

    let resBodyParsed: unknown = undefined;
    if (e.response.content.text) {
      try {
        resBodyParsed = JSON.parse(e.response.content.text);
      } catch {
        // not JSON — ignore body
      }
    }

    entries.push({
      method: e.request.method,
      host: u.host,
      pathname: u.pathname,
      searchParams: [...u.searchParams.keys()].sort(),
      status: e.response.status,
      resBodyParsed,
    });
  }
}

console.log(`Lidos ${files.length} HAR(s); ${entries.length} requisições JSON`);

// ─── group by method+host+path ────────────────────────────────────────────────
const groupKey = (e: ParsedEntry) => `${e.method} ${e.host}${e.pathname}`;
const groups = new Map<string, ParsedEntry[]>();
for (const e of entries) {
  const k = groupKey(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(e);
}

// ─── extract field paths from a JSON value ────────────────────────────────────
function fieldPaths(
  value: unknown,
  prefix = '',
  out = new Map<string, string>(),
  depth = 0,
): Map<string, string> {
  if (depth > 6) {
    out.set(prefix + '.<…>', 'truncated');
    return out;
  }
  if (value === null) {
    out.set(prefix || '<root>', 'null');
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      out.set(prefix + '[]', 'array(empty)');
    } else {
      // sample union of first 3 items
      const sample = value.slice(0, 3);
      for (const item of sample) fieldPaths(item, prefix + '[]', out, depth + 1);
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      fieldPaths(
        (value as Record<string, unknown>)[k],
        prefix ? `${prefix}.${k}` : k,
        out,
        depth + 1,
      );
    }
    return out;
  }
  out.set(prefix || '<root>', typeof value);
  return out;
}

// ─── compose markdown report ──────────────────────────────────────────────────
const lines: string[] = [];
lines.push('# Kinvo — análise de endpoints capturados');
lines.push('');
lines.push(`Arquivos analisados: ${files.length}`);
lines.push(`Requisições JSON: ${entries.length}`);
lines.push(`Endpoints distintos: ${groups.size}`);
lines.push('');
lines.push(
  '> Bodies/headers omitidos do relatório (podem conter tokens). Para inspecionar, abra o HAR no DevTools.',
);
lines.push('');
lines.push('## Sumário');
lines.push('| Método | Host | Path | Chamadas | Status |');
lines.push('|---|---|---|---|---|');
const sortedKeys = [...groups.keys()].sort();
for (const k of sortedKeys) {
  const es = groups.get(k)!;
  const sample = es[0];
  const statuses = [...new Set(es.map((e) => e.status))].join(', ');
  lines.push(
    `| ${sample.method} | ${sample.host} | \`${sample.pathname}\` | ${es.length} | ${statuses} |`,
  );
}
lines.push('');
lines.push('## Endpoints em detalhe');

for (const k of sortedKeys) {
  const es = groups.get(k)!;
  const sample = es[0];
  lines.push('');
  lines.push(`### \`${sample.method} ${sample.pathname}\``);
  lines.push(`- Host: \`${sample.host}\``);
  lines.push(`- Chamadas: ${es.length}`);
  lines.push(`- Status: ${[...new Set(es.map((e) => e.status))].join(', ')}`);
  const allParams = new Set<string>();
  for (const e of es) for (const p of e.searchParams) allParams.add(p);
  if (allParams.size > 0) {
    lines.push(
      `- Query params: ${[...allParams]
        .sort()
        .map((p) => `\`${p}\``)
        .join(', ')}`,
    );
  }

  // Pick the first sample with a parsed JSON body for the schema
  const withBody = es.find((e) => e.resBodyParsed !== undefined);
  if (withBody) {
    const paths = fieldPaths(withBody.resBodyParsed);
    if (paths.size > 0) {
      lines.push('');
      lines.push('Campos da resposta:');
      lines.push('```');
      const sorted = [...paths.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [p, t] of sorted) {
        lines.push(`${p}: ${t}`);
      }
      lines.push('```');
    }
  }
}

const outFile = join(process.cwd(), 'scripts', 'kinvo-captures', 'kinvo-endpoints-report.md');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join('\n'));
console.log(`✓ Relatório salvo em ${outFile}`);
