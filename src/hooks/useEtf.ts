import { useAssetData } from './useAssetData';
import { EtfData, EtfAtivo, EtfSecao } from '@/types/etf';

export const useEtf = () => {
  const assetData = useAssetData<EtfData>({
    apiPath: '/api/carteira/etf',
    objetivoPath: '/api/carteira/etf/objetivo',
    cotacaoPath: '/api/carteira/etf/cotacao',
    label: 'ETF',
  });

  const calculateAtivoValues = (
    ativo: Partial<EtfAtivo>,
    totalCarteiraEtf: number,
    _totalCarteiraGeral: number,
  ): EtfAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;

    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo =
      totalCarteiraEtf > 0 ? Math.min(100, (valorAtualizado / totalCarteiraEtf) * 100) : 0;
    const percentualCarteira =
      totalCarteiraEtf > 0 ? (valorAtualizado / totalCarteiraEtf) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte =
      totalCarteiraEtf > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalCarteiraEtf : 0;
    const rentabilidade =
      precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      indiceRastreado: ativo.indiceRastreado || 'outros',
      regiao: ativo.regiao || 'brasil',
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
      observacoes: ativo.observacoes,
      dataUltimaAtualizacao: ativo.dataUltimaAtualizacao,
    };
  };

  const calculateSecaoValues = (
    secao: EtfSecao,
    totalCarteiraEtf: number,
    totalCarteiraGeral: number,
  ): EtfSecao => {
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
    updateCotacao: assetData.updateCotacao as (
      ativoId: string,
      novaCotacao: number,
    ) => Promise<boolean>,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
