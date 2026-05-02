#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const inputPath = path.join(root, 'docs', 'justificativa-valores-consultores.md');
const outputPath = path.join(root, 'docs', 'justificativa-valores-consultores.print.html');

const md = fs.readFileSync(inputPath, 'utf8');

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .trim()
    .replace(/ /g, '-');

const inline = (text) => {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: prettier defaults to `_x_` for emphasis, but writers also use `*x*`.
  // For `_`, require non-word boundary on each side to avoid matching inside
  // identifiers like `foo_bar` or `valorAplicado_atual`.
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safe = href.replace(/"/g, '&quot;');
    return `<a href="${safe}">${label}</a>`;
  });
  return t;
};

const lines = md.split('\n');
const out = [];
let i = 0;

const flushParagraph = (buf) => {
  if (buf.length === 0) return;
  out.push(`<p>${inline(buf.join(' '))}</p>`);
  buf.length = 0;
};

while (i < lines.length) {
  const line = lines[i];

  if (/^```/.test(line)) {
    const code = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) {
      code.push(lines[i]);
      i++;
    }
    i++;
    out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    continue;
  }

  const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const text = headerMatch[2].replace(/^[\d.]+\s*/, (m) => m); // keep numbering
    const id = slug(headerMatch[2]);
    out.push(`<h${level} id="${id}">${inline(headerMatch[2])}</h${level}>`);
    i++;
    continue;
  }

  if (/^---\s*$/.test(line)) {
    out.push('<hr/>');
    i++;
    continue;
  }

  if (/^>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      buf.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    continue;
  }

  if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) {
    const headerCells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
      i++;
    }
    let html = '<table><thead><tr>';
    for (const c of headerCells) html += `<th>${inline(c)}</th>`;
    html += '</tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr>';
      for (const c of r) html += `<td>${inline(c)}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
    out.push(html);
    continue;
  }

  const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
  if (olMatch) {
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(/^(\d+)\.\s+(.+)$/);
      if (!m) break;
      const itemBuf = [m[2]];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
        itemBuf.push(lines[i].trim());
        i++;
      }
      items.push(itemBuf.join(' '));
    }
    let html = '<ol>';
    for (const it of items) html += `<li>${inline(it)}</li>`;
    html += '</ol>';
    out.push(html);
    continue;
  }

  if (/^[-*]\s+/.test(line)) {
    const items = [];
    while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
      const itemBuf = [lines[i].replace(/^[-*]\s+/, '')];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
        itemBuf.push(lines[i].trim());
        i++;
      }
      items.push(itemBuf.join(' '));
    }
    let html = '<ul>';
    for (const it of items) html += `<li>${inline(it)}</li>`;
    html += '</ul>';
    out.push(html);
    continue;
  }

  if (line.trim() === '') {
    i++;
    continue;
  }

  const buf = [line];
  i++;
  while (
    i < lines.length &&
    lines[i].trim() !== '' &&
    !/^#{1,6}\s/.test(lines[i]) &&
    !/^---\s*$/.test(lines[i]) &&
    !/^```/.test(lines[i]) &&
    !/^>\s?/.test(lines[i]) &&
    !/^[-*]\s+/.test(lines[i]) &&
    !/^\d+\.\s+/.test(lines[i]) &&
    !/^\s*\|.*\|\s*$/.test(lines[i])
  ) {
    buf.push(lines[i]);
    i++;
  }
  flushParagraph(buf);
}

const body = out.join('\n');

const css = `
:root {
  color-scheme: light;
  --fg: #1c2530;
  --fg-soft: #4a5564;
  --muted: #6b7785;
  --accent: #1f6feb;
  --accent-soft: #e6f0ff;
  --rule: #e2e6ec;
  --code-bg: #f4f6f8;
  --warn-bg: #fff4e5;
  --warn-border: #ffb84d;
  --tip-bg: #e8f5ee;
  --tip-border: #2ea44f;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 11pt;
  line-height: 1.55;
  color: var(--fg);
  background: #fff;
  max-width: 760px;
  margin: 0 auto;
  padding: 28px 36px 60px;
}
h1, h2, h3, h4, h5, h6 { color: #0f1722; line-height: 1.25; margin: 1.6em 0 0.5em; font-weight: 650; }
h1 { font-size: 24pt; margin-top: 0; border-bottom: 2px solid var(--accent); padding-bottom: 0.2em; }
h2 { font-size: 17pt; border-bottom: 1px solid var(--rule); padding-bottom: 0.15em; page-break-before: always; }
h2:first-of-type { page-break-before: avoid; }
h3 { font-size: 13pt; color: #1f3047; }
h4 { font-size: 11.5pt; color: #2a3a52; }
p { margin: 0.5em 0 0.7em; }
strong { color: #0f1722; }
em { color: #2a3a52; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: "JetBrains Mono", "Menlo", "Consolas", monospace;
  font-size: 9.5pt;
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 3px;
  color: #2a3a52;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: 10px 14px;
  overflow-x: auto;
  font-size: 9.5pt;
  line-height: 1.45;
  page-break-inside: avoid;
}
pre code { background: transparent; padding: 0; color: #1c2530; }
blockquote {
  border-left: 3px solid var(--warn-border);
  background: var(--warn-bg);
  padding: 8px 14px;
  margin: 1em 0;
  border-radius: 0 4px 4px 0;
  page-break-inside: avoid;
}
blockquote:has(strong:first-child) { border-left-color: var(--tip-border); background: var(--tip-bg); }
ul, ol { margin: 0.4em 0 0.9em; padding-left: 1.4em; }
li { margin: 0.2em 0; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 1.8em 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0 1.1em;
  font-size: 10pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid var(--rule);
  padding: 6px 9px;
  text-align: left;
  vertical-align: top;
}
th { background: var(--accent-soft); color: #0f1722; font-weight: 600; }
tbody tr:nth-child(even) td { background: #fafbfc; }

.cover {
  page-break-after: always;
  text-align: center;
  padding-top: 90px;
  border: none;
}
.cover .brand {
  font-size: 11pt;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 700;
}
.cover h1 {
  font-size: 30pt;
  border: none;
  margin: 16px 0 8px;
  line-height: 1.15;
}
.cover .subtitle {
  font-size: 14pt;
  color: var(--fg-soft);
  margin-bottom: 60px;
}
.cover .meta {
  margin-top: 80px;
  color: var(--muted);
  font-size: 10pt;
  letter-spacing: 1px;
}
.cover .seal {
  margin: 50px auto 0;
  display: inline-block;
  border: 1px solid var(--rule);
  padding: 18px 28px;
  border-radius: 6px;
  text-align: left;
  background: #fafbfc;
  font-size: 10pt;
  color: var(--fg-soft);
  max-width: 480px;
}
.cover .seal strong { color: var(--fg); }

@page {
  size: A4;
  margin: 18mm 16mm 22mm;
}
@media print {
  body { max-width: none; padding: 0; }
  a { color: inherit; text-decoration: none; }
  pre, blockquote, table { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
}
`;

const cover = `
<section class="cover">
  <div class="brand">My Finance</div>
  <h1>Justificativa dos Valores Apresentados</h1>
  <div class="subtitle">Documento técnico para a equipe de consultoria financeira</div>
  <div class="seal">
    <div><strong>Escopo:</strong> Fórmulas, fontes de dados e metodologia por trás dos números exibidos no produto.</div>
    <div style="margin-top:10px"><strong>Pública-alvo:</strong> Consultores financeiros — referência de apoio em conversas com clientes.</div>
    <div style="margin-top:10px"><strong>Última revisão:</strong> 2026-04-30</div>
  </div>
  <div class="meta">My Finance · Documento Interno</div>
</section>
`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>My Finance — Justificativa dos Valores Apresentados</title>
<style>${css}</style>
</head>
<body>
${cover}
${body}
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Wrote ${outputPath} (${(html.length / 1024).toFixed(1)} KB)`);
