/**
 * Relatório de prontidão da ativação do Orçamento v2 (desenho técnico §4 "Dry-run de verdade",
 * E0). SÓ LEITURA: roda `planejarAtivacao` para todo usuário com fluxo de caixa e imprime
 * CONTAGENS, sem nenhum dado pessoal (usuários numerados, sem id/e-mail/nome/valor), para anexar
 * à PR:
 *
 *  - metas órfãs (id de template, invisíveis hoje) e duplicadas (template × override);
 *  - itens soltos direto em "Despesas"/"Despesas Fixas" (Q15);
 *  - células com value < valorBanco (parte digitada negativa, para a E3);
 *  - células em item-template e orçados v2 sem ativação (abortariam a ativação);
 *  - quantos já estão ativados.
 *
 *   npx tsx --env-file=.env scripts/orcamento-v2/relatorio-dump.ts
 *
 * Para medir a fidelidade da ativação em si (divergências), rodar `ativar.ts --aplicar` usuário a
 * usuário num banco LOCAL restaurado, nunca em prod.
 */
import prisma from '@/lib/prisma';
import { motivoAborto, planejarAtivacao } from '@/services/cashflow/orcamentoV2/ativacao';
import type { PlanoAtivacao } from '@/services/cashflow/orcamentoV2/ativacao';

export interface LinhaRelatorio {
  jaAtivado: boolean;
  aborta: boolean;
  categorias: number;
  aPersonalizar: number;
  orcados: number;
  orfas: number;
  duplicadas: number;
  ocultas: number;
  itensSoltos: number;
  valorMenorQueBanco: number;
  valoresEmItemTemplate: number;
  orcadosV2Existentes: number;
  mesesSemReceita: number;
}

/** Puro: plano + contagem extra → linha sem dado pessoal. */
export function linhaDoPlano(p: PlanoAtivacao, valorMenorQueBanco: number): LinhaRelatorio {
  const motivos = (m: string) => p.orcadosIgnorados.filter((x) => x.motivo === m).length;
  return {
    jaAtivado: p.jaAtivado,
    aborta: !p.jaAtivado && motivoAborto(p) != null,
    categorias: p.totalCategorias,
    aPersonalizar: p.categoriasAPersonalizar.length,
    orcados: p.orcadosAInserir.length,
    orfas: p.orfasAdotaveis.length,
    duplicadas: motivos('duplicada'),
    ocultas: motivos('grupo_oculto'),
    itensSoltos: p.itensSoltos.length,
    valorMenorQueBanco,
    valoresEmItemTemplate: p.valoresEmItemTemplate,
    orcadosV2Existentes: p.orcadosV2Existentes,
    mesesSemReceita: p.mesesSemReceita.length,
  };
}

const CAMPOS_SOMADOS = [
  'orcados',
  'orfas',
  'duplicadas',
  'ocultas',
  'itensSoltos',
  'valorMenorQueBanco',
  'valoresEmItemTemplate',
  'orcadosV2Existentes',
  'mesesSemReceita',
] as const;

/** Puro: linhas → texto (uma linha por usuário numerado + totais e usuários afetados). */
export function formatarRelatorioDump(linhas: LinhaRelatorio[]): string[] {
  const out = [`=== Orçamento v2 · prontidão da ativação (${linhas.length} usuário(s)) ===`];
  linhas.forEach((l, i) => {
    out.push(
      `#${i + 1}${l.jaAtivado ? ' [ativado]' : ''}${l.aborta ? ' [ABORTA]' : ''} cat=${l.categorias} personalizar=${l.aPersonalizar} ` +
        CAMPOS_SOMADOS.map((c) => `${c}=${l[c]}`).join(' '),
    );
  });
  out.push('--- totais (soma · usuários com > 0) ---');
  for (const c of CAMPOS_SOMADOS) {
    const soma = linhas.reduce((s, l) => s + l[c], 0);
    const usuarios = linhas.filter((l) => l[c] > 0).length;
    out.push(`${c}: ${soma} · ${usuarios} usuário(s)`);
  }
  out.push(
    `já ativados: ${linhas.filter((l) => l.jaAtivado).length} · abortariam: ${linhas.filter((l) => l.aborta).length}`,
  );
  return out;
}

async function main() {
  try {
    const usuarios = await prisma.user.findMany({
      where: {
        OR: [
          { cashflowGroups: { some: {} } },
          { cashflowValues: { some: {} } },
          { cashflowOrcamentos: { some: {} } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const hoje = new Date();
    const linhas: LinhaRelatorio[] = [];
    for (const u of usuarios) {
      const [plano, valorMenorQueBanco] = await Promise.all([
        planejarAtivacao(u.id, hoje),
        prisma.cashflowValue.count({
          where: { userId: u.id, value: { lt: prisma.cashflowValue.fields.valorBanco } },
        }),
      ]);
      linhas.push(linhaDoPlano(plano, valorMenorQueBanco));
    }
    formatarRelatorioDump(linhas).forEach((l) => console.log(l));
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
