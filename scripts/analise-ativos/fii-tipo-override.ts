/**
 * Override manual do tipo de FII (FiiTipoOverride, decisão 9): grava/remove o override com motivo
 * e autor e recalcula tipoVigente/reguaVigente de todos os meses gravados do fundo (FiiMonthly),
 * sem reler a CVM. Dry-run por padrão; --apply explícito.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/fii-tipo-override.ts --listar
 *   npx tsx --env-file=.env scripts/analise-ativos/fii-tipo-override.ts \
 *     --cnpj=18.979.895/0001-13 --tipo=papel --motivo="gestor classifica como papel" --autor=pedro [--apply]
 *   npx tsx --env-file=.env scripts/analise-ativos/fii-tipo-override.ts --cnpj=... --remover [--apply]
 */
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import { obterScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';
import { gravarMensal, linhaMensalDoBanco } from '../../src/services/analiseAtivos/fii/gravarFii';
import { recalcularTiposDoFundo } from '../../src/services/analiseAtivos/fii/sincronizarFiiMensal';
import { formatarCnpj } from '../../src/services/analiseAtivos/regras/fii/tickerCnpj';
import { prisma } from '../../src/lib/prisma';
import type { FiiTipo } from '../../src/services/analiseAtivos/tipos';

const TIPOS: readonly FiiTipo[] = ['tijolo', 'papel', 'fof', 'hibrido', 'indefinido'];

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

async function main() {
  const aplicar = arg('apply') === 'true';
  if (arg('listar') === 'true') {
    const linhas = await prisma.fiiTipoOverride.findMany({ orderBy: { cnpj: 'asc' } });
    for (const l of linhas) {
      console.log(
        `${l.cnpj}  ${l.tipo.padEnd(10)} ${l.autor} ${l.criadoEm.toISOString()} — ${l.motivo}`,
      );
    }
    console.log(`${linhas.length} override(s)`);
    return;
  }

  const cnpj = formatarCnpj(arg('cnpj'));
  if (!cnpj) throw new Error('--cnpj obrigatório (14 dígitos)');
  const remover = arg('remover') === 'true';
  let tipo: FiiTipo | null = null;
  if (!remover) {
    const t = arg('tipo') as FiiTipo | undefined;
    if (!t || !TIPOS.includes(t)) throw new Error(`--tipo deve ser um de ${TIPOS.join(', ')}`);
    const motivo = arg('motivo');
    const autor = arg('autor');
    if (!motivo || motivo.length < 5) throw new Error('--motivo obrigatório (documenta a decisão)');
    if (!autor) throw new Error('--autor obrigatório');
    tipo = t;
    console.log(`=== override ${cnpj} ⇒ ${tipo} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
    if (aplicar) {
      await prisma.fiiTipoOverride.upsert({
        where: { cnpj },
        create: { cnpj, tipo, motivo, autor },
        update: { tipo, motivo, autor, criadoEm: new Date() },
      });
    }
  } else {
    console.log(`=== remover override ${cnpj} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
    if (aplicar) await prisma.fiiTipoOverride.deleteMany({ where: { cnpj } });
  }

  let params = SCORING_PARAMS_V1;
  try {
    params = (await obterScoringParams(prisma)).params;
  } catch {
    console.log('  (ScoringParams do banco indisponível; usando v1 do código)');
  }
  const gravadas = (
    await prisma.fiiMonthly.findMany({ where: { cnpj }, orderBy: { refMonth: 'asc' } })
  ).map(linhaMensalDoBanco);
  const novas = recalcularTiposDoFundo(gravadas, tipo, params);
  const existentes = new Map(gravadas.map((l) => [`${l.cnpj}|${l.refMonth}`, l]));
  const r = await gravarMensal(prisma, novas, existentes, aplicar);
  const mudancas = novas.filter((n, i) => n.tipoVigente !== gravadas[i].tipoVigente);
  console.log(
    `  meses: ${gravadas.length} · tipoVigente muda em ${mudancas.length} · linhas atualizadas ${r.atualizadas}`,
  );
  const ultimo = novas[novas.length - 1];
  if (ultimo)
    console.log(`  último mês ${ultimo.refMonth}: ${ultimo.tipoVigente} / ${ultimo.reguaVigente}`);
  if (!aplicar) console.log('dry-run: nada gravado. Use --apply.');
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
