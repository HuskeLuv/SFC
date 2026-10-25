/**
 * Ativação do Orçamento v2 de UM usuário (desenho técnico §4). DRY-RUN por padrão: só planeja
 * (nenhuma escrita); grava só com --aplicar.
 *
 *   npx tsx --env-file=.env scripts/orcamento-v2/ativar.ts --email a@x.com
 *   npx tsx --env-file=.env scripts/orcamento-v2/ativar.ts --email a@x.com --aplicar --beta \
 *       [--adotar-orfas] [--sugestoes] [--motivo "piloto"] [--por "wellington"]
 *
 *  --aplicar       roda as fases A/B/C (advisory lock, estrutura, orçados, verificação; divergiu →
 *                  compensa e sai com código 1).
 *  --beta          depois de ativar E verificar, inclui o usuário em feature_beta_users no mesmo
 *                  comando (as linhas "Geral" na Planilha e a tela v2 aparecem juntas). No dry-run
 *                  só mostra que incluiria. Nunca inclui se a ativação abortou ou foi compensada.
 *  --adotar-orfas  copia também as metas órfãs (gravadas em id de template, invisíveis hoje).
 *                  Decisão caso a caso, olhando o dry-run (Q17).
 *  --sugestoes     cria as subcategorias sugeridas do catálogo (P4). Sem a opção, só para usuário
 *                  sem nenhuma célula nas despesas (Q9).
 *
 * Imprime só contagens e ids (sem nome, e-mail ou valores do usuário). Antes do --aplicar em
 * prod: backup do passo 0 do §4, OK do Wellington e aviso ao usuário das linhas "Geral".
 * Reverter: scripts/orcamento-v2/desativar.ts.
 */
import prisma from '@/lib/prisma';
import {
  ativarOrcamentoV2,
  type RelatorioAtivacao,
} from '@/services/cashflow/orcamentoV2/ativacao';
import { gravarBeta } from './beta';

export interface OpcoesAtivar {
  alvo: string;
  aplicar: boolean;
  beta: boolean;
  adotarOrfas: boolean;
  sugestoes: boolean;
  motivo: string | null;
  por: string;
}

function valorDe(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

export function lerOpcoes(argv: string[]): OpcoesAtivar {
  const alvo = valorDe(argv, '--email');
  if (!alvo) throw new Error('Use --email <e-mail ou id do usuário>');
  return {
    alvo,
    aplicar: argv.includes('--aplicar'),
    beta: argv.includes('--beta'),
    adotarOrfas: argv.includes('--adotar-orfas'),
    sugestoes: argv.includes('--sugestoes'),
    motivo: valorDe(argv, '--motivo'),
    por: valorDe(argv, '--por') ?? process.env.USER ?? 'script',
  };
}

const contar = <T>(xs: T[], chave: (x: T) => string) =>
  xs.reduce<Record<string, number>>((acc, x) => {
    acc[chave(x)] = (acc[chave(x)] ?? 0) + 1;
    return acc;
  }, {});

/** Puro: relatório → linhas para o terminal, só com contagens e ids. */
export function formatarRelatorio(r: RelatorioAtivacao): string[] {
  const linhas = [
    `=== Orçamento v2 · ativação de ${r.userId} (${r.dryRun ? 'dry-run' : 'APLICAR'}) ===`,
    `status: ${r.status}${r.motivo ? ` (${r.motivo})` : ''}`,
  ];
  const p = r.plano;
  if (p) {
    const ignoradas = contar(p.orcadosIgnorados, (x) => x.motivo);
    linhas.push(
      `categorias: ${p.totalCategorias} · a personalizar: ${p.categoriasAPersonalizar.length}`,
      `Gerais: criar ${p.geraisACriar.length} · adotar ${p.geraisAdotadas.length}`,
      `orçados a inserir: ${p.orcadosAInserir.length} linha(s) mensais`,
      `metas ignoradas: ${
        Object.entries(ignoradas)
          .map(([m, n]) => `${m}=${n}`)
          .join(', ') || '0'
      }`,
      `órfãs adotáveis (--adotar-orfas): ${p.orfasAdotaveis.length}${p.orfasAdotaveis.length ? ` [${p.orfasAdotaveis.map((o) => o.linhaId).join(', ')}]` : ''}`,
      `meses de meta % sem receita (gravados 0): ${p.mesesSemReceita.length}`,
      `células em item-template (aborta se > 0): ${p.valoresEmItemTemplate}`,
      `orçados v2 já existentes sem ativação (aborta se > 0): ${p.orcadosV2Existentes}`,
      `itens soltos em Despesas/Despesas Fixas (Q15): ${p.itensSoltos.length}`,
      `sugestões a aplicar: ${p.sugestoesAAplicar}${p.usuarioNovo ? ' (usuário sem despesas)' : ''}`,
    );
  }
  if (!r.dryRun) {
    const m = r.mudancas;
    linhas.push(
      `gravado: categorias personalizadas ${m.gruposPersonalizados} · ocultos preservados ${m.ocultosPreservados} · Gerais criadas ${m.geraisCriadas} · adotadas ${m.geraisAdotadas} · orçados ${m.orcadosInseridos} · sugestões ${m.sugestoesCriadas} · prefs ${m.prefsGravado ? 'sim' : 'não'}`,
    );
  }
  if (r.divergencias.length > 0) {
    linhas.push(`divergências (${r.divergencias.length}):`);
    for (const d of r.divergencias.slice(0, 30)) {
      linhas.push(
        `  ${d.chave} ${d.tipo}${d.mes != null ? ` mês ${d.mes + 1}` : ''}: esperado ${d.antes} · obtido ${d.depois}`,
      );
    }
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
      select: { id: true, email: true },
    });
    if (!usuario) throw new Error('Usuário não encontrado');

    const relatorio = await ativarOrcamentoV2(usuario.id, {
      dryRun: !op.aplicar,
      adotarOrfas: op.adotarOrfas,
      aplicarSugestoes: op.sugestoes,
    });
    formatarRelatorio(relatorio).forEach((l) => console.log(l));

    const ok = relatorio.status !== 'abortado' && relatorio.status !== 'compensado';
    if (op.beta) {
      if (!ok) console.log('\nbeta: NÃO incluído (ativação não concluída).');
      else if (!op.aplicar) console.log('\nbeta: incluiria no beta (dry-run).');
      else {
        const n = await gravarBeta(prisma, 'adicionar', [usuario], op.por, op.motivo);
        console.log(
          `\nbeta: ${n ? 'incluído' : 'já estava'} na lista (vale em até 60 s, cache do acesso).`,
        );
      }
    }
    if (!op.aplicar) console.log('\nDry-run: nada gravado. Use --aplicar para gravar.');
    else if (ok) {
      console.log(
        '\nPós-checagem (§4 passo 6): conferir o GET v2 do mês corrente contra a tela antiga.',
      );
    }
    if (!ok) process.exitCode = 1;
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
