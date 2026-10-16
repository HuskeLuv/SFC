/**
 * Casca de CLI da revisão de um ponto de provedor (v2.5, caso de curadoria 'fonte_externa'). A
 * decisão passa pela MESMA função da tela /admin/curadoria (aplicarAcaoCaso → efeitoFonteExterna):
 * o caso fecha, o ponto vira 'approved' ou 'rejected' com reviewedBy = o admin, e fica o evento.
 * Dry-run por padrão; --apply explícito. Preferir a tela; o CLI serve para lote/manutenção.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/revisar-fonte.ts --caso=<id> \
 *     (--aprovar | --rejeitar) --revisor=<email do admin> [--nota="..."] [--apply]
 */
import { prisma } from '../../src/lib/prisma';
import { revisarCasoFonte } from '../../src/services/analiseAtivos/curadoria/revisarFonte';

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

async function main() {
  const casoId = arg('caso');
  const revisorEmail = arg('revisor');
  const aprovar = arg('aprovar') === 'true';
  const rejeitar = arg('rejeitar') === 'true';
  if (!casoId || !revisorEmail || aprovar === rejeitar) {
    throw new Error(
      'uso: revisar-fonte.ts --caso=<id> (--aprovar | --rejeitar) --revisor=<email> [--nota=...] [--apply]',
    );
  }
  const aplicar = arg('apply') === 'true';
  const r = await revisarCasoFonte(prisma, {
    casoId,
    decisao: aprovar ? 'aprovar' : 'rejeitar',
    revisorEmail,
    nota: arg('nota'),
    aplicar,
  });
  console.log(
    `${aplicar ? 'APLICADO' : 'dry-run'}: caso ${r.casoId} (${r.symbol} · ${r.campo} · ${r.periodo ?? '—'}) ` +
      `→ ${r.decisao} ponto ${r.referencia.tabela}:${r.referencia.id}`,
  );
  if (!aplicar) console.log('nada gravado; rode de novo com --apply');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
