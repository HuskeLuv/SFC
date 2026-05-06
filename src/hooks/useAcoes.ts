import { useAssetData } from './useAssetData';
import { AcaoData, AcaoAtivo, AcaoSecao } from '@/types/acoes';

export const useAcoes = () => {
  const assetData = useAssetData<AcaoData>({
    apiPath: '/api/carteira/acoes',
    objetivoPath: '/api/carteira/acoes/objetivo',
    label: 'Ações',
  });

  const calculateAtivoValues = (
    ativo: Partial<AcaoAtivo>,
    totalCarteiraAcoes: number,
    _totalCarteiraGeral: number,
  ): AcaoAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;

    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo =
      totalCarteiraAcoes > 0 ? Math.min(100, (valorAtualizado / totalCarteiraAcoes) * 100) : 0;
    const percentualCarteira =
      totalCarteiraAcoes > 0 ? (valorAtualizado / totalCarteiraAcoes) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte =
      totalCarteiraAcoes > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalCarteiraAcoes : 0;
    const rentabilidade =
      precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      setor: ativo.setor || 'outros',
      subsetor: ativo.subsetor || '',
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
    secao: AcaoSecao,
    totalCarteiraAcoes: number,
    totalCarteiraGeral: number,
  ): AcaoSecao => {
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
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
