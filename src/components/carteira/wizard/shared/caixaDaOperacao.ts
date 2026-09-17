/**
 * Prévia, na TELA, de como uma operação do assistente mexe no Caixa para
 * Investir: qual aba e quanto em R$. Serve só para os avisos antes de
 * confirmar — quem decide de verdade é o servidor (classifica o ativo já
 * resolvido com `categorizarAsset` e usa o valor gravado na transação).
 *
 * Espelha as regras de /api/carteira/operacao: valor calculado por tipo e
 * REIT cotado em US$ (convertido pela cotação informada).
 */
import type { CaixaAbaKey } from '@/lib/caixaParaInvestirPlano';
import type { WizardFormData } from '@/types/wizard';

type CompraForm = Pick<
  WizardFormData,
  | 'tipoAtivo'
  | 'quantidade'
  | 'cotacaoUnitaria'
  | 'cotacaoCompra'
  | 'cotacaoMoeda'
  | 'valorInvestido'
  | 'valorAplicado'
  | 'taxaCorretagem'
  | 'precoUnitario'
  | 'metodo'
  | 'fundoDestino'
  | 'tesouroDestino'
> & { acoesBrasilTipo?: string };

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Tipo como a API recebe (o assistente usa 'acoes-brasil' e 'reserva-*' na tela). */
const tipoDaApi = (form: CompraForm): string =>
  form.tipoAtivo === 'acoes-brasil' && form.acoesBrasilTipo ? form.acoesBrasilTipo : form.tipoAtivo;

const porCotas = (metodo: unknown) => metodo === 'cotas' || metodo === 'percentual';

/** Aba do caixa de uma COMPRA. `null` = sem reserva própria (usa só o livre). */
export function abaDaCompra(form: CompraForm): CaixaAbaKey | null {
  switch (tipoDaApi(form)) {
    case 'acao':
    case 'bdr':
      return 'acoes';
    case 'fii':
      return 'fii';
    case 'etf':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'stock':
      return 'stocks';
    case 'criptoativo':
    case 'moeda':
      return 'moedasCriptos';
    case 'opcoes':
      return 'opcoes';
    case 'previdencia':
      return 'previdenciaSeguros';
    case 'fundo':
      if (
        form.fundoDestino === 'reserva-emergencia' ||
        form.fundoDestino === 'reserva-oportunidade'
      )
        return null;
      if (form.fundoDestino === 'previdencia-seguros') return 'previdenciaSeguros';
      return 'fimFia';
    case 'tesouro-direto':
      if (
        form.tesouroDestino === 'reserva-emergencia' ||
        form.tesouroDestino === 'reserva-oportunidade'
      )
        return null;
      return 'rendaFixa';
    case 'renda-fixa':
    case 'renda-fixa-prefixada':
    case 'renda-fixa-posfixada':
    case 'renda-fixa-hibrida':
    case 'debenture':
    case 'poupanca':
      return 'rendaFixa';
    default:
      // reservas, conta corrente, imóvel, personalizado
      return null;
  }
}

/** Valor em R$ de uma COMPRA (mesmo cálculo da API). */
export function valorDaCompraBRL(form: CompraForm): number {
  const tipo = tipoDaApi(form);
  const qtd = n(form.quantidade);
  const cotacao = n(form.cotacaoUnitaria);
  switch (tipo) {
    case 'acao':
    case 'bdr':
    case 'fii':
    case 'etf':
    case 'opcoes':
      return qtd * cotacao + n(form.taxaCorretagem);
    case 'stock':
      return qtd * cotacao * n(form.cotacaoMoeda) + n(form.taxaCorretagem);
    case 'reit':
      return qtd * cotacao * n(form.cotacaoMoeda);
    case 'criptoativo':
    case 'moeda':
      return qtd * n(form.cotacaoCompra);
    case 'personalizado':
      return qtd * n(form.precoUnitario);
    case 'imovel':
      return n(form.precoUnitario);
    case 'conta-corrente':
    case 'poupanca':
    case 'renda-fixa':
    case 'renda-fixa-prefixada':
    case 'renda-fixa-posfixada':
    case 'renda-fixa-hibrida':
      return n(form.valorAplicado);
    case 'tesouro-direto':
    case 'debenture':
    case 'fundo':
    case 'previdencia':
      return porCotas(form.metodo) && qtd > 0 && cotacao > 0
        ? qtd * cotacao
        : n(form.valorInvestido);
    default:
      // reserva-emergencia / reserva-oportunidade
      return n(form.valorInvestido);
  }
}

/**
 * Aba do caixa de um APORTE. O tipo vem de /api/carteira/aporte/tipos
 * (mapPortfolioToTipo): só ativos de valor chegam aqui.
 */
export function abaDoAporte(tipoAtivo: string): CaixaAbaKey | null {
  if (tipoAtivo === 'renda-fixa' || tipoAtivo.startsWith('renda-fixa-')) return 'rendaFixa';
  if (tipoAtivo === 'previdencia') return 'previdenciaSeguros';
  return null;
}
