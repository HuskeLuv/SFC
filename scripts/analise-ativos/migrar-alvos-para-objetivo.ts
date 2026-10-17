/**
 * One-off (17/10/2026, ticket do Pedro): leva os alvos antigos do "Planejar na carteira"
 * (planning_asset_targets, v2.5) para o OBJETIVO DA CARTEIRA, que é o que o Planejar grava agora.
 *
 * Para cada linha de planning_asset_targets:
 *  - com posição (Portfolio): Portfolio.objetivo = targetPct, só quando o objetivo atual é 0;
 *  - sem posição, com linha planejada (Watchlist): Watchlist.objetivo = targetPct, só quando é 0;
 *  - sem nenhum dos dois: cria a linha planejada na aba do ativo, na seção que a Análise escolheria
 *    (secaoOperacao: FII pelo tipo CVM/perfil dos critérios do Quadro → tijolo/tvm/fofi; ação →
 *    value), com objetivo = targetPct;
 *  - Objetivo > 0 já existente NUNCA é sobrescrito: sai no relatório como CONFLITO.
 *
 * ATENÇÃO: targetPct era % da carteira TOTAL e o Objetivo é % DENTRO da aba. O número é copiado
 * como está (decisão do Wellington, 17/10); o relatório mostra o valor para conferência.
 *
 * Não grava histórico de alterações (não há request/sessão num script) e não apaga
 * planning_asset_targets (a LGPD segue cobrindo a tabela até ela sair do schema).
 *
 * Dry-run por padrão; --apply grava. Opcional: --usuario=<userId> para um só usuário.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/migrar-alvos-para-objetivo.ts
 *   npx tsx --env-file=.env scripts/analise-ativos/migrar-alvos-para-objetivo.ts --apply
 */
import { prisma } from '../../src/lib/prisma';
import { SECOES_POR_ABA, abaDoAssetPlanejado } from '../../src/services/portfolio/ativosPlanejados';
import {
  SECOES_OPERACAO,
  secaoOperacao,
} from '../../src/services/analiseAtivos/regras/carteira/secaoOperacao';
import type { ClasseQuadro, FiiTipoTela } from '../../src/types/analiseAtivosApi';

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return undefined;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
}

const duasCasas = (v: number): number => Math.round(v * 100) / 100;

const TIPOS_FII: readonly FiiTipoTela[] = ['tijolo', 'papel', 'fof', 'hibrido', 'indefinido'];

/** Mesma ordem de tipoCvmDoTopo: 'fof' bruto → perfil dos critérios → tipo CVM bruto. */
export function tipoCvmDaLinha(
  fiiTipo: string | null | undefined,
  perfil: string | null | undefined,
): FiiTipoTela | null {
  if (fiiTipo === 'fof') return 'fof';
  if (perfil === 'fii_tijolo') return 'tijolo';
  if (perfil === 'fii_papel') return 'papel';
  return fiiTipo && (TIPOS_FII as readonly string[]).includes(fiiTipo)
    ? (fiiTipo as FiiTipoTela)
    : null;
}

type Resultado =
  | 'posicao_atualizada'
  | 'planejado_atualizado'
  | 'planejado_criado'
  | 'conflito'
  | 'ja_igual'
  | 'sem_aba';

export interface LinhaRelatorio {
  userId: string;
  ticker: string;
  targetPct: number;
  resultado: Resultado;
  detalhe: string;
}

/** Migra (ou só simula, sem `aplicar`) e devolve uma linha de relatório por alvo. */
export async function migrarAlvosParaObjetivo({
  aplicar,
  usuario,
}: {
  aplicar: boolean;
  usuario?: string;
}): Promise<LinhaRelatorio[]> {
  const alvos = await prisma.planningAssetTarget.findMany({
    where: usuario ? { userId: usuario } : {},
    include: { asset: true },
    orderBy: [{ userId: 'asc' }, { updatedAt: 'asc' }],
  });
  const quadro = await prisma.analiseQuadroLinha.findMany({
    where: { symbol: { in: alvos.map((a) => a.asset.symbol) } },
    select: { symbol: true, classe: true, fiiTipo: true, perfilCriterios: true },
  });
  const quadroPorTicker = new Map(quadro.map((q) => [q.symbol, q]));

  const relatorio: LinhaRelatorio[] = [];
  for (const alvo of alvos) {
    const { asset, userId } = alvo;
    const pct = duasCasas(Number(alvo.targetPct));
    const base = { userId, ticker: asset.symbol, targetPct: pct };

    const posicao = await prisma.portfolio.findFirst({ where: { userId, assetId: asset.id } });
    if (posicao) {
      if (posicao.objetivo > 0) {
        relatorio.push({
          ...base,
          resultado: posicao.objetivo === pct ? 'ja_igual' : 'conflito',
          detalhe: `posição já tem objetivo ${posicao.objetivo}%`,
        });
        continue;
      }
      if (aplicar) {
        await prisma.portfolio.update({ where: { id: posicao.id }, data: { objetivo: pct } });
      }
      relatorio.push({
        ...base,
        resultado: 'posicao_atualizada',
        detalhe: `Portfolio ${posicao.id}`,
      });
      continue;
    }

    const planejado = await prisma.watchlist.findFirst({ where: { userId, assetId: asset.id } });
    if (planejado) {
      if (planejado.objetivo > 0) {
        relatorio.push({
          ...base,
          resultado: planejado.objetivo === pct ? 'ja_igual' : 'conflito',
          detalhe: `planejado já tem objetivo ${planejado.objetivo}%`,
        });
        continue;
      }
      if (aplicar) {
        await prisma.watchlist.update({ where: { id: planejado.id }, data: { objetivo: pct } });
      }
      relatorio.push({
        ...base,
        resultado: 'planejado_atualizado',
        detalhe: `Watchlist ${planejado.id} (seção ${planejado.secao ?? '—'})`,
      });
      continue;
    }

    const aba = abaDoAssetPlanejado(asset);
    if (!aba) {
      relatorio.push({ ...base, resultado: 'sem_aba', detalhe: `Asset.type ${asset.type}` });
      continue;
    }
    // Seção como a Análise escolheria (ação → value; FII pelo tipo); fora da aba → 1ª da aba.
    const q = quadroPorTicker.get(asset.symbol);
    const classe: ClasseQuadro = (q?.classe ??
      (asset.type === 'fii' ? 'fii' : 'acao')) as ClasseQuadro;
    const sugerida = secaoOperacao({
      classe: SECOES_OPERACAO[classe] ? classe : 'acao',
      posicao: null,
      planejado: null,
      tipoCvm: classe === 'fii' ? tipoCvmDaLinha(q?.fiiTipo, q?.perfilCriterios) : null,
    }).valor;
    const secoes = SECOES_POR_ABA[aba];
    const secao =
      secoes.length === 0 ? null : sugerida && secoes.includes(sugerida) ? sugerida : secoes[0];
    if (aplicar) {
      await prisma.watchlist.create({
        data: { userId, assetId: asset.id, objetivo: pct, secao, notes: null },
      });
    }
    relatorio.push({
      ...base,
      resultado: 'planejado_criado',
      detalhe: `aba ${aba}, seção ${secao ?? '—'}`,
    });
  }
  return relatorio;
}

async function main() {
  const aplicar = arg('apply') === 'true';
  console.log(
    `=== planning_asset_targets → Objetivo da Carteira (${aplicar ? 'APPLY' : 'dry-run'}) ===`,
  );
  const relatorio = await migrarAlvosParaObjetivo({ aplicar, usuario: arg('usuario') });
  for (const l of relatorio) {
    console.log(
      `${l.userId}  ${l.ticker.padEnd(8)} ${String(l.targetPct).padStart(7)}%  ${l.resultado.padEnd(
        21,
      )} ${l.detalhe}`,
    );
  }
  const contagem = relatorio.reduce<Record<string, number>>((acc, l) => {
    acc[l.resultado] = (acc[l.resultado] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n${relatorio.length} alvo(s):`, contagem);
  if ((contagem.conflito ?? 0) > 0) {
    console.log('CONFLITOS não foram alterados: o Objetivo da Carteira já definido foi mantido.');
  }
  if (!aplicar) console.log('dry-run: nada gravado (use --apply para gravar).');
}

if (process.argv[1]?.endsWith('migrar-alvos-para-objetivo.ts')) {
  main()
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
