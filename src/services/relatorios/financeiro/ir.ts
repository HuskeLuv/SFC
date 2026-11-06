/**
 * Seção 8 (IR a restituir) do Relatório financeiro: bloco completo no Advanced e o gancho do
 * cartão de cadeado no Basic e no Pro.
 *
 *  - Ano: o corrente em SP; sem regra cadastrada (ex.: janeiro de 2027), o último ano com regra,
 *    encerrado (anoIr). Independe do período do relatório.
 *  - Entradas: a simulação salva da aba PGBL (irPgblSimulacao); a renda tributável, a saúde e a
 *    educação, quando o campo não foi preenchido, vêm do lançado no fluxo de caixa até hoje
 *    (sugerirDoFluxo, a mesma regra do botão "Preencher com o fluxo de caixa"; projeção fora da
 *    v1).
 *  - Previdência: pgblDoAno (os planos da carteira) + tipoDoPlano (marcação salva ou palpite pelo
 *    nome); só os planos PGBL contam.
 *  - Cálculo: simularIrpfAnual com as regras do ano (redutor da Lei 15.270 e o aviso de IRPFM).
 *    Restituição = saldoAjuste, sem o IR de Stocks EUA.
 *  - Gancho (Basic/Pro): economiaPotencial da mesma simulação sem contribuições e com INSS
 *    presumido (no lugar de 12% × alíquota, que prometia restituição a quem tem IR zero pelo
 *    redutor). Nenhum detalhe do mecanismo vai para o Basic/Pro.
 *
 * Só leitura. Os textos estáticos do Pedro ficam no front (adv/SecaoIrConteudo).
 */
import { prisma } from '@/lib/prisma';
import type {
  BlocoIr,
  CondicaoIrRelatorio,
  DeducaoIrRelatorio,
  IrGancho,
  LinhaBalancoRelatorio,
  OrigemRendaIr,
  PlanoPrevidenciaRelatorio,
} from '@/types/relatorioFinanceiro';
import type { CashflowGroup } from '@/types/cashflow';
import type { CashGroupLike } from '@/services/cashflow/linhasEditaveis';
import {
  regrasIrpfDoAno,
  simularIrpfAnual,
  type EntradaIrpfAnual,
  type ResultadoIrpfAnual,
} from '@/services/ir/irpfAnual';
import { sugerirDoFluxo, type SugestaoFluxoIr } from '@/services/ir/sugestaoFluxoIr';
import { pgblDoAno, type PlanoPrevidenciaIR } from '@/services/ir/pgblDoAno';
import { tipoDoPlano, type TipoPlanoMarcado } from '@/services/ir/tipoPlanoPrevidencia';
import { entradaDosCampos } from '@/components/analises/ir/pgblResumo';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import { fR, fR0 } from '@/components/relatorios/financeiro/formato';
import type { ContextoMontador } from './insumos';
import { anoIr } from './periodo';

/**
 * INSS presumido do gancho quando o usuário não informou: só torna a previdência elegível na
 * simulação (R$ 0,01 não muda a base de forma visível).
 */
export const INSS_PRESUMIDO_GANCHO = 0.01;

const round2 = (v: number) => Math.round(v * 100) / 100;

type Campos = Record<string, string | undefined>;

interface PlanoSalvo {
  tipo?: TipoPlanoMarcado;
  regime?: 'progressivo' | 'regressivo';
}

interface SimulacaoSalva {
  campos: Campos;
  planos: Record<string, PlanoSalvo>;
}

async function lerSimulacao(userId: string, ano: number): Promise<SimulacaoSalva> {
  const row = await prisma.irPgblSimulacao.findUnique({
    where: { userId_ano: { userId, ano } },
    select: { campos: true, planos: true },
  });
  const campos =
    row?.campos && typeof row.campos === 'object' && !Array.isArray(row.campos)
      ? (row.campos as Campos)
      : {};
  const planos =
    row?.planos && typeof row.planos === 'object' && !Array.isArray(row.planos)
      ? (row.planos as Record<string, PlanoSalvo>)
      : {};
  return { campos, planos };
}

/** Árvore do fluxo só com os valores até `mesMax` (0–11), para "lançado até hoje". */
export function recortarArvoreAte(groups: CashGroupLike[], mesMax: number): CashGroupLike[] {
  return groups.map((g) => ({
    ...g,
    items: g.items?.map((it) => ({
      ...it,
      values: it.values?.filter((v) => typeof v.month === 'number' && v.month <= mesMax),
    })),
    children: g.children ? recortarArvoreAte(g.children, mesMax) : g.children,
  }));
}

/** Campo da simulação como número; vazio/ilegível = null (não preenchido). */
const campoNum = (campos: Campos, id: string): number | null => {
  const bruto = campos[id];
  if (bruto === undefined || bruto.trim() === '') return null;
  return parseCurrencyInput(bruto);
};

interface EntradasIr {
  ano: number;
  encerrado: boolean;
  diasAte3112: number | null;
  sim: SimulacaoSalva;
  sugestao: SugestaoFluxoIr | null;
  /** Valores do fluxo que substituem os campos salvos vazios (renda, saúde, educação). */
  doFluxo: Partial<Pick<EntradaIrpfAnual, 'rendaTributavel' | 'saude' | 'educacao'>>;
  rendaOrigem: OrigemRendaIr;
  rendaPartes: LinhaBalancoRelatorio[];
}

async function carregarEntradas(ctx: ContextoMontador): Promise<EntradasIr> {
  const { ano, encerrado, diasAte3112 } = anoIr(ctx.agora);
  const [sim, arvore] = await Promise.all([
    lerSimulacao(ctx.userId, ano),
    ctx.insumos.cashflowDoAno(ano).catch((): CashflowGroup[] | null => null),
  ]);
  // Ano corrente: só o lançado até o mês de hoje (em SP); ano encerrado: o ano inteiro.
  const sugestao = arvore
    ? sugerirDoFluxo(
        ano === ctx.hojeSP.ano
          ? recortarArvoreAte(arvore as unknown as CashGroupLike[], ctx.hojeSP.mes0)
          : (arvore as unknown as CashGroupLike[]),
      )
    : null;

  const doFluxo: EntradasIr['doFluxo'] = {};
  const rendaSalva = campoNum(sim.campos, 'rendaTributavel');
  let rendaOrigem: OrigemRendaIr = 'simulacao';
  let rendaPartes: LinhaBalancoRelatorio[] = [];
  if (rendaSalva === null || rendaSalva <= 0) {
    rendaOrigem = 'lancado';
    doFluxo.rendaTributavel = sugestao?.rendaTributavel.total ?? 0;
    const porLinha = new Map<string, number>();
    for (const l of sugestao?.rendaTributavel.linhas ?? []) {
      porLinha.set(l.linha, (porLinha.get(l.linha) ?? 0) + l.total);
    }
    rendaPartes = [...porLinha.entries()]
      .map(([nome, valor]) => ({ nome, valor: round2(valor) }))
      .sort((a, b) => b.valor - a.valor);
  }
  for (const id of ['saude', 'educacao'] as const) {
    if (campoNum(sim.campos, id) === null && sugestao && sugestao[id].total > 0) {
      doFluxo[id] = sugestao[id].total;
    }
  }
  return { ano, encerrado, diasAte3112, sim, sugestao, doFluxo, rendaOrigem, rendaPartes };
}

const marcasDe = (planos: Record<string, PlanoSalvo>): Record<string, TipoPlanoMarcado> => {
  const out: Record<string, TipoPlanoMarcado> = {};
  for (const [id, p] of Object.entries(planos)) if (p?.tipo) out[id] = p.tipo;
  return out;
};

const REGIME_ROTULO = { progressivo: 'Progressivo', regressivo: 'Regressivo' } as const;

function condicoesIr(
  e: EntradasIr,
  entrada: EntradaIrpfAnual,
  r: ResultadoIrpfAnual,
  planos: PlanoPrevidenciaIR[],
  pgbl: PlanoPrevidenciaIR[],
  marcas: Record<string, TipoPlanoMarcado>,
): CondicaoIrRelatorio[] {
  const out: CondicaoIrRelatorio[] = [];
  const deducoes = fR(r.deducoesCompleto.total);
  const simpl = fR(r.descontoSimplificado);
  out.push(
    r.melhorModelo === 'completo'
      ? {
          chave: 'modeloCompleto',
          status: 'good',
          titulo: 'Declaração pelo modelo completo',
          descricao: `Suas deduções somam ${deducoes}, acima do desconto simplificado de ${simpl}.`,
        }
      : {
          chave: 'modeloCompleto',
          status: 'warn',
          titulo: 'Declaração pelo modelo simplificado',
          descricao: `Suas deduções somam ${deducoes}, abaixo do desconto simplificado de ${simpl}. No simplificado, o PGBL não reduz o IR.`,
        },
  );
  out.push(
    entrada.inss > 0
      ? {
          chave: 'inss',
          status: 'good',
          titulo: 'Contribuição ao INSS no ano',
          descricao: `${fR(entrada.inss)} informados na aba PGBL. Exigência para deduzir o PGBL.`,
        }
      : {
          chave: 'inss',
          status: 'warn',
          titulo: 'Informe o INSS na aba PGBL',
          descricao:
            'Sem contribuição ao INSS (ou a regime próprio) o PGBL não é dedutível, e a economia fica em zero.',
        },
  );
  const semTipo = planos.filter((p) => tipoDoPlano(p, marcas) === null).length;
  if (planos.length === 0) {
    out.push({
      chave: 'tipoPlano',
      status: 'info',
      titulo: 'Nenhum plano de previdência na carteira',
      descricao: 'Cadastre o plano em Previdência e Seguros para o relatório somar os aportes.',
    });
  } else if (semTipo > 0) {
    out.push({
      chave: 'tipoPlano',
      status: 'warn',
      titulo: 'Confirme se o plano é PGBL ou VGBL',
      descricao: `${semTipo} ${semTipo > 1 ? 'planos sem tipo definido' : 'plano sem tipo definido'}: marque na aba PGBL. VGBL não é dedutível.`,
    });
  } else if (pgbl.length > 0) {
    out.push({
      chave: 'tipoPlano',
      status: 'good',
      titulo: 'Plano é PGBL, não VGBL',
      descricao: `${pgbl.length} ${pgbl.length > 1 ? 'planos cadastrados' : 'plano cadastrado'} como PGBL. VGBL não é dedutível e entra em Bens e Direitos.`,
    });
  } else {
    out.push({
      chave: 'tipoPlano',
      status: 'warn',
      titulo: 'Nenhum plano PGBL',
      descricao: 'Os planos da carteira estão marcados como VGBL, que não é dedutível.',
    });
  }
  if (e.encerrado) {
    out.push({
      chave: 'prazo',
      status: 'info',
      titulo: `Ano-calendário ${e.ano} encerrado`,
      descricao: 'Os aportes do ano já não podem ser feitos; vale o que foi processado até 31/12.',
    });
  } else if (r.pgbl.espacoRestante > 0) {
    out.push({
      chave: 'prazo',
      status: 'warn',
      titulo: `Aportes até 31/12/${e.ano}`,
      descricao: `Ainda há ${fR0(r.pgbl.espacoRestante)} de espaço no limite de 12%.`,
    });
  } else {
    out.push({
      chave: 'prazo',
      status: 'good',
      titulo: 'Limite de 12% completo',
      descricao: 'Os aportes do ano já alcançaram o limite dedutível.',
    });
  }
  const regimes = [
    ...new Set(pgbl.map((p) => e.sim.planos[p.assetId]?.regime).filter((x) => x !== undefined)),
  ];
  if (pgbl.length > 0) {
    if (regimes.length === 0) {
      out.push({
        chave: 'regime',
        status: 'info',
        titulo: 'Regime de tributação não informado',
        descricao: 'Marque o regime de cada plano na aba PGBL.',
      });
    } else if (regimes.length === 1 && regimes[0] === 'regressivo') {
      out.push({
        chave: 'regime',
        status: 'info',
        titulo: 'Regime de tributação: regressivo',
        descricao:
          'Alíquota cai de 35% para 10% após 10 anos. A opção pode ser feita até o primeiro resgate.',
      });
    } else if (regimes.length === 1) {
      out.push({
        chave: 'regime',
        status: 'info',
        titulo: 'Regime de tributação: progressivo',
        descricao:
          'No resgate vale a tabela progressiva, com 15% retidos na fonte. A opção pode ser feita até o primeiro resgate.',
      });
    } else {
      out.push({
        chave: 'regime',
        status: 'info',
        titulo: 'Regimes de tributação: regressivo e progressivo',
        descricao:
          'Os planos têm regimes diferentes. A opção pode ser feita até o primeiro resgate.',
      });
    }
  }
  if (r.avisos.redutorAplicado) {
    const redutor = r.melhorModelo === 'completo' ? r.completo.redutor : r.simplificado.redutor;
    out.push({
      chave: 'redutor',
      status: 'info',
      titulo: 'Redutor da Lei 15.270/2025',
      descricao: `Com renda tributável até R$ 88.200, o redutor de ${fR(redutor)} já diminui o imposto e o benefício pode ser menor.`,
    });
  }
  if (r.avisos.irpfmPossivel) {
    out.push({
      chave: 'irpfm',
      status: 'warn',
      titulo: 'Renda acima de R$ 600 mil',
      descricao:
        'O IRPFM (Lei 15.270/2025) pode neutralizar a dedução; ele não entra nesta estimativa.',
    });
  }
  return out;
}

function deducoesIr(entrada: EntradaIrpfAnual, r: ResultadoIrpfAnual): DeducaoIrRelatorio[] {
  const d = r.deducoesCompleto;
  const dep = Math.max(0, Math.floor(entrada.dependentes));
  return [
    { chave: 'saude', valor: d.saude, nota: null },
    {
      chave: 'educacao',
      valor: d.educacao,
      nota: entrada.educacao > d.educacao + 0.005 ? 'teto atingido' : null,
    },
    {
      chave: 'dependentes',
      valor: d.dependentes,
      nota: dep > 0 ? `${dep} ${dep > 1 ? 'cadastrados' : 'cadastrado'}` : null,
    },
    { chave: 'previdencia', valor: round2(d.inss + d.pgbl), nota: null },
    { chave: 'pensao', valor: d.pensaoJudicial, nota: null },
    { chave: 'livroCaixa', valor: d.livroCaixa, nota: null },
    {
      chave: 'doacoes',
      valor: r.completo.doacoes,
      nota: r.limiteDoacoes > 0 ? `limite est. ${fR(r.limiteDoacoes)}` : null,
    },
  ];
}

const recorteSimulacao = (r: ResultadoIrpfAnual): BlocoIr['simulacao'] => ({
  completo: r.completo,
  simplificado: r.simplificado,
  deducoesCompleto: r.deducoesCompleto,
  descontoSimplificado: r.descontoSimplificado,
  melhorModelo: r.melhorModelo,
  irDevido: r.irDevido,
  economiaCompletoVsSimplificado: r.economiaCompletoVsSimplificado,
  saldoAjuste: r.saldoAjuste,
  limiteDoacoes: r.limiteDoacoes,
  avisos: r.avisos,
});

export async function montarIr(ctx: ContextoMontador): Promise<BlocoIr> {
  const [e, planosIr] = await Promise.all([
    carregarEntradas(ctx),
    pgblDoAno(ctx.userId, anoIr(ctx.agora).ano),
  ]);
  const regras = regrasIrpfDoAno(e.ano)!;
  const marcas = marcasDe(e.sim.planos);
  const pgbl = planosIr.filter((p) => tipoDoPlano(p, marcas) === 'pgbl');
  const aportesCarteira = round2(pgbl.reduce((s, p) => s + p.aportesTotal, 0));
  const entrada: EntradaIrpfAnual = {
    ...entradaDosCampos(e.sim.campos, aportesCarteira),
    ...e.doFluxo,
  };
  const r = simularIrpfAnual(entrada, regras);

  const planos: PlanoPrevidenciaRelatorio[] = pgbl.map((p) => {
    const regime = e.sim.planos[p.assetId]?.regime;
    return {
      id: p.assetId,
      nome: p.nome,
      seguradora: null,
      cnpj: p.cnpj,
      regime: regime ? REGIME_ROTULO[regime] : null,
      tipo: 'pgbl',
      nAportes: p.aportesQuantidade,
      totalAno: p.aportesTotal,
      saldoAtual: p.saldoAtual,
    };
  });
  const retido = entrada.irRetido > 0 ? round2(entrada.irRetido) : null;

  return {
    ano: e.ano,
    encerrado: e.encerrado,
    rendaTributavel: round2(entrada.rendaTributavel),
    rendaPartes: e.rendaPartes,
    rendaOrigem: e.rendaOrigem,
    limite12: r.pgbl.limiteDedutivel,
    aportado: round2(entrada.aportesPgbl),
    nAportes: pgbl.reduce((s, p) => s + p.aportesQuantidade, 0),
    economia: r.pgbl.economiaAtual,
    economiaMaxima: r.pgbl.economiaPotencial,
    faltaNoLimite: r.pgbl.espacoRestante,
    economiaFalta: r.pgbl.economiaAdicional,
    diasAte3112: e.diasAte3112,
    simulacao: recorteSimulacao(r),
    retidoNaFonte: retido,
    restituicaoProjetada: retido === null ? null : r.saldoAjuste,
    condicoes: condicoesIr(e, entrada, r, planosIr, pgbl, marcas),
    planos,
    deducoes: deducoesIr(entrada, r),
  };
}

/** Economia potencial do gancho (puro): sem contribuições, com INSS presumido se não informado. */
export function economiaPotencialGancho(
  entrada: EntradaIrpfAnual,
  regras: NonNullable<ReturnType<typeof regrasIrpfDoAno>>,
): number {
  const r = simularIrpfAnual(
    {
      ...entrada,
      aportesPgbl: 0,
      inss: entrada.inss > 0 ? entrada.inss : INSS_PRESUMIDO_GANCHO,
    },
    regras,
  );
  return r.pgbl.economiaPotencial;
}

export async function montarIrGancho(ctx: ContextoMontador): Promise<IrGancho> {
  const e = await carregarEntradas(ctx);
  const regras = regrasIrpfDoAno(e.ano)!;
  const entrada: EntradaIrpfAnual = { ...entradaDosCampos(e.sim.campos, 0), ...e.doFluxo };
  return {
    ano: e.ano,
    encerrado: e.encerrado,
    rendaTributavel: round2(entrada.rendaTributavel),
    rendaOrigem: e.rendaOrigem,
    economiaMaxima: economiaPotencialGancho(entrada, regras),
    diasAte3112: e.diasAte3112,
  };
}
