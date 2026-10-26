/**
 * Payload real do GET v2 para os testes de componente: o Anexo B (out/2026, dia 23, receita
 * 24.000) montado pelas MESMAS funções do servidor (`montarOrcamentoV2`), para que os números da
 * spec (T05, T06, T15…) saiam do payload e não de um mock escrito à mão.
 */
import {
  montarOrcamentoV2,
  type EntradaMontagem,
} from '@/services/cashflow/orcamentoV2/montarOrcamento';
import {
  calcularReceitaPrevista,
  entradasLancadas,
} from '@/services/cashflow/orcamentoV2/receitaPrevista';
import { ANEXO_B_HOJE } from '@/test/fixtures/orcamentoAnexoB';
import {
  ANEXO_B_ANO,
  ANEXO_B_MES0,
  arvoreAnexoB,
  orcadosAnexoB,
} from '@/test/fixtures/orcamentoAnexoBArvore';
import type { CashflowGroup } from '@/types/cashflow';
import type { CategoriaV2, OrcamentoV2Response, SubcategoriaV2 } from '@/types/orcamentoV2';

export const AGORA = new Date('2026-10-23T15:00:00.000Z');

export function montarPayload(over: Partial<EntradaMontagem> = {}): OrcamentoV2Response {
  const arvore: CashflowGroup[] = over.arvore ?? arvoreAnexoB();
  return montarOrcamentoV2({
    arvore,
    orcados: orcadosAnexoB(),
    receitaPorMes: calcularReceitaPrevista(ANEXO_B_ANO, entradasLancadas(arvore), null),
    ano: ANEXO_B_ANO,
    mes0: ANEXO_B_MES0,
    visao: 'mes',
    fonte: 'lancado',
    hojeSP: { ...ANEXO_B_HOJE },
    prefs: null,
    atualizadoEm: AGORA,
    ...over,
  });
}

export function categoriaDe(data: OrcamentoV2Response, nome: string): CategoriaV2 {
  const c = data.categorias.find((x) => x.nome === nome);
  if (!c) throw new Error(`categoria ${nome} ausente`);
  return c;
}

export function subDe(data: OrcamentoV2Response, cat: string, nome: string): SubcategoriaV2 {
  const s = categoriaDe(data, cat).subcategorias.find((x) => x.nome === nome);
  if (!s) throw new Error(`sub ${nome} ausente em ${cat}`);
  return s;
}
