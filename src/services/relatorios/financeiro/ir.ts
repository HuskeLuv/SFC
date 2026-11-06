/**
 * Seção 8 (IR a restituir) do Relatório financeiro: bloco completo no Advanced e o gancho do
 * cartão de cadeado no Basic e no Pro.
 *
 * STUB da fatia F0: a fatia F2 preenche os corpos. As assinaturas são o contrato com
 * montarRelatorio.
 */
import type { BlocoIr, IrGancho } from '@/types/relatorioFinanceiro';
import type { ContextoMontador } from './insumos';
import { anoIr } from './periodo';

const SIMULACAO_VAZIA: BlocoIr['simulacao'] = {
  completo: {
    deducoes: 0,
    baseCalculo: 0,
    impostoTabela: 0,
    redutor: 0,
    doacoes: 0,
    irDevido: 0,
    aliquotaMarginal: 0,
    aliquotaEfetiva: 0,
  },
  simplificado: {
    deducoes: 0,
    baseCalculo: 0,
    impostoTabela: 0,
    redutor: 0,
    doacoes: 0,
    irDevido: 0,
    aliquotaMarginal: 0,
    aliquotaEfetiva: 0,
  },
  deducoesCompleto: {
    inss: 0,
    pgbl: 0,
    dependentes: 0,
    saude: 0,
    educacao: 0,
    pensaoJudicial: 0,
    livroCaixa: 0,
    total: 0,
  },
  descontoSimplificado: 0,
  melhorModelo: 'simplificado',
  irDevido: 0,
  economiaCompletoVsSimplificado: 0,
  saldoAjuste: 0,
  limiteDoacoes: 0,
  avisos: { redutorAplicado: false, irpfmPossivel: false },
};

export async function montarIr(ctx: ContextoMontador): Promise<BlocoIr> {
  const { ano, encerrado, diasAte3112 } = anoIr(ctx.agora);
  return {
    ano,
    encerrado,
    rendaTributavel: 0,
    rendaPartes: [],
    rendaOrigem: 'lancado',
    limite12: 0,
    aportado: 0,
    nAportes: 0,
    economia: 0,
    economiaMaxima: 0,
    faltaNoLimite: 0,
    economiaFalta: 0,
    diasAte3112,
    simulacao: SIMULACAO_VAZIA,
    retidoNaFonte: null,
    restituicaoProjetada: null,
    condicoes: [],
    planos: [],
    deducoes: [],
  };
}

export async function montarIrGancho(ctx: ContextoMontador): Promise<IrGancho> {
  const { ano, encerrado, diasAte3112 } = anoIr(ctx.agora);
  return {
    ano,
    encerrado,
    rendaTributavel: 0,
    rendaOrigem: 'lancado',
    economiaMaxima: 0,
    diasAte3112,
  };
}
