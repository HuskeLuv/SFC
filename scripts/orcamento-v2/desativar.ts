/**
 * Reversão da ativação do Orçamento v2 de UM usuário (desenho técnico §4 "Reversão"). DRY-RUN por
 * padrão (só mostra o plano); grava só com --aplicar, numa transação:
 *
 *  - tira do beta (o usuário volta para a tela atual, com as metas antigas congeladas);
 *  - apaga os orçados v2 (cashflow_orcamento_itens) e o prefs (marca de ativação);
 *  - apaga as Gerais sem células nem transações; as com valores viram item comum
 *    (`isGeral = false`: renomeável e excluível na Planilha) e o script avisa.
 *
 * Os overrides de grupo criados na Fase A ficam (iguais a ter editado). Idempotente.
 *
 *   npx tsx --env-file=.env scripts/orcamento-v2/desativar.ts --email a@x.com [--aplicar]
 *
 * Imprime só contagens e ids. Em prod, com OK do Wellington e registro da mudança.
 */
import prisma from '@/lib/prisma';
import {
  desativarOrcamentoV2,
  type PlanoDesativacao,
} from '@/services/cashflow/orcamentoV2/ativacao';

export interface OpcoesDesativar {
  alvo: string;
  aplicar: boolean;
}

export function lerOpcoes(argv: string[]): OpcoesDesativar {
  const i = argv.indexOf('--email');
  const alvo = i >= 0 ? argv[i + 1] : undefined;
  if (!alvo || alvo.startsWith('--')) throw new Error('Use --email <e-mail ou id do usuário>');
  return { alvo, aplicar: argv.includes('--aplicar') };
}

/** Puro: plano → linhas para o terminal. */
export function formatarPlano(p: PlanoDesativacao, aplicado: boolean): string[] {
  const linhas = [
    `=== Orçamento v2 · desativação de ${p.userId} (${aplicado ? 'APLICADO' : 'dry-run'}) ===`,
    `no beta: ${p.noBeta ? 'sim' : 'não'} · ativado: ${p.ativado ? 'sim' : 'não'}`,
    `orçados v2 a apagar: ${p.orcados} · prefs: ${p.temPrefs ? 'apagar' : 'não há'}`,
    `Gerais sem dados a apagar: ${p.geraisAApagar.length}`,
    `Gerais com valores → item comum (isGeral=false): ${p.geraisAConverter.length}`,
  ];
  if (p.geraisAConverter.length > 0) {
    linhas.push(
      `  AVISO: ${p.geraisAConverter.join(', ')} ficam na Planilha como item comum "Geral".`,
    );
  }
  return linhas;
}

const ehUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function main() {
  const op = lerOpcoes(process.argv.slice(2));
  try {
    const usuario = await prisma.user.findFirst({
      where: ehUuid(op.alvo)
        ? { id: op.alvo }
        : { email: { equals: op.alvo, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!usuario) throw new Error('Usuário não encontrado');
    const { plano, aplicado } = await desativarOrcamentoV2(usuario.id, { dryRun: !op.aplicar });
    formatarPlano(plano, aplicado).forEach((l) => console.log(l));
    console.log(
      aplicado
        ? '\nGravado. Vale em até 60 s (cache do acesso).'
        : '\nDry-run: nada gravado. Use --aplicar para gravar.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
