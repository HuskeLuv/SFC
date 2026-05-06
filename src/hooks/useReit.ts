import { useAssetData } from './useAssetData';
import { ReitData, ReitAtivo, ReitSecao } from '@/types/reit';

export const useReit = () => {
  const assetData = useAssetData<ReitData>({
    apiPath: '/api/carteira/reit',
    objetivoPath: '/api/carteira/reit/objetivo',
    valorAtualizadoPath: '/api/carteira/reit',
    label: 'REIT',
    currency: 'USD',
  });

  const calculateAtivoValues = (
    ativo: Partial<ReitAtivo>,
    totalCarteiraReit: number,
    _totalCarteiraGeral: number,
  ): ReitAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;

    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo =
      totalCarteiraReit > 0 ? Math.min(100, (valorAtualizado / totalCarteiraReit) * 100) : 0;
    const percentualCarteira =
      totalCarteiraReit > 0 ? (valorAtualizado / totalCarteiraReit) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte =
      totalCarteiraReit > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalCarteiraReit : 0;
    const rentabilidade =
      precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      setor: ativo.setor || 'other',
      quantidade,
      precoAquisicao,
      valorTotal,
      cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo,
      percentualCarteira,
      objetivo,
      quantoFalta,
      necessidadeAporte,
      rentabilidade,
      estrategia: ativo.estrategia || 'value',
      observacoes: ativo.observacoes,
      dataUltimaAtualizacao: ativo.dataUltimaAtualizacao,
    };
  };

  const calculateSecaoValues = (
    secao: ReitSecao,
    totalCarteiraReit: number,
    totalCarteiraGeral: number,
  ): ReitSecao => {
    const totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorAtualizado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    const totalPercentualCarteira =
      totalCarteiraGeral > 0 ? (totalValorAtualizado / totalCarteiraGeral) * 100 : 0;
    const totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.necessidadeAporte,
      0,
    );
    const rentabilidadeMedia =
      secao.ativos.length > 0
        ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0;

    return {
      ...secao,
      totalQuantidade,
      totalValorAplicado,
      totalValorAtualizado,
      totalPercentualCarteira,
      totalRisco,
      totalObjetivo,
      totalQuantoFalta,
      totalNecessidadeAporte,
      rentabilidadeMedia,
    };
  };

  return {
    ...assetData,
    updateObjetivo: assetData.updateObjetivo as (
      ativoId: string,
      novoObjetivo: number,
    ) => Promise<boolean>,
    updateValorAtualizado: assetData.updateValorAtualizado as (
      ativoId: string,
      novoValor: number,
    ) => Promise<boolean>,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
