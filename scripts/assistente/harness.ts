/**
 * Teste cego de qualidade do assistente: roda as perguntas de
 * docs/assistente/perguntas.json contra N modelos, com o mesmo prompt de
 * sistema e o mesmo contexto (docs/assistente/contexto.json), e gera:
 *
 *   docs/assistente/resultados/<data>/tabela-cega.md   ← para Pedro/Wellington pontuarem (A/B/C, sem nome nem custo)
 *   docs/assistente/resultados/<data>/gabarito.json    ← quem é A/B/C + custo, latência, tokens (abrir só depois)
 *   docs/assistente/resultados/<data>/resultados.json  ← bruto
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/assistente/harness.ts
 *   npx tsx --env-file=.env scripts/assistente/harness.ts --modelos=claude-haiku-4-5,claude-sonnet-5
 *   npx tsx --env-file=.env scripts/assistente/harness.ts --so=3        (só as 3 primeiras perguntas)
 *   npx tsx --env-file=.env scripts/assistente/harness.ts --repeticoes=2 (mede variação e cache)
 *
 * Modelos cujo fornecedor não tem chave no ambiente são pulados com aviso.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CANDIDATE_MODELS,
  complete,
  getProviderForModel,
  type LlmResponse,
} from '../../src/services/assistente/llm';
import { buildSystemPrompt } from '../../src/services/assistente/prompt';

const ROOT = process.cwd();
const PERGUNTAS = path.join(ROOT, 'docs', 'assistente', 'perguntas.json');
const CONTEXTO = path.join(ROOT, 'docs', 'assistente', 'contexto.json');
const MAX_OUTPUT_TOKENS = 400;

interface Pergunta {
  id: string;
  categoria: string;
  pergunta: string;
  /** O que uma boa resposta precisa conter (guia de pontuação, não vai ao modelo). */
  esperado?: string;
}

interface Resultado {
  perguntaId: string;
  model: string;
  repeticao: number;
  ok: boolean;
  erro?: string;
  resposta?: string;
  stopReason?: string;
  latencyMs?: number;
  usage?: LlmResponse['usage'];
  costUsd?: number;
  costBrl?: number;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const perguntas = JSON.parse(fs.readFileSync(PERGUNTAS, 'utf8')) as Pergunta[];
  if (!fs.existsSync(CONTEXTO)) {
    throw new Error(
      'docs/assistente/contexto.json não existe — rode scripts/assistente/build-contexto.ts antes',
    );
  }
  const contextoJson = fs.readFileSync(CONTEXTO, 'utf8');
  const system = buildSystemPrompt(contextoJson);

  const modelos = (arg('modelos')?.split(',') ?? [...CANDIDATE_MODELS]).map((m) => m.trim());
  const so = Number(arg('so') ?? perguntas.length);
  const repeticoes = Number(arg('repeticoes') ?? 1);
  const selecionadas = perguntas.slice(0, so);

  const ativos = modelos.filter((m) => {
    const ok = getProviderForModel(m).isConfigured();
    if (!ok) console.warn(`! pulando ${m}: fornecedor sem chave no ambiente`);
    return ok;
  });
  if (ativos.length === 0) throw new Error('nenhum modelo com credencial configurada');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const outDir = path.join(ROOT, 'docs', 'assistente', 'resultados', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `Modelos: ${ativos.join(', ')} · perguntas: ${selecionadas.length} · repetições: ${repeticoes}`,
  );
  console.log(`Prompt de sistema ≈ ${Math.round(system.length / 3.2)} tokens (estimativa)`);

  const resultados: Resultado[] = [];
  // Modelos em paralelo, perguntas em sequência dentro de cada modelo (cache aquecido, sem rajada).
  await Promise.all(
    ativos.map(async (model) => {
      for (let rep = 1; rep <= repeticoes; rep++) {
        for (const p of selecionadas) {
          const base: Resultado = { perguntaId: p.id, model, repeticao: rep, ok: false };
          try {
            const res = await complete(model, {
              system,
              messages: [{ role: 'user', content: p.pergunta }],
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              reasoning: 'none',
              cacheKey: 'harness-v1',
            });
            resultados.push({
              ...base,
              ok: true,
              resposta: res.text,
              stopReason: res.stopReason,
              latencyMs: res.latencyMs,
              usage: res.usage,
              costUsd: res.costUsd,
              costBrl: res.costBrl,
            });
            console.log(
              `  ${model.padEnd(18)} ${p.id.padEnd(6)} ${String(res.latencyMs).padStart(5)} ms  R$ ${res.costBrl.toFixed(4)}  cache ${res.usage.cachedInputTokens}/${res.usage.cacheWriteTokens}  ${res.stopReason}`,
            );
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            resultados.push({ ...base, erro: msg });
            console.log(`  ${model.padEnd(18)} ${p.id.padEnd(6)} ERRO ${msg.slice(0, 120)}`);
          }
        }
      }
    }),
  );

  // Rótulos cegos (A, B, C…) embaralhados com semente derivada da data.
  const seed = Number(stamp.replace(/\D/g, '').slice(-6));
  const labels = shuffle(ativos, seed).map((m, i) => ({
    label: String.fromCharCode(65 + i),
    model: m,
  }));
  const labelOf = (m: string) => labels.find((l) => l.model === m)?.label ?? '?';

  // Tabela cega: só a 1ª repetição, sem custo/latência (revelariam o modelo).
  const md: string[] = [
    `# Teste cego do assistente — ${stamp}`,
    '',
    `Modelos: ${labels.map((l) => l.label).join(', ')} (identidade em gabarito.json — abrir só depois de pontuar).`,
    'Pontue cada resposta de 0 a 3: 0 errada/inventou · 1 fraca · 2 boa · 3 ótima (correta, curta, usa os dados).',
    '',
    '| # | Modelo | Nota (0-3) | Comentário |',
    '| --- | --- | --- | --- |',
    ...selecionadas.flatMap((p) => labels.map((l) => `| ${p.id} | ${l.label} |  |  |`)),
    '',
  ];
  for (const p of selecionadas) {
    md.push(`## ${p.id} · ${p.categoria}`, '', `**Pergunta:** ${p.pergunta}`, '');
    if (p.esperado) md.push(`_Guia de pontuação:_ ${p.esperado}`, '');
    for (const l of labels) {
      const r = resultados.find(
        (x) => x.perguntaId === p.id && x.model === l.model && x.repeticao === 1,
      );
      const texto = r?.ok
        ? r.resposta || '(resposta vazia)'
        : `(erro: ${r?.erro ?? 'sem resultado'})`;
      md.push(`### Resposta ${l.label}`, '', texto.replace(/\n{3,}/g, '\n\n'), '');
    }
  }
  fs.writeFileSync(path.join(outDir, 'tabela-cega.md'), md.join('\n'));

  const resumo = ativos.map((model) => {
    const rs = resultados.filter((r) => r.model === model && r.ok);
    const n = rs.length || 1;
    const sum = (f: (r: Resultado) => number) => rs.reduce((a, r) => a + f(r), 0);
    return {
      label: labelOf(model),
      model,
      respostas: rs.length,
      erros: resultados.filter((r) => r.model === model && !r.ok).length,
      custoTotalBrl: Number(sum((r) => r.costBrl ?? 0).toFixed(4)),
      custoMedioBrlPorMsg: Number((sum((r) => r.costBrl ?? 0) / n).toFixed(4)),
      custo90MsgsBrl: Number(((sum((r) => r.costBrl ?? 0) / n) * 90).toFixed(2)),
      latenciaMediaMs: Math.round(sum((r) => r.latencyMs ?? 0) / n),
      tokensEntradaMedia: Math.round(
        sum((r) => (r.usage?.inputTokens ?? 0) + (r.usage?.cachedInputTokens ?? 0)) / n,
      ),
      tokensSaidaMedia: Math.round(sum((r) => r.usage?.outputTokens ?? 0) / n),
      cacheHitPct: Math.round(
        (100 * sum((r) => r.usage?.cachedInputTokens ?? 0)) /
          Math.max(
            1,
            sum((r) => (r.usage?.inputTokens ?? 0) + (r.usage?.cachedInputTokens ?? 0)),
          ),
      ),
      maxTokensAtingido: rs.filter((r) => r.stopReason === 'max_tokens').length,
    };
  });
  fs.writeFileSync(
    path.join(outDir, 'gabarito.json'),
    JSON.stringify(
      { stamp, cambioBrl: process.env.ASSISTENTE_CAMBIO_BRL ?? '5.39 (padrão)', modelos: resumo },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(outDir, 'resultados.json'), JSON.stringify(resultados, null, 1));

  console.log('\nResumo (gabarito):');
  for (const r of resumo) {
    console.log(
      `  ${r.label} ${r.model.padEnd(18)} ${r.respostas} ok / ${r.erros} erro · R$ ${r.custoMedioBrlPorMsg.toFixed(4)}/msg · R$ ${r.custo90MsgsBrl}/90 msgs · ${r.latenciaMediaMs} ms · cache ${r.cacheHitPct}% · max_tokens ${r.maxTokensAtingido}×`,
    );
  }
  console.log(`\n✓ ${path.relative(ROOT, outDir)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
